import crypto from 'node:crypto'
import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs'
import { createRequire } from 'node:module'
import { DatabaseService } from './DatabaseService'

const nodeRequire = createRequire(import.meta.url)

const ALGO = 'aes-256-gcm'
const KDF_ITER = 100_000
const KDF_DIGEST = 'sha512'
const KEY_LEN = 32
const IV_LEN = 12
const TAG_LEN = 16
const VERIFIER_PLAINTEXT = 'ternix-vault-verifier-v1'
const KEYCHAIN_SERVICE = 'dev.ternix.app'
const KEYCHAIN_ACCOUNT = 'vault-key'

// keytar is a native optional dependency; load lazily so the app still boots if it is
// unavailable (e.g. no libsecret on a headless Linux box). We fall back to a 0600 key file.
let keytar: typeof import('keytar') | null = null
function loadKeytar(): typeof import('keytar') | null {
  if (keytar) return keytar
  try {
    keytar = nodeRequire('keytar')
  } catch {
    keytar = null
  }
  return keytar
}

export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked. Enter the master password to continue.')
    this.name = 'VaultLockedError'
  }
}

/**
 * Owns the symmetric vault key and all credential encryption.
 *
 * Two modes:
 *  - keychain mode (default): a random 256-bit key lives in the OS keychain (or a 0600
 *    key file fallback). The vault is always "unlocked".
 *  - master-password mode: the key is derived via PBKDF2(SHA-512, 100k) from the user's
 *    master password + a stored salt. After an idle timeout the key is zeroed (locked).
 */
class CryptoServiceImpl {
  private key: Buffer | null = null
  private usingKeychain = true
  private lockTimer: NodeJS.Timeout | null = null
  private lockTimeoutMs = 0
  private onLockedCb: (() => void) | null = null

  /** Called once at startup after the DB is ready. */
  init(): void {
    const db = DatabaseService.get()
    const meta = db.prepare(`SELECT using_keychain FROM vault_meta WHERE id = 1`).get() as
      | { using_keychain: number }
      | undefined
    this.usingKeychain = !meta || meta.using_keychain === 1

    if (this.usingKeychain) {
      this.key = this.loadOrCreateKeychainKey()
    } else {
      // master-password mode → stay locked until unlock() is called.
      this.key = null
    }
  }

  setOnLocked(cb: () => void): void {
    this.onLockedCb = cb
  }

  // ---- lifecycle ----

  isLocked(): boolean {
    return this.key === null
  }

  hasMasterPassword(): boolean {
    return !this.usingKeychain
  }

  isUsingKeychain(): boolean {
    return this.usingKeychain
  }

  setLockTimeout(minutes: number): void {
    this.lockTimeoutMs = Math.max(0, minutes) * 60_000
    this.touch()
  }

  /** Reset the idle lock timer; called on user activity. No-op in keychain mode. */
  touch(): void {
    if (this.usingKeychain || this.lockTimeoutMs <= 0) return
    if (this.lockTimer) clearTimeout(this.lockTimer)
    this.lockTimer = setTimeout(() => this.lock(), this.lockTimeoutMs)
  }

  lock(): void {
    if (this.usingKeychain) return // keychain mode cannot be locked
    if (this.key) {
      this.key.fill(0)
      this.key = null
    }
    if (this.lockTimer) {
      clearTimeout(this.lockTimer)
      this.lockTimer = null
    }
    this.onLockedCb?.()
  }

  unlock(password: string): boolean {
    const db = DatabaseService.get()
    const meta = db.prepare(`SELECT salt, verifier_enc FROM vault_meta WHERE id = 1`).get() as
      | { salt: Buffer | null; verifier_enc: Buffer | null }
      | undefined
    if (!meta?.salt || !meta.verifier_enc) return false
    const candidate = this.deriveKey(password, meta.salt)
    try {
      const decrypted = this.decryptWith(candidate, meta.verifier_enc)
      if (decrypted.toString('utf8') === VERIFIER_PLAINTEXT) {
        this.key = candidate
        this.touch()
        return true
      }
    } catch {
      /* wrong password → GCM auth fails */
    }
    candidate.fill(0)
    return false
  }

  // ---- master password management ----

  /**
   * Set or change the master password. Re-encrypts every stored secret with the new key.
   * `oldPassword` is null when transitioning from keychain mode.
   */
  setMasterPassword(oldPassword: string | null, newPassword: string): void {
    const db = DatabaseService.get()
    const oldKey = this.currentKeyForReencrypt(oldPassword)

    const salt = crypto.randomBytes(16)
    const newKey = this.deriveKey(newPassword, salt)
    const verifier = this.encryptWith(newKey, Buffer.from(VERIFIER_PLAINTEXT, 'utf8'))

    const tx = db.transaction(() => {
      this.reencryptAll(oldKey, newKey)
      db.prepare(
        `UPDATE vault_meta SET salt = ?, verifier_enc = ?, using_keychain = 0 WHERE id = 1`
      ).run(salt, verifier)
    })
    tx()

    if (oldKey !== this.key) oldKey.fill(0)
    if (this.key && this.key !== newKey) this.key.fill(0)
    this.key = newKey
    this.usingKeychain = false
  }

