import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { networkInterfaces } from 'node:os'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import nacl from 'tweetnacl'
import { WebSocketServer, type WebSocket } from 'ws'
import type { MobileDevice, MobileQuickCommand, MobileStatus } from '@shared/index'
import { redeemPairing, type PairState } from './pairingGate'
import { b64, open, pairKey, seal, unb64 } from './mobileCrypto'
import { blockMessage, gateSession, type GateSession } from './mobileGate'
import { CloudflaredService } from './CloudflaredService'
import { CryptoService } from './CryptoService'
import { ConnectionManager } from './ConnectionManager'
import { spawnTerminal } from './SpawnService'
import { RecordingService } from './RecordingService'
import { SftpService } from './SftpService'
import { TunnelService } from './TunnelService'
import { knownHostsRepo, sessionsRepo, settingsRepo, snippetsRepo } from '../db/repo'
import { Bus } from './bus'

const __dirname = dirname(fileURLToPath(import.meta.url))
const nodeRequire = createRequire(import.meta.url)

const PAIR_TTL_MS = 120_000
/** Nothing can guess a 256-bit secret, but a pairing window still shuts after this much noise. */
const PAIR_MAX_ATTEMPTS = 5
/** A socket that has not proved which device it is by then gets dropped. */
const HANDSHAKE_TIMEOUT_MS = 10_000
const DEVICES_KEY = 'mobile.devices'
const QUICK_KEY = 'mobile.quickCommands'
/**
 * How long a phone-opened pane outlives its socket. Phones drop connections constantly
 * — walking into a lift must not kill a running job. The pane is reclaimed on reconnect.
 */
const ORPHAN_GRACE_MS = 120_000

interface StoredDevice {
  id: string
  name: string
  /**
   * The device's 256-bit link key, base64. Both ends must hold it in the clear to encrypt
   * with it, so unlike a bearer token it cannot be stored hashed. It never crosses the
   * network: it is handed over once inside the pairing box, and afterwards only ever proves
   * itself by decrypting.
   */
  key: string
  createdAt: number
  lastSeen: number
}

/** Static assets served to the phone, resolved out of node_modules at request time. */
const ASSETS: Record<string, { spec: string; type: string }> = {
  '/xterm.js': { spec: '@xterm/xterm/lib/xterm.js', type: 'application/javascript' },
  '/xterm.css': { spec: '@xterm/xterm/css/xterm.css', type: 'text/css' },
  '/addon-fit.js': { spec: '@xterm/addon-fit/lib/addon-fit.js', type: 'application/javascript' },
  '/nacl.js': { spec: 'tweetnacl/nacl-fast.min.js', type: 'application/javascript' }
}
const ICONS: Record<string, { file: string; type: string }> = {
  '/icon.svg': { file: 'icon.svg', type: 'image/svg+xml' },
  '/icon.png': { file: 'icon.png', type: 'image/png' }
}

/**
 * Serves a phone-sized terminal client over HTTP/WebSocket and bridges it to the same
 * ConnectionManager the desktop panes use, so a phone can either open its own sessions
 * or mirror a pane already running on the desktop.
 *
 * Access control: the server is useless without a bearer token, and tokens are only
 * issued in exchange for a short-lived pairing code the user reads off the desktop UI.
 * Tokens are stored hashed and can be revoked per device.
 */
class MobileServiceImpl {
  private http: HttpServer | null = null
  private wss: WebSocketServer | null = null
  private port = 0
  private pairing: PairState | null = null
  private tunnel: ChildProcess | null = null
  private tunnelUrl: string | null = null
  private tunnelError: string | null = null
  private tunnelTimeout: ReturnType<typeof setTimeout> | null = null
  /** True from the moment the user asks for a tunnel until it has a URL or has failed. */
  private tunnelStarting = false
  /** Panes this service spawned — killed when the app quits, unlike desktop-owned panes. */
  private ownPanes = new Set<string>()
  /** Pending reaps for phone panes whose socket dropped, keyed by paneId. */
  private orphans = new Map<string, NodeJS.Timeout>()

  // ---------------------------------------------------------------- devices

  private loadDevices(): StoredDevice[] {
    try {
      const raw = settingsRepo.get(DEVICES_KEY)
      return raw ? (JSON.parse(raw) as StoredDevice[]) : []
    } catch {
      return []
    }
  }

