import crypto from 'node:crypto'
import os from 'node:os'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import type { KeyGenerateOptions, SshKey } from '@shared/index'
import { keysRepo } from '../db/repo'
import { SshService } from './SshService'

// ssh2 is CommonJS; its `utils` named export isn't statically resolvable from an ESM
// bundle, so pull it at runtime via createRequire.
const nodeRequire = createRequire(import.meta.url)
const { generateKeyPairSync, parseKey } = nodeRequire('ssh2').utils as any

function fingerprintFromPublicSSH(pubSSH: Buffer): string {
  return 'SHA256:' + crypto.createHash('sha256').update(pubSSH).digest('base64').replace(/=+$/, '')
}

/** SSH key vault: generate, import, deploy. Private keys are stored encrypted via keysRepo. */
class KeyServiceImpl {
  generate(opts: KeyGenerateOptions): SshKey {
    const comment = opts.comment || `ternix@${os.hostname()}`
    const genOpts: any = { comment }
    if (opts.type === 'rsa') genOpts.bits = opts.bits ?? 4096
    if (opts.type === 'ecdsa') genOpts.bits = opts.bits ?? 521
    if (opts.passphrase) {
      genOpts.passphrase = opts.passphrase
      genOpts.cipher = 'aes256-cbc'
    }

    const pair = generateKeyPairSync(opts.type, genOpts) as { private: string; public: string }
    const parsed = parseKey(pair.public)
    const key = Array.isArray(parsed) ? parsed[0] : parsed
    if (!key || key instanceof Error) throw new Error('Failed to parse generated key')
    const fingerprint = fingerprintFromPublicSSH(key.getPublicSSH())

    return keysRepo.insert(opts.name, opts.type, pair.public.trim(), pair.private, fingerprint, comment)
  }

  import(pem: string, name: string, passphrase?: string): SshKey {
    const parsed = parseKey(pem, passphrase)
    const key = Array.isArray(parsed) ? parsed[0] : parsed
    if (!key || key instanceof Error) throw new Error('Could not parse private key (wrong passphrase?)')
    const pubSSH = key.getPublicSSH()
    const fingerprint = fingerprintFromPublicSSH(pubSSH)
    const keyType = key.type
    const comment = key.comment || ''
    const publicKey = `${keyType} ${pubSSH.toString('base64')} ${comment}`.trim()
    return keysRepo.insert(name, keyType, publicKey, pem, fingerprint, comment)
  }

  /** Scan ~/.ssh for private keys and import any not already present. */
  importFromDir(): SshKey[] {
    const dir = join(os.homedir(), '.ssh')
    if (!existsSync(dir)) return []
    const out: SshKey[] = []
    const existing = new Set(keysRepo.list().map((k) => k.fingerprint))
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.pub') || file === 'known_hosts' || file === 'config' || file === 'authorized_keys') continue
      const full = join(dir, file)
      try {
        const pem = readFileSync(full, 'utf8')
        if (!/PRIVATE KEY/.test(pem) && !/^-----BEGIN OPENSSH/.test(pem)) continue
        const parsed = parseKey(pem)
        const key = Array.isArray(parsed) ? parsed[0] : parsed
        if (!key || key instanceof Error) continue // encrypted/unsupported — skip silently
        const fp = fingerprintFromPublicSSH(key.getPublicSSH())
        if (existing.has(fp)) continue
        const pub = `${key.type} ${key.getPublicSSH().toString('base64')} ${key.comment || ''}`.trim()
        out.push(keysRepo.insert(file, key.type, pub, pem, fp, key.comment || ''))
        existing.add(fp)
      } catch {
        /* skip unreadable/encrypted */
      }
    }
    return out
  }

  getPublic(id: number): string {
    const pub = keysRepo.getPublic(id)
    if (!pub) throw new Error('Public key not available')
    return pub
  }

  /** ssh-copy-id equivalent: append the public key to the remote authorized_keys. */
  async deploy(keyId: number, sessionId: number): Promise<void> {
    const pub = keysRepo.getPublic(keyId)
    if (!pub) throw new Error('Public key not found')
    const safe = pub.replace(/"/g, '\\"').replace(/\n/g, '')
    const cmd =
      `mkdir -p ~/.ssh && chmod 700 ~/.ssh && ` +
      `touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && ` +
      `grep -qxF "${safe}" ~/.ssh/authorized_keys || echo "${safe}" >> ~/.ssh/authorized_keys`
    const res = await SshService.exec(sessionId, cmd)
    if (res.code !== 0) throw new Error(res.stderr || `Deploy failed (exit ${res.code})`)
  }
}

export const KeyService = new KeyServiceImpl()
