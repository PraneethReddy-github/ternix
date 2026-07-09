// Self-check for vault key placement.
// Run: node --experimental-strip-types electron/services/vaultKeyPlan.check.ts
import assert from 'node:assert/strict'
import { planVaultKey } from './vaultKeyPlan.ts'

const plan = (keychainAvailable: boolean, keychainHasKey: boolean, fileHasKey: boolean, vaultHasSecrets = false) =>
  planVaultKey({ keychainAvailable, keychainHasKey, fileHasKey, vaultHasSecrets })

// ── The two invariants, over every possible input ────────────────────────────
for (const available of [true, false]) {
  for (const inKeychain of [true, false]) {
    for (const onDisk of [true, false]) {
      for (const hasSecrets of [true, false]) {
        const p = plan(available, inKeychain, onDisk, hasSecrets)

        // 1. Never delete the on-disk key unless the keychain holds it, or is about to.
        if (p.removeFile) {
          assert.ok(available, 'removeFile requires a reachable keychain')
          assert.ok(p.writeKeychain || p.use === 'keychain', 'removeFile requires the key to be in the keychain')
          assert.ok(onDisk, 'no point removing a file that does not exist')
        }

        // 2. Never mint a new key over a vault that already holds secrets.
        if (p.use === 'generate') {
          assert.ok(!hasSecrets, 'refusing to re-key a non-empty vault')
        }

        // A generated key must always land somewhere durable.
        if (p.use === 'generate') {
          assert.ok(p.writeKeychain || p.writeFile, 'a generated key must be persisted')
        }

        // Refusing must never touch anything.
        if (p.use === 'refuse') {
          assert.deepEqual(
            { w: p.writeKeychain, f: p.writeFile, r: p.removeFile },
            { w: false, f: false, r: false },
            'refuse must be inert'
          )
        }
      }
    }
  }
}

// ── The reported regression ──────────────────────────────────────────────────
// A locked keyring looks exactly like "no entry" unless the caller distinguishes them.
// With a migrated vault (key in keychain, file already deleted), a transient keychain
// failure must NOT be read as "fresh install" and re-keyed.
const lockedKeyring = plan(/* available */ false, false, false, /* vaultHasSecrets */ true)
assert.equal(lockedKeyring.use, 'refuse', 'a non-empty vault with no reachable key must refuse, not re-key')
assert.equal(lockedKeyring.writeFile, false)
assert.equal(lockedKeyring.writeKeychain, false)

// Same shape, but an empty vault: a first run on a machine with no keychain. Safe to mint.
assert.deepEqual(plan(false, false, false, false), {
  use: 'generate', writeKeychain: false, writeFile: true, removeFile: false, source: 'key-file'
})

// A keychain that is reachable but empty, on a non-empty vault, is equally suspicious.
assert.equal(plan(true, false, false, true).use, 'refuse')

// ── Normal paths ─────────────────────────────────────────────────────────────
// File and keychain both hold a key: the file wins. Every build before 1.0.2 only ever
// mirrored to the keychain fire-and-forget and never read it back, so an entry there is
// unverified — only the file is guaranteed to be what actually encrypted the vault.
assert.deepEqual(plan(true, true, true, true), {
  use: 'file', writeKeychain: true, writeFile: false, removeFile: true, source: 'migrated'
})
// Keychain already holds the key and there is no file to contradict it: use it.
assert.deepEqual(plan(true, true, false, true), {
  use: 'keychain', writeKeychain: false, writeFile: false, removeFile: false, source: 'keychain'
})

// Legacy vault: key on disk only. Move it into the keychain, then drop the file.
assert.deepEqual(plan(true, false, true, true), {
  use: 'file', writeKeychain: true, writeFile: false, removeFile: true, source: 'migrated'
})

// Fresh install with a working keychain: the key must never touch the disk.
const fresh = plan(true, false, false, false)
assert.deepEqual(fresh, {
  use: 'generate', writeKeychain: true, writeFile: false, removeFile: false, source: 'created'
})
assert.equal(fresh.writeFile, false, 'a new key must not be written to disk when a keychain exists')

// No keychain at all: the 0600 file is the store of record and must never be deleted.
assert.deepEqual(plan(false, false, true, true), {
  use: 'file', writeKeychain: false, writeFile: false, removeFile: false, source: 'key-file'
})

console.log('vault key plan: all checks passed')