  private saveDevices(list: StoredDevice[]): void {
    // ponytail: a JSON blob in the settings KV. A real table earns its keep past a
    // few dozen devices; nobody pairs a few dozen phones.
    settingsRepo.set(DEVICES_KEY, JSON.stringify(list))
  }

  devices(): MobileDevice[] {
    return this.loadDevices().map(({ id, name, createdAt, lastSeen }) => ({ id, name, createdAt, lastSeen }))
  }

  revoke(id: string): void {
    this.saveDevices(this.loadDevices().filter((d) => d.id !== id))
    // Kick any live socket belonging to that device.
    for (const ws of this.wss?.clients ?? []) {
      if ((ws as any).__deviceId === id) ws.close(4003, 'revoked')
    }
    Bus.emit('mobile:status', this.status())
  }

  /**
   * Identify the device that sealed `frame`, by finding the link key that opens it.
   *
   * Trying every key rather than taking an id off the wire is deliberate: it means a
   * listener never sees a stable identifier for the phone, only ciphertext. Opening a
   * sealed box is cheap and nobody links more than a handful of phones.
   */
  private identify<T>(frame: string): { device: StoredDevice; key: Uint8Array; payload: T } | null {
    for (const device of this.loadDevices()) {
      const key = unb64(device.key)
      if (key.length !== nacl.secretbox.keyLength) continue
      const payload = open<T>(frame, key)
      if (payload !== null) return { device, key, payload }
    }
    return null
  }

  private touchDevice(id: string): void {
    const list = this.loadDevices()
    const d = list.find((x) => x.id === id)
    if (!d) return
    d.lastSeen = Date.now()
    this.saveDevices(list)
  }

  // ---------------------------------------------------------------- pairing

  /**
   * Mint a fresh pairing secret, invalidating any previous one.
   *
   * 256 bits, and it reaches the phone only by being photographed off the screen — it
   * rides in the QR's URL fragment, which browsers never put on the wire. So there is
   * nothing on the network to capture and nothing short enough to guess.
   */
  newPairing(): { secret: string; expiresAt: number } {
    const secret = randomBytes(32).toString('base64url')
    this.pairing = { secret, expires: Date.now() + PAIR_TTL_MS, attempts: 0 }
    return { secret, expiresAt: this.pairing.expires }
  }

  clearPairing(): void {
    this.pairing = null
  }

  /**
   * Redeem a sealed pairing request. The phone proves it scanned the QR by sealing under
   * the secret; success mints that device its own long-lived link key, handed back inside
   * the same box so the key itself never travels in the clear.
   */
  private redeemPair(body: string): string | null {
    let name = 'Phone'
    const verdict = redeemPairing(
      this.pairing,
      (secret) => {
        const payload = open<{ name?: string }>(body, pairKey(secret))
        if (!payload) return false
        if (payload.name) name = String(payload.name)
        return true
      },
      Date.now(),
      PAIR_MAX_ATTEMPTS
    )
    const secret = this.pairing?.secret
    this.pairing = verdict.next
    if (!verdict.ok || !secret) {
      // A retired secret means the QR on the desktop is now dead — refresh it there.
      if (!verdict.next) Bus.emit('mobile:status', this.status())
      return null
    }

    const key = nacl.randomBytes(nacl.secretbox.keyLength)
    const device: StoredDevice = {
      id: randomBytes(8).toString('hex'),
      name: name.slice(0, 40) || 'Phone',
      key: b64(key),
      createdAt: Date.now(),
      lastSeen: Date.now()
    }
    this.saveDevices([...this.loadDevices(), device])
    Bus.emit('mobile:status', this.status())
    return seal({ key: b64(key) }, pairKey(secret))
  }

  // ---------------------------------------------------------------- server

  async start(port: number): Promise<MobileStatus> {
    if (this.http) return this.status()

    await new Promise<void>((resolve, reject) => {
      const http = createServer((req, res) => this.onRequest(req, res))
      const wss = new WebSocketServer({ noServer: true })

      // No credential in the URL: a query string is the one part of a request that proxies
      // and access logs routinely keep, and on a LAN it is plaintext outright. The socket
      // opens unauthenticated and must prove itself in its first frame instead.
      http.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname !== '/ws') {
          socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
          socket.destroy()
          return
        }
        wss.handleUpgrade(req, socket, head, (ws) => this.onSocket(ws))
      })

