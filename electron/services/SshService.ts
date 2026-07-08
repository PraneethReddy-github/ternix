import crypto from 'node:crypto'
import { Client, type ClientChannel, type ConnectConfig } from 'ssh2'
import type { Session, CredentialResponse } from '@shared/index'
import { ConnectionManager, type TerminalBackend } from './ConnectionManager'
import { sessionsRepo, keysRepo, knownHostsRepo, settingsRepo } from '../db/repo'
import { Bus } from './bus'

interface PendingHostKey {
  resolve: (ok: boolean) => void
  host: string
  port: number
  keyType: string
  fingerprint: string
  rawKey: string
  changed: boolean
}
interface PendingKbi {
  finish: (responses: string[]) => void
}
interface PendingCredentials {
  resolve: (r: CredentialResponse) => void
}

export interface SshHandle extends TerminalBackend {
  client: Client
  channel: ClientChannel
}

/** SHA256 fingerprint string in the OpenSSH display format. */
export function fingerprintOf(key: Buffer): string {
  const hash = crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
  return `SHA256:${hash}`
}

class SshServiceImpl {
  private pendingHostKey = new Map<string, PendingHostKey>()
  private pendingKbi = new Map<string, PendingKbi>()
  private pendingCredentials = new Map<string, PendingCredentials>()

  /** Renderer → main response for a host-key prompt. */
  respondHostKey(tabId: string, decision: 'accept' | 'always' | 'reject'): void {
    const p = this.pendingHostKey.get(tabId)
    if (!p) return
    this.pendingHostKey.delete(tabId)
    if (decision === 'reject') {
      p.resolve(false)
      return
    }
    if (decision === 'always') {
      knownHostsRepo.upsert(p.host, p.port, p.keyType, p.fingerprint, p.rawKey)
    }
    p.resolve(true)
  }

  respondKbi(tabId: string, responses: string[]): void {
    const p = this.pendingKbi.get(tabId)
    if (!p) return
    this.pendingKbi.delete(tabId)
    p.finish(responses)
  }

  /** Renderer → main response for the credential picker modal. */
  respondCredentials(tabId: string, response: CredentialResponse): void {
    const p = this.pendingCredentials.get(tabId)
    if (!p) return
    this.pendingCredentials.delete(tabId)
    p.resolve(response)
  }

  /** Establish a full SSH session bound to a tab (handles jump-host chains). */
  async spawn(tabId: string, session: Session, cols: number, rows: number): Promise<{ backend: SshHandle; banner?: string }> {
    ConnectionManager.pushStatus(tabId, 'connecting', `Connecting to ${session.host}…`)

    // ── Credential check ────────────────────────────────────────────────────
    // If the session has no stored password or no linked SSH key, show the
    // GUI credential picker before attempting any network connection.
    const secrets = sessionsRepo.getSecrets(session.id)
    const needsCreds =
      (session.auth_type === 'password' && !secrets.password) ||
      (session.auth_type === 'key' && !session.ssh_key_id)

    // Holds one-time override credentials for this connection only.
    let onetimePassword: string | null = null
    let onetimeKeyId: number | null = null

    if (needsCreds) {
      ConnectionManager.pushStatus(tabId, 'connecting', 'Waiting for credentials…')
      const vaultKeys = keysRepo.list().map((k) => ({
        id: k.id, name: k.name, key_type: k.key_type, fingerprint: k.fingerprint
      }))
      const response = await new Promise<CredentialResponse>((resolve) => {
        this.pendingCredentials.set(tabId, { resolve })
        Bus.emit('terminal:needs-credentials', {
          tabId,
          sessionId: session.id,
          sessionName: session.name,
          host: session.host,
          username: session.username,
          vaultKeys
        })
      })

      if (response.type === 'cancel') {
        throw new Error('Connection cancelled by user.')
      }

      if (response.type === 'password') {
        onetimePassword = response.password
        session.auth_type = 'password'
      } else if (response.type === 'key') {
        onetimeKeyId = response.keyId
        session.auth_type = 'key'
      }

      ConnectionManager.pushStatus(tabId, 'connecting', `Connecting to ${session.host}…`)
    }
    // ────────────────────────────────────────────────────────────────────────

    const client = await this.connectChain(tabId, session, onetimePassword, onetimeKeyId)

    const channel = await new Promise<ClientChannel>((resolve, reject) => {
      client.shell(
        {
          term: 'xterm-256color',
          cols,
          rows,
          modes: {}
        },
        (err, ch) => (err ? reject(err) : resolve(ch))
      )
    })

    channel.on('data', (d: Buffer) => ConnectionManager.pushData(tabId, d.toString('utf8')))
    channel.stderr.on('data', (d: Buffer) => ConnectionManager.pushData(tabId, d.toString('utf8')))
    channel.on('close', () => {
      ConnectionManager.pushExit(tabId, 0, 'channel closed')
      client.end()
    })
    client.on('error', (err) => {
      ConnectionManager.pushStatus(tabId, 'error', err.message)
    })
    client.on('close', () => ConnectionManager.pushStatus(tabId, 'disconnected'))

    const backend: SshHandle = {
      protocol: 'ssh',
      client,
      channel,
      write: (data) => channel.write(data),
      resize: (c, r) => {
        try {
          channel.setWindow(r, c, 0, 0)
        } catch {
          /* ignore */
        }
      },
      kill: () => {
        try {
          channel.close()
        } catch {
          /* ignore */
        }
        client.end()
      },
      getSshClient: () => client,
      latency: () => this.ping(client)
    }

    // Run startup commands.
    if (session.startup_commands?.length) {
      for (const cmd of session.startup_commands) channel.write(cmd + '\n')
    }

    sessionsRepo.markConnected(session.id)
    ConnectionManager.pushStatus(tabId, 'connected')
    return { backend }
  }

