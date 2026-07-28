// Self-check for the phone link's sealing and its handshake.
// Run: node --experimental-strip-types electron/services/mobileCrypto.check.ts
import assert from 'node:assert/strict'
import nacl from 'tweetnacl'
import { b64, open, pairKey, seal, unb64 } from './mobileCrypto.ts'

const key = nacl.randomBytes(nacl.secretbox.keyLength)

// ── A sealed value survives the round trip intact ────────────────────────────
{
  const value = { t: 'input', data: 'sudo rm -rf --no-preserve-root /\r' }
  const opened = open<typeof value>(seal(value, key), key)
  assert.deepEqual(opened, value, 'sealing then opening must return the original')
}

// ── The plaintext must not be visible in the frame ───────────────────────────
{
  const frame = seal({ data: 'hunter2-the-password' }, key)
  assert.ok(!frame.includes('hunter2'), 'the secret must not survive in the frame')
  assert.ok(!Buffer.from(frame, 'utf8').includes(Buffer.from('hunter2')), 'nor anywhere in its bytes')
}

// ── The wrong key opens nothing ──────────────────────────────────────────────
{
  const frame = seal({ data: 'secret' }, key)
  assert.equal(open(frame, nacl.randomBytes(nacl.secretbox.keyLength)), null, 'a wrong key must yield null')
}

// ── Tampering is detected, not silently accepted ─────────────────────────────
{
  const frame = seal({ t: 'input', data: 'ls' }, key)
  const [nonce, box] = frame.split('.')

  // Flip one bit of the ciphertext.
  const bytes = unb64(box)
  bytes[bytes.length >> 1] ^= 0x01
  assert.equal(open(`${nonce}.${b64(bytes)}`, key), null, 'a flipped ciphertext bit must be rejected')

  // Reuse a valid box under a different nonce.
  assert.equal(open(`${b64(nacl.randomBytes(24))}.${box}`, key), null, 'a swapped nonce must be rejected')
}

// ── Garbage in never throws, it just fails ───────────────────────────────────
for (const junk of ['', '.', 'no-dot-here', 'AAAA.BBBB', '....', 'x'.repeat(500)]) {
  assert.equal(open(junk, key), null, `"${junk.slice(0, 12)}" must be refused, not thrown on`)
}

// ── Nonces do not repeat across seals of identical input ─────────────────────
{
  const seen = new Set(Array.from({ length: 200 }, () => seal({ same: 'payload' }, key).split('.')[0]))
  assert.equal(seen.size, 200, 'every seal must draw a fresh nonce')
}

// ── The pairing secret survives its trip through a URL fragment ──────────────
{
  const secret = Buffer.from(nacl.randomBytes(32)).toString('base64url')
  assert.ok(!/[+/=]/.test(secret), 'the secret must be URL-fragment safe')
  const derived = pairKey(secret)
  assert.equal(derived.length, nacl.secretbox.keyLength, 'the secret must be a full-width key')
  assert.deepEqual(open(seal({ name: 'iPhone' }, derived), pairKey(secret)), { name: 'iPhone' })
}

// ── The handshake: both ends land on the same per-connection key ─────────────
{
  const phone = nacl.box.keyPair()
  const desktop = nacl.box.keyPair()

  // The phone seals its ephemeral public key under the device link key; the desktop opens
  // it, replies in kind, and both derive the session key from the ephemeral pair.
  const hello = seal({ epub: b64(phone.publicKey) }, key)
  const seen = open<{ epub: string }>(hello, key)
  assert.ok(seen, 'the desktop must be able to open a genuine hello')

  const phoneSession = nacl.box.before(desktop.publicKey, phone.secretKey)
  const deskSession = nacl.box.before(unb64(seen!.epub), desktop.secretKey)
  assert.deepEqual([...deskSession], [...phoneSession], 'both ends must derive the same session key')

  // An eavesdropper holding the whole transcript but neither secret key gets nothing.
  const impostor = nacl.box.keyPair()
  const guessed = nacl.box.before(unb64(seen!.epub), impostor.secretKey)
  assert.notDeepEqual([...guessed], [...phoneSession], 'a captured transcript must not yield the key')
  assert.equal(open(seal({ t: 'data', d: 'root@box:~#' }, phoneSession), guessed), null)

  // And the session key is unrelated to the long-term device key, so a later leak of the
  // device key does not open a recording of this connection.
  assert.equal(open(seal({ t: 'data', d: 'secret' }, phoneSession), key), null, 'no forward secrecy without this')
}

console.log('mobileCrypto.check.ts — all assertions passed')