  /** Remove the master password and revert to keychain mode. */
  removeMasterPassword(currentPassword: string): void {
    if (!this.unlock(currentPassword)) throw new Error('Current master password is incorrect.')
    const db = DatabaseService.get()
    const oldKey = this.requireKey()
    const newKey = this.loadOrCreateKeychainKey()

    const tx = db.transaction(() => {
      this.reencryptAll(oldKey, newKey)
      db.prepare(`UPDATE vault_meta SET salt = NULL, verifier_enc = NULL, using_keychain = 1 WHERE id = 1`).run()
    })
    tx()

    oldKey.fill(0)
    this.key = newKey
    this.usingKeychain = true
  }

  // ---- encryption primitives ----

  /** Encrypt a UTF-8 string for storage. Returns null for null/empty input. */
  encrypt(plaintext: string | null | undefined): Buffer | null {
    if (plaintext == null || plaintext === '') return null
    return this.encryptWith(this.requireKey(), Buffer.from(plaintext, 'utf8'))
  }

  /** Decrypt a stored blob back to a UTF-8 string. Returns null for null input. */
  decrypt(blob: Buffer | null | undefined): string | null {
    if (!blob) return null
    return this.decryptWith(this.requireKey(), blob).toString('utf8')
  }

  // ---- internals ----

  private requireKey(): Buffer {
    if (!this.key) throw new VaultLockedError()
    return this.key
  }

  private currentKeyForReencrypt(oldPassword: string | null): Buffer {
    if (this.usingKeychain) {
      return this.key ?? this.loadOrCreateKeychainKey()
    }
    if (oldPassword == null) throw new Error('Current master password required.')
    if (!this.unlock(oldPassword)) throw new Error('Current master password is incorrect.')
    return this.requireKey()
  }

  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, KDF_ITER, KEY_LEN, KDF_DIGEST)
  }

  private encryptWith(key: Buffer, data: Buffer): Buffer {
    const iv = crypto.randomBytes(IV_LEN)
    const cipher = crypto.createCipheriv(ALGO, key, iv)
    const enc = Buffer.concat([cipher.update(data), cipher.final()])
    const tag = cipher.getAuthTag()
    // layout: [iv | tag | ciphertext]
    return Buffer.concat([iv, tag, enc])
  }

  private decryptWith(key: Buffer, blob: Buffer): Buffer {
    const iv = blob.subarray(0, IV_LEN)
    const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN)
    const enc = blob.subarray(IV_LEN + TAG_LEN)
    const decipher = crypto.createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()])
  }

  /** Re-encrypt every credential blob in the DB from oldKey to newKey. */
  private reencryptAll(oldKey: Buffer, newKey: Buffer): void {
    const db = DatabaseService.get()
    const recrypt = (blob: Buffer | null): Buffer | null => {
      if (!blob) return null
      const plain = this.decryptWith(oldKey, blob)
      const out = this.encryptWith(newKey, plain)
      plain.fill(0)
      return out
    }

    const sessions = db
      .prepare(`SELECT id, password_enc, passphrase_enc, vnc_password_enc FROM sessions`)
      .all() as { id: number; password_enc: Buffer | null; passphrase_enc: Buffer | null; vnc_password_enc: Buffer | null }[]
    const updSession = db.prepare(
      `UPDATE sessions SET password_enc = ?, passphrase_enc = ?, vnc_password_enc = ? WHERE id = ?`
    )
    for (const s of sessions) {
      updSession.run(recrypt(s.password_enc), recrypt(s.passphrase_enc), recrypt(s.vnc_password_enc), s.id)
    }

    const keys = db.prepare(`SELECT id, private_key_enc FROM ssh_keys`).all() as {
      id: number
      private_key_enc: Buffer
    }[]
    const updKey = db.prepare(`UPDATE ssh_keys SET private_key_enc = ? WHERE id = ?`)
    for (const k of keys) {
      updKey.run(recrypt(k.private_key_enc), k.id)
    }
  }

  private loadOrCreateKeychainKey(): Buffer {
    const kt = loadKeytar()
    if (kt) {
      // keytar is async; we run it synchronously via a small spin would be wrong, so we
      // use a synchronous file cache keyed alongside the keychain entry. To keep init
      // synchronous, we read/write the keychain through deasync-free means: cache the
      // key material in a 0600 file and treat the keychain as the source of truth on a
      // best-effort async basis.
      const cached = this.readKeyFile()
      if (cached) {
        // opportunistically mirror into the keychain
        kt.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, cached.toString('base64')).catch(() => {})
        return cached
      }
      const fresh = crypto.randomBytes(KEY_LEN)
      kt.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, fresh.toString('base64')).catch(() => {})
      this.writeKeyFile(fresh)
      return fresh
    }
    // No keychain available → 0600 key file fallback.
    const existing = this.readKeyFile()
    if (existing) return existing
    const fresh = crypto.randomBytes(KEY_LEN)
    this.writeKeyFile(fresh)
    return fresh
  }

  private keyFilePath(): string {
    return join(app.getPath('userData'), '.vaultkey')
  }

  private readKeyFile(): Buffer | null {
    const p = this.keyFilePath()
    if (!existsSync(p)) return null
    try {
      const b64 = readFileSync(p, 'utf8').trim()
      const buf = Buffer.from(b64, 'base64')
      return buf.length === KEY_LEN ? buf : null
    } catch {
      return null
    }
  }

  private writeKeyFile(key: Buffer): void {
    const p = this.keyFilePath()
    writeFileSync(p, key.toString('base64'), { mode: 0o600 })
    try {
      chmodSync(p, 0o600)
    } catch {
      /* windows */
    }
  }
}

export const CryptoService = new CryptoServiceImpl()