  /** Recursively connect through any configured jump-host chain, returning the target client. */
  private async connectChain(tabId: string, session: Session, onetimePassword?: string | null, onetimeKeyId?: number | null): Promise<Client> {
    if (session.jump_host_id) {
      const jump = sessionsRepo.get(session.jump_host_id)
      if (!jump) throw new Error('Jump host session not found')
      const jumpClient = await this.connectChain(tabId, jump)
      const stream = await new Promise<NodeJS.ReadWriteStream>((resolve, reject) => {
        jumpClient.forwardOut('127.0.0.1', 0, session.host!, session.port ?? 22, (err, ch) =>
          err ? reject(err) : resolve(ch as unknown as NodeJS.ReadWriteStream)
        )
      })
      return this.connectOne(tabId, session, { sock: stream as any }, onetimePassword, onetimeKeyId)
    }
    return this.connectOne(tabId, session, {}, onetimePassword, onetimeKeyId)
  }

  private async connectOne(tabId: string, session: Session, extra: Partial<ConnectConfig>, onetimePassword?: string | null, onetimeKeyId?: number | null): Promise<Client> {
    const secrets = sessionsRepo.getSecrets(session.id)
    const config = this.buildConfig(tabId, session, secrets, extra, onetimePassword, onetimeKeyId)

    return new Promise<Client>((resolve, reject) => {
      const client = new Client()
      let settled = false

      // Our own connect deadline. ssh2's readyTimeout can't be paused, but an
      // interactive auth flow (e.g. Tailscale SSH's browser check) legitimately
      // takes longer than a handshake — so we cancel this the moment the server
      // sends a banner or keyboard-interactive prompt.
      const timer = setTimeout(() => {
        settled = true
        client.end()
        reject(new Error('Timed out while waiting for connection'))
      }, Number(settingsRepo.get('ssh.connectTimeout') ?? '20000'))
      const finishConnect = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn()
      }

      // Banners are sent DURING authentication, before 'ready'. Show them as they
      // arrive so prompts like Tailscale SSH's "visit this URL to authenticate"
      // appear in the terminal — and stop the clock, since auth is now interactive.
      client.on('banner', (msg: string) => {
        clearTimeout(timer)
        if (settingsRepo.get('ssh.showBanner') !== 'false') {
          ConnectionManager.pushData(tabId, msg.replace(/\r?\n/g, '\r\n'))
        }
      })

      client.on('keyboard-interactive', (_name, _instr, _lang, prompts, finish) => {
        clearTimeout(timer)
        // If a password is stored and the only prompt is a password, answer automatically.
        if (secrets.password && prompts.length === 1 && /password/i.test(prompts[0].prompt)) {
          finish([secrets.password])
          return
        }
        this.pendingKbi.set(tabId, { finish })
        Bus.emit('terminal:kbi', {
          tabId,
          name: _name,
          instructions: _instr,
          prompts: prompts.map((p) => ({ prompt: p.prompt, echo: p.echo }))
        })
      })

      client.on('ready', () => finishConnect(() => resolve(client)))
      client.on('error', (err) => finishConnect(() => reject(err)))

      client.connect(config)
    })
  }

  private buildConfig(
    tabId: string,
    session: Session,
    secrets: { password: string | null; passphrase: string | null },
    extra: Partial<ConnectConfig>,
    onetimePassword?: string | null,
    onetimeKeyId?: number | null
  ): ConnectConfig {
    const cfg: ConnectConfig = {
      host: session.host ?? undefined,
      port: session.port ?? 22,
      username: session.username || settingsRepo.get('ssh.defaultUsername') || undefined,
      keepaliveInterval: (session.keepalive_interval || 30) * 1000,
      keepaliveCountMax: session.keepalive_count_max || 3,
      readyTimeout: 0, // we run our own cancelable timer in connectOne (see there)
      tryKeyboard: true,
      hostVerifier: ((keyOrHash: Buffer, cb: (ok: boolean) => void) => {
        this.verifyHostKey(tabId, session, keyOrHash).then(cb).catch(() => cb(false))
      }) as any,
      ...extra
    }
    if (session.compression) (cfg as any).compress = true

    switch (session.auth_type) {
      case 'password':
        cfg.password = onetimePassword ?? secrets.password ?? undefined
        break
      case 'key': {
        const keyId = onetimeKeyId ?? session.ssh_key_id
        if (keyId) {
          const pem = keysRepo.getPrivate(keyId)
          if (!pem) throw new Error('Private key not found in vault')
          cfg.privateKey = pem
          if (secrets.passphrase) cfg.passphrase = secrets.passphrase
        }
        break
      }
      case 'agent':
        cfg.agent = settingsRepo.get('ssh.agentSock') || (process.platform === 'win32' ? 'pageant' : process.env.SSH_AUTH_SOCK)
        if (session.agent_forwarding) cfg.agentForward = true
        break
      case 'keyboard-interactive':
        break
      case 'none':
      default:
        break
    }
    return cfg
  }

  /** hostVerifier implementation — pins keys in the known_hosts table. */
  private async verifyHostKey(tabId: string, session: Session, keyOrHash: Buffer): Promise<boolean> {
    const host = session.host ?? ''
    const port = session.port ?? 22
    const fingerprint = fingerprintOf(keyOrHash)
    const rawKey = keyOrHash.toString('base64')
    const keyType = 'ssh-host-key'

    const strictness = settingsRepo.get('ssh.hostKeyStrictness') ?? 'prompt'
    const existing = knownHostsRepo.get(host, port)

    if (existing && existing.fingerprint === fingerprint) return true

    if (strictness === 'auto-accept') {
      knownHostsRepo.upsert(host, port, keyType, fingerprint, rawKey)
      return true
    }
    if (strictness === 'strict' && !existing) {
      ConnectionManager.pushStatus(tabId, 'error', 'Unknown host key (strict mode)')
      return false
    }

    // prompt the user (blocking modal in the renderer)
    return new Promise<boolean>((resolve) => {
      this.pendingHostKey.set(tabId, {
        resolve: (ok) => {
          if (ok && !existing) knownHostsRepo.upsert(host, port, keyType, fingerprint, rawKey)
          resolve(ok)
        },
        host,
        port,
        keyType,
        fingerprint,
        rawKey,
        changed: !!existing
      })
      Bus.emit('terminal:hostkey', {
        tabId,
        host,
        port,
        keyType,
        fingerprint,
        changed: !!existing,
        oldFingerprint: existing?.fingerprint
      })
    })
  }

  /** Open a throwaway connection to a saved session, run a command, and disconnect. */
  async exec(sessionId: number, command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    const session = sessionsRepo.get(sessionId)
    if (!session) throw new Error('Session not found')
    const syntheticTab = `exec:${sessionId}:${Date.now()}`
    const client = await this.connectChain(syntheticTab, session)
    try {
      return await new Promise((resolve, reject) => {
        client.exec(command, (err, stream) => {
          if (err) return reject(err)
          let stdout = ''
          let stderr = ''
          stream.on('data', (d: Buffer) => (stdout += d.toString()))
          stream.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
          stream.on('close', (code: number) => resolve({ stdout, stderr, code: code ?? 0 }))
        })
      })
    } finally {
      client.end()
    }
  }

  private ping(client: Client): Promise<number | null> {
    return new Promise((resolve) => {
      const start = Date.now()
      try {
        client.exec('true', (err, stream) => {
          if (err) return resolve(null)
          stream.on('close', () => resolve(Date.now() - start))
          stream.resume()
        })
      } catch {
        resolve(null)
      }
    })
  }
}

export const SshService = new SshServiceImpl()
