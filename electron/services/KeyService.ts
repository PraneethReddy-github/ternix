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

/** Heuristic: does this file body look like an SSH private key (any common format)? */
function looksLikePrivateKey(pem: string): boolean {
  return /PRIVATE KEY/.test(pem) || /^-----BEGIN OPENSSH/m.test(pem) || /^PuTTY-User-Key-File/m.test(pem)
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

  /**
   * Read a key file and report whether it looks like a private key, whether it
   * is passphrase-protected, and its fingerprint (when parseable). Pure read —
   * does not touch the vault. Returns null if the file is unreadable or isn't a key.
   */
  inspectKeyFile(absPath: string): { encrypted: boolean; fingerprint: string | null } | null {
    let pem: string
    try {
      pem = readFileSync(absPath, 'utf8')
    } catch {
      return null
    }
    if (!looksLikePrivateKey(pem)) return null
    const parsed = parseKey(pem)
    const key = Array.isArray(parsed) ? parsed[0] : parsed
    if (!key || key instanceof Error) return { encrypted: true, fingerprint: null } // looks like a key but won't parse → passphrase-protected
    return { encrypted: false, fingerprint: fingerprintFromPublicSSH(key.getPublicSSH()) }
  }

  /**
   * Ensure the key at `absPath` exists in the vault and return its id, deduping
   * against existing keys (by fingerprint when parseable, otherwise by name).
   * Returns null if the file can't be read or isn't a private key.
   */
  ensureKeyFromFile(absPath: string, name: string): { id: number; encrypted: boolean } | null {
    let pem: string
    try {
      pem = readFileSync(absPath, 'utf8')
    } catch {
      return null
    }
    if (!looksLikePrivateKey(pem)) return null

    const parsed = parseKey(pem)
    const key = Array.isArray(parsed) ? parsed[0] : parsed
    if (key && !(key instanceof Error)) {
      const fingerprint = fingerprintFromPublicSSH(key.getPublicSSH())
      const existing = keysRepo.findByFingerprint(fingerprint)
      if (existing) return { id: existing.id, encrypted: false }
      const pub = `${key.type} ${key.getPublicSSH().toString('base64')} ${key.comment || ''}`.trim()
      const created = keysRepo.insert(name, key.type, pub, pem, fingerprint, key.comment || '')
      return { id: created.id, encrypted: false }
    }

    // Passphrase-protected: store the raw PEM so it connects later (passphrase
    // prompted at connect time). We can't fingerprint it, so dedupe by name.
    const existing = keysRepo.findByName(name)
    if (existing) return { id: existing.id, encrypted: true }
    const created = keysRepo.insert(name, 'encrypted', '', pem, '', '')
    return { id: created.id, encrypted: true }
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
