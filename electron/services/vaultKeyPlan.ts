/**
 * Decides where the vault key comes from at startup, and what to do with the legacy
 * 0600 key file. Kept pure and dependency-free so the self-check can exercise it.
 *
 * Two rules matter, and both protect data that cannot be recovered:
 *
 *  1. `removeFile` is only ever set when the key already lives in the OS keychain, or
 *     is about to be written there. Deleting the on-disk copy without a verified
 *     keychain entry would destroy every stored credential.
 *
 *  2. A brand-new key is only ever minted when the vault holds nothing yet. If secrets
 *     exist and no key can be found, that means the keychain is unreachable — not that
 *     the user is new. Minting a key there would silently orphan every saved password.
 *     `use: 'refuse'` says: stop, do not guess.
 */

export type VaultKeySource =
  /** Read straight out of the OS keychain. */
  | 'keychain'
  /** Found in the legacy 0600 file and moved into the keychain. */
  | 'migrated'
  /** Freshly generated. Only legal on an empty vault. */
  | 'created'
  /** No keychain on this machine — the 0600 file is the store of record. */
  | 'key-file'
  /** The key is unreachable and the vault is not empty. Refuse rather than re-key. */
  | 'unreachable'

export interface VaultKeyPlan {
  use: 'keychain' | 'file' | 'generate' | 'refuse'
  writeKeychain: boolean
  writeFile: boolean
  /** Only legal once the key is readable from the keychain. */
  removeFile: boolean
  source: VaultKeySource
}

const REFUSE: VaultKeyPlan = {
  use: 'refuse',
  writeKeychain: false,
  writeFile: false,
  removeFile: false,
  source: 'unreachable'
}

export function planVaultKey(input: {
  /** keytar loaded AND a probe read of the credential store succeeded. */
  keychainAvailable: boolean
  keychainHasKey: boolean
  fileHasKey: boolean
  /** Does the database already hold secrets encrypted under the existing key? */
  vaultHasSecrets: boolean
}): VaultKeyPlan {
  const { keychainAvailable, keychainHasKey, fileHasKey, vaultHasSecrets } = input

  // The 0600 file is the only value every pre-1.0.2 build ever actually decrypted with.
  // Those builds wrote to the keychain fire-and-forget, unawaited, and never read it back
  // — so an existing keychain entry is unverified and can be stale (a previous install, an
  // interrupted write, a rotated key). The file, when present, is guaranteed to match what
  // is on disk in the database, so it must win over the keychain.
  if (fileHasKey) {
    if (keychainAvailable) {
      return { use: 'file', writeKeychain: true, writeFile: false, removeFile: true, source: 'migrated' }
    }
    return { use: 'file', writeKeychain: false, writeFile: false, removeFile: false, source: 'key-file' }
  }

  if (keychainAvailable) {
    // No file left: already migrated, or the vault was always keychain-only. The
    // keychain is the store of record.
    if (keychainHasKey) {
      return { use: 'keychain', writeKeychain: false, writeFile: false, removeFile: false, source: 'keychain' }
    }
    if (vaultHasSecrets) return REFUSE
    return { use: 'generate', writeKeychain: true, writeFile: false, removeFile: false, source: 'created' }
  }

  // No usable keychain (headless Linux without libsecret, keytar build failed, locked
  // keyring, D-Bus down...) and no file. Safe to mint only on an empty vault.
  if (vaultHasSecrets) return REFUSE
  return { use: 'generate', writeKeychain: false, writeFile: true, removeFile: false, source: 'key-file' }
}