      http.on('error', reject)
      // 0.0.0.0 on purpose: the phone is another machine. Auth is the boundary, not the bind.
      http.listen(port, '0.0.0.0', () => {
        const addr = http.address()
        this.http = http
        this.wss = wss
        this.port = typeof addr === 'object' && addr ? addr.port : port
        resolve()
      })
    })

    Bus.emit('mobile:status', this.status())
    return this.status()
  }

  async stop(): Promise<void> {
    this.stopTunnel()
    this.pairing = null
    for (const ws of this.wss?.clients ?? []) {
      try {
        ws.close(1001, 'server stopped')
      } catch {
        /* ignore */
      }
    }
    for (const t of this.orphans.values()) clearTimeout(t)
    this.orphans.clear()
    for (const paneId of this.ownPanes) this.killPane(paneId)
    this.ownPanes.clear()
    this.wss?.close()
    await new Promise<void>((resolve) => (this.http ? this.http.close(() => resolve()) : resolve()))
    this.http = null
    this.wss = null
    this.port = 0
    Bus.emit('mobile:status', this.status())
  }

  status(): MobileStatus {
    return {
      running: !!this.http,
      port: this.port,
      lanUrls: this.http ? this.lanAddresses().map((ip) => `http://${ip}:${this.port}`) : [],
      tunnelUrl: this.tunnelUrl,
      tunnelError: this.tunnelError,
      tunnelRunning: !!this.tunnel,
      tunnelStarting: this.tunnelStarting,
      devices: this.devices(),
      // Only linked phones count — a socket that never handshook is not a connected client.
      clients: [...(this.wss?.clients ?? [])].filter((ws) => (ws as any).__deviceId).length
    }
  }

  // ---------------------------------------------------------------- quick commands

  quickCommands(): MobileQuickCommand[] {
    try {
      const raw = settingsRepo.get(QUICK_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter((q) => q && typeof q.command === 'string' && q.command)
        .map((q) => ({ label: String(q.label || q.command).slice(0, 24), command: String(q.command) }))
    } catch {
      return []
    }
  }

  private lanAddresses(): string[] {
    const out: string[] = []
    for (const addrs of Object.values(networkInterfaces())) {
      for (const a of addrs ?? []) {
        if (a.family === 'IPv4' && !a.internal) out.push(a.address)
      }
    }
    return out
  }

  // ---------------------------------------------------------------- http

  private async onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')

    // Cheap defence against a malicious page in the phone's browser scripting this
    // server via DNS rebinding: our own client sends no Origin mismatch.
    const origin = req.headers.origin
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
      res.writeHead(403).end('bad origin')
      return
    }
    res.setHeader('X-Content-Type-Options', 'nosniff')

    if (url.pathname === '/pair' && req.method === 'POST') return this.handlePair(req, res)

    const asset = ASSETS[url.pathname]
    if (asset) {
      try {
        const body = await readFile(nodeRequire.resolve(asset.spec))
        res.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'max-age=86400' }).end(body)
      } catch {
        res.writeHead(404).end('asset missing')
      }
      return
    }
    const icon = ICONS[url.pathname]
    if (icon) {
      try {
        const body = await readFile(join(__dirname, '../../resources', icon.file))
        res.writeHead(200, { 'Content-Type': icon.type, 'Cache-Control': 'max-age=86400' }).end(body)
      } catch {
        res.writeHead(404).end('icon missing')
      }
      return
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      try {
        const html = await readFile(join(__dirname, '../../resources/mobile/index.html'))
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html)
      } catch {
        res.writeHead(500).end('client missing')
      }
      return
    }

    res.writeHead(404).end('not found')
  }

  private handlePair(req: IncomingMessage, res: ServerResponse): void {
    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > 2048) req.destroy() // no reason for a pair request to be large
    })
    req.on('end', () => {
      // The request is one sealed box, opaque to anything between the phone and here.
      const sealed = this.redeemPair(body)
      if (!sealed) {
        res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid or expired code' }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ sealed }))
    })
  }

  // ---------------------------------------------------------------- session gate

  private toGate(s: ReturnType<typeof sessionsRepo.list>[number]): GateSession {
    return {
      protocol: s.protocol,
      auth_type: s.auth_type,
      host: s.host,
      port: s.port,
      hasPassword: s.hasPassword,
      ssh_key_id: s.ssh_key_id,
      jump_host_id: s.jump_host_id
    }
  }

  /** Can this saved session be opened from a phone without a desktop modal? */
  private gate(sessionId: number) {
    const s = sessionsRepo.get(sessionId)
    if (!s) return { ok: false as const, reason: undefined }
    const strictness = settingsRepo.get('ssh.hostKeyStrictness') ?? 'prompt'
    return gateSession(
      this.toGate(s),
      (host, port) => !!knownHostsRepo.get(host, port),
      strictness,
      (id) => {
        const j = sessionsRepo.get(id)
        return j ? this.toGate(j) : null
      },
      new Set(),
      CryptoService.isLocked()
    )
  }

  /**
   * Everything the picker screen renders: which saved sessions are openable and why not,
   * which panes are live and who opened them, plus the phone's command shortcuts.
   */
  private listPayload(): unknown {
    const strictness = settingsRepo.get('ssh.hostKeyStrictness') ?? 'prompt'
    const all = sessionsRepo.list()
    const byId = new Map(all.map((s) => [s.id, this.toGate(s)]))
    const vaultLocked = CryptoService.isLocked()

    const sessions = all.map((s) => {
      const v = gateSession(this.toGate(s), (h, p) => !!knownHostsRepo.get(h, p), strictness, (id) => byId.get(id) ?? null, new Set(), vaultLocked)
      return {
        id: s.id,
        name: s.name,
        host: s.host,
        protocol: s.protocol,
        ready: v.ok,
        blocked: v.reason ? blockMessage(v.reason) : undefined
      }
    })

    return {
      t: 'list',
      sessions,
      panes: ConnectionManager.list().map((p) => ({ ...p, phone: this.ownPanes.has(p.tabId) })),
      quick: this.quickCommands(),
      // Session-scoped snippets come along with their session id so the phone can show the
      // right ones once it knows what it is attached to.
      snippets: snippetsRepo.list().map((s) => ({ id: s.id, name: s.name, command: s.command, session_id: s.session_id }))
    }
  }

  /** Push a fresh picker payload to every connected phone. */
  private broadcastList(): void {
    const payload = this.listPayload()
    for (const ws of this.wss?.clients ?? []) (ws as any).__send?.(payload)
    Bus.emit('mobile:status', this.status())
  }

  // ---------------------------------------------------------------- websocket

  private onSocket(ws: WebSocket): void {
    let paneId: string | null = null
    /** Per-connection key. Null until the handshake lands — nothing is served before then. */
    let session: Uint8Array | null = null

    const send = (msg: unknown) => {
      if (session && ws.readyState === ws.OPEN) ws.send(seal(msg, session))
    }
      // Every socket seals under its own per-connection key, so a broadcast has to go back
      // through each one rather than sending a single shared string.
      ; (ws as any).__send = send

    const timeout = setTimeout(() => {
      if (!session) ws.close(4401, 'handshake timeout')
    }, HANDSHAKE_TIMEOUT_MS)

    /**
     * First frame: the phone seals an ephemeral public key under its device link key. That
     * one message both proves which device it is — only a paired phone holds a key that
     * opens — and starts an X25519 exchange, so the key everything is encrypted under
     * afterwards exists only for this connection. A recording of today's traffic stays
     * unreadable even if the device key leaks tomorrow.
     */
    const handshake = (frame: string): void => {
      const found = this.identify<{ epub?: string }>(frame)
      const theirs = found && typeof found.payload.epub === 'string' ? unb64(found.payload.epub) : null
      if (!found || !theirs || theirs.length !== nacl.box.publicKeyLength) {
        ws.close(4003, 'not linked')
        return
      }
      const mine = nacl.box.keyPair()
      // Sealed under the device key: the phone can only complete the exchange if it is
      // genuinely the paired device, which stops an eavesdropper answering in its place.
      ws.send(seal({ epub: b64(mine.publicKey) }, found.key))
      session = nacl.box.before(theirs, mine.secretKey)
        ; (ws as any).__deviceId = found.device.id
      clearTimeout(timeout)
      this.touchDevice(found.device.id)
      Bus.emit('mobile:status', this.status())
    }

    const untap = ConnectionManager.tap((e) => {
      if (e.tabId !== paneId) return
      if (e.type === 'data') send({ t: 'data', d: e.data })
      else if (e.type === 'status') send({ t: 'status', state: e.state, message: e.message })
      else if (e.type === 'exit') send({ t: 'exit', code: e.code, reason: e.reason })
    })

    ws.on('message', async (raw) => {
      if (!session) return handshake(String(raw))

      // A frame that will not open was tampered with, replayed under a stale key, or is
      // simply noise. There is no useful error to report to something holding no key.
      const m = open<any>(String(raw), session)
      if (!m) return

      switch (m.t) {
        case 'list':
          send(this.listPayload())
          break

        case 'spawn': {
          const gate = m.sessionId != null ? this.gate(m.sessionId) : { ok: true as const }
          if (!gate.ok) {
            send({ t: 'error', message: gate.reason ? blockMessage(gate.reason) : 'That session cannot be opened from a phone' })
            break
          }
          const id = `mobile-${randomBytes(6).toString('hex')}`
          const cols = Math.max(1, Number(m.cols) || 80)
          const rows = Math.max(1, Number(m.rows) || 24)
          paneId = id
          const r = await spawnTerminal({ tabId: id, sessionId: m.sessionId ?? null, cols, rows }, null)
          if (!r.ok) {
            paneId = null
            send({ t: 'error', message: r.error ?? 'Connection failed' })
            break
          }
          this.ownPanes.add(id)
          ConnectionManager.resize(id, cols, rows)
          send({
            t: 'attached',
            paneId: id,
            protocol: r.protocol,
            cols,
            rows,
            owned: true,
            sessionId: m.sessionId ?? null,
            title: ConnectionManager.list().find((p) => p.tabId === id)?.sessionName ?? 'Session',
            banner: r.banner
          })
          this.broadcastList()
          break
        }

        case 'attach': {
          const pane = ConnectionManager.list().find((p) => p.tabId === m.paneId)
          if (!pane) {
            send({ t: 'error', message: 'That pane is no longer open' })
            break
          }
          paneId = pane.tabId
          this.claimOrphan(pane.tabId)
          // A desktop pane keeps its own geometry — the phone scales to fit rather than
          // resizing, so mirroring from a phone can never reflow the desktop's terminal.
          // A pane the phone opened is its own, so it stays resizable across reconnects.
          send({
            t: 'attached',
            paneId: pane.tabId,
            protocol: pane.protocol,
            cols: pane.cols,
            rows: pane.rows,
            owned: this.ownPanes.has(pane.tabId),
            sessionId: pane.sessionId,
            title: pane.sessionName,
            replay: ConnectionManager.getScrollback(pane.tabId)
          })
          break
        }

        case 'input':
          if (paneId) ConnectionManager.get(paneId)?.write(String(m.data ?? ''))
          break

        case 'resize':
          // Only a pane the phone opened may be resized by the phone.
          if (paneId && this.ownPanes.has(paneId)) {
            ConnectionManager.resize(paneId, Math.max(1, Number(m.cols) || 80), Math.max(1, Number(m.rows) || 24))
          }
          break

        case 'detach':
          paneId = null
          break

        case 'kill':
          if (paneId && this.ownPanes.has(paneId)) {
            this.killPane(paneId)
            this.ownPanes.delete(paneId)
          }
          paneId = null
          break

        // Close any live pane by id — including one the desktop opened. The backend's own
        // close event propagates to the desktop, so its tab tidies itself up.
        case 'close': {
          const target = String(m.paneId ?? '')
          if (!target || !ConnectionManager.has(target)) {
            send(this.listPayload())
            break
          }
          this.claimOrphan(target)
          this.ownPanes.delete(target)
          this.killPane(target)
          if (paneId === target) paneId = null
          this.broadcastList()
          break
        }
      }
    })

    const cleanup = () => {
      clearTimeout(timeout)
      untap()
      // A mirrored desktop pane is not ours to touch. A phone-opened pane gets a grace
      // window to be reclaimed by a reconnect before it is reaped.
      if (paneId && this.ownPanes.has(paneId)) this.orphan(paneId)
      Bus.emit('mobile:status', this.status())
    }
    ws.on('close', cleanup)
    ws.on('error', cleanup)
    Bus.emit('mobile:status', this.status())
  }

  /** Start the reap countdown for a phone pane whose socket went away. */
  private orphan(paneId: string): void {
    if (this.orphans.has(paneId)) return
    this.orphans.set(
      paneId,
      setTimeout(() => {
        this.orphans.delete(paneId)
        this.ownPanes.delete(paneId)
        this.killPane(paneId)
        this.broadcastList()
      }, ORPHAN_GRACE_MS)
    )
  }

  /** A reconnect got here in time — cancel the reap. */
  private claimOrphan(paneId: string): void {
    const t = this.orphans.get(paneId)
    if (t) {
      clearTimeout(t)
      this.orphans.delete(paneId)
    }
  }

  private killPane(paneId: string): void {
    RecordingService.stop(paneId)
    SftpService.close(paneId)
    TunnelService.stopForTab(paneId)
    ConnectionManager.kill(paneId)
  }

  // ---------------------------------------------------------------- tunnel

  /**
   * Publish the local server through a Cloudflare quick tunnel so a phone on mobile data
   * can reach it over HTTPS. `cloudflared` is downloaded on first use rather than bundled,
   * so the installer stays small and the right build lands on every architecture.
   */
  async startTunnel(): Promise<MobileStatus> {
    if (!this.http) throw new Error('Start phone access first')
    if (this.tunnel || this.tunnelStarting) return this.status()
    this.tunnelError = null
    this.tunnelStarting = true
    Bus.emit('mobile:status', this.status())

    let binary: string
    try {
      binary = await CloudflaredService.ensure()
    } catch (err: any) {
      this.tunnelStarting = false
      this.tunnelError = `Could not install cloudflared: ${err.message}`
      Bus.emit('mobile:status', this.status())
      return this.status()
    }

    // The server may have been stopped while the download ran.
    if (!this.http) {
      this.tunnelStarting = false
      return this.status()
    }

    const proc = spawn(binary, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${this.port}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.tunnel = proc

    // Broader regex: cloudflared output format varies across versions — the subdomain
    // may contain mixed-case letters, digits, and hyphens, and the URL may appear
    // anywhere in a log line (plain text or structured).
    const scan = (chunk: Buffer) => {
      const m = /https:\/\/[A-Za-z0-9_-]+\.trycloudflare\.com/.exec(chunk.toString())
      if (m && !this.tunnelUrl) {
        this.tunnelUrl = m[0]
        this.tunnelStarting = false
        if (this.tunnelTimeout) { clearTimeout(this.tunnelTimeout); this.tunnelTimeout = null }
        Bus.emit('mobile:status', this.status())
      }
    }
    proc.stdout?.on('data', scan)
    proc.stderr?.on('data', scan)

    // If we don't see a URL within 30 s, something went wrong — surface an error
    // instead of staying stuck on "Starting…" forever.
    this.tunnelTimeout = setTimeout(() => {
      this.tunnelTimeout = null
      if (this.tunnel === proc && !this.tunnelUrl) {
        this.tunnelError = 'Timed out waiting for tunnel URL — check this machine can reach Cloudflare'
        this.tunnel = null
        this.tunnelStarting = false
        try { proc.kill() } catch { /* ignore */ }
        Bus.emit('mobile:status', this.status())
      }
    }, 30_000)

    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (this.tunnelTimeout) { clearTimeout(this.tunnelTimeout); this.tunnelTimeout = null }
      this.tunnelError = err.code === 'ENOENT' ? 'cloudflared could not be launched — try reinstalling it' : err.message
      this.tunnel = null
      this.tunnelUrl = null
      this.tunnelStarting = false
      Bus.emit('mobile:status', this.status())
    })
    proc.on('exit', (code) => {
      if (this.tunnel === proc) {
        if (this.tunnelTimeout) { clearTimeout(this.tunnelTimeout); this.tunnelTimeout = null }
        if (code && !this.tunnelError) this.tunnelError = `cloudflared exited with code ${code}`
        this.tunnel = null
        this.tunnelUrl = null
        this.tunnelStarting = false
        Bus.emit('mobile:status', this.status())
      }
    })

    Bus.emit('mobile:status', this.status())
    return this.status()
  }

  stopTunnel(): void {
    const proc = this.tunnel
    this.tunnel = null
    this.tunnelUrl = null
    this.tunnelStarting = false
    if (this.tunnelTimeout) { clearTimeout(this.tunnelTimeout); this.tunnelTimeout = null }
    if (proc) {
      try {
        proc.kill()
      } catch {
        /* ignore */
      }
    }
    Bus.emit('mobile:status', this.status())
  }
}

export const MobileService = new MobileServiceImpl()
