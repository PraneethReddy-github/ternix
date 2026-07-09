import crypto from 'node:crypto'
import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync, chmodSync, unlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { DatabaseService } from './DatabaseService'
import { planVaultKey } from './vaultKeyPlan'

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
 *  - keychain mode (default): a random 256-bit key lives in the OS keychain. Only when
 *    no keychain exists does it fall back to a 0600 key file. The vault is always
 *    "unlocked".
 *  - master-password mode: the key is derived via PBKDF2(SHA-512, 100k) from the user's
 *    master password + a stored salt. After an idle timeout the key is zeroed (locked).
 */
class CryptoServiceImpl {
  private key: Buffer | null = null
  private usingKeychain = true
  private lockTimer: NodeJS.Timeout | null = null
  private lockTimeoutMs = 0
  private onLockedCb: (() => void) | null = null

  /** Called once at startup after the DB is ready, before any IPC is registered. */
  async init(): Promise<void> {
    const db = DatabaseService.get()
    const meta = db.prepare(`SELECT using_keychain FROM vault_meta WHERE id = 1`).get() as
      | { using_keychain: number }
      | undefined
    this.usingKeychain = !meta || meta.using_keychain === 1

    if (this.usingKeychain) {
      this.key = await this.loadOrCreateKeychainKey(this.hasEncryptedSecrets())
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
  async setMasterPassword(oldPassword: string | null, newPassword: string): Promise<void> {
    const db = DatabaseService.get()
    const oldKey = await this.currentKeyForReencrypt(oldPassword)

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
  async removeMasterPassword(currentPassword: string): Promise<void> {
    if (!this.unlock(currentPassword)) throw new Error('Current master password is incorrect.')
    const db = DatabaseService.get()
    const oldKey = this.requireKey()
    // A fresh key is intended here: reencryptAll() rewrites every secret under it.
    const newKey = await this.loadOrCreateKeychainKey(false)

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

  private async currentKeyForReencrypt(oldPassword: string | null): Promise<Buffer> {
    if (this.usingKeychain) {
      return this.key ?? (await this.loadOrCreateKeychainKey(true))
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

  /**
   * Resolve the keychain-mode vault key. The OS keychain is the store of record; the
   * 0600 file exists only for machines without one (headless Linux, keytar build failed).
   * Vaults created by older builds keep their key on disk — those are migrated into the
   * keychain here, and the file is removed only once the key reads back correctly.
   */
  private async loadOrCreateKeychainKey(vaultHasSecrets: boolean): Promise<Buffer> {
    const kt = loadKeytar()
    // A throwing credential store is NOT the same as an empty one. Conflating them would
    // let a locked keyring look like a fresh install, and we would mint a new key over a
    // vault full of secrets we could no longer read.
    const probe = kt ? await this.readKeychain(kt) : { ok: false as const }
    const keychainKey = probe.ok ? probe.key : null
    const fileKey = this.readKeyFile()

    const plan = planVaultKey({
      keychainAvailable: probe.ok,
      keychainHasKey: !!keychainKey,
      fileHasKey: !!fileKey,
      vaultHasSecrets
    })

    if (plan.use === 'refuse') {
      throw new Error(
        'Ternix cannot reach your OS credential store, and the vault key is not on disk. ' +
          'Refusing to start with a new key — your saved passwords and private keys would ' +
          'become unreadable. Unlock your login keyring and start Ternix again.'
      )
    }

    const key =
      plan.use === 'keychain' ? keychainKey! : plan.use === 'file' ? fileKey! : crypto.randomBytes(KEY_LEN)

    if (plan.writeKeychain) {
      const stored = await this.writeAndVerifyKeychain(kt!, key)
      if (!stored) {
        // The keychain refused the key or handed back something else. Keep the key on
        // disk rather than lose the vault, and never delete the file we may still need.
        if (!fileKey) this.writeKeyFile(key)
        return key
      }
    }
    if (plan.writeFile) this.writeKeyFile(key)
    if (plan.removeFile) this.removeKeyFile()
    return key
  }

  /** `{ ok: false }` means the store errored; `{ ok: true, key: null }` means no entry. */
  private async readKeychain(
    kt: NonNullable<typeof keytar>
  ): Promise<{ ok: true; key: Buffer | null } | { ok: false }> {
    try {
      const b64 = await kt.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
      if (!b64) return { ok: true, key: null }
      const buf = Buffer.from(b64, 'base64')
      return { ok: true, key: buf.length === KEY_LEN ? buf : null }
    } catch {
      return { ok: false }
    }
  }

  /** True once anything in the database is encrypted under the current vault key. */
  private hasEncryptedSecrets(): boolean {
    const db = DatabaseService.get()
    const row = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM sessions
              WHERE password_enc IS NOT NULL
                 OR passphrase_enc IS NOT NULL
                 OR vnc_password_enc IS NOT NULL)
         + (SELECT COUNT(*) FROM ssh_keys) AS n`
      )
      .get() as { n: number }
    return row.n > 0
  }

  /** Write, then read back and compare. Only a verified round-trip counts as stored. */
  private async writeAndVerifyKeychain(kt: NonNullable<typeof keytar>, key: Buffer): Promise<boolean> {
    try {
      await kt.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, key.toString('base64'))
      const back = await this.readKeychain(kt)
      return back.ok && !!back.key && back.key.equals(key)
    } catch {
      return false
    }
  }

  private removeKeyFile(): void {
    const p = this.keyFilePath()
    try {
      if (existsSync(p)) unlinkSync(p)
    } catch {
      /* best effort — a stale file is not fatal, it is just redundant */
    }
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
