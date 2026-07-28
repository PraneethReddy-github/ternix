// Cross-implementation check: the phone seals with browser primitives (btoa/TextEncoder),
// the desktop seals with node Buffers. Both must open each other's frames, or the link
// silently fails at runtime with no useful error anywhere.
//
// The phone's functions are lifted out of the served page rather than copied, so this
// fails if the two implementations ever drift apart.
//
// Run: node --experimental-strip-types electron/services/mobileCrypto.interop.check.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import nacl from 'tweetnacl'
import { b64, open, pairKey, seal, unb64 } from './mobileCrypto.ts'

const here = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(here, '../../resources/mobile/index.html'), 'utf8')

// Slice the phone's crypto helpers out of the page, between its section markers.
const start = html.indexOf('// ------------------------------------------------------------ crypto')
const end = html.indexOf('// ------------------------------------------------------------ pairing')
assert.ok(start > 0 && end > start, 'could not find the crypto block in the phone client')

const phone = new Function(
  'nacl',
  `${html.slice(start, end)}\nreturn { b64: b64, unb64: unb64, unb64url: unb64url, seal: seal, unseal: unseal };`
)(nacl) as {
  b64: (u: Uint8Array) => string
  unb64: (s: string) => Uint8Array
  unb64url: (s: string) => Uint8Array
  seal: (v: unknown, k: Uint8Array) => string
  unseal: (f: string, k: Uint8Array) => any
}

const key = nacl.randomBytes(nacl.secretbox.keyLength)

// ── base64 agrees in both directions ─────────────────────────────────────────
{
  const bytes = nacl.randomBytes(64)
  assert.equal(phone.b64(bytes), b64(bytes), 'base64 encoding must match')
  assert.deepEqual([...phone.unb64(b64(bytes))], [...bytes], 'the phone must decode desktop base64')
  assert.deepEqual([...unb64(phone.b64(bytes))], [...bytes], 'the desktop must decode phone base64')
}

// ── Each side opens what the other sealed ────────────────────────────────────
{
  const fromPhone = { t: 'input', data: 'echo "héllo → 世界"\r' }
  assert.deepEqual(open(phone.seal(fromPhone, key), key), fromPhone, 'desktop must open a phone frame')

  const fromDesktop = { t: 'data', d: 'user@host:~$ ✓ ünïcode' }
  assert.deepEqual(phone.unseal(seal(fromDesktop, key), key), fromDesktop, 'phone must open a desktop frame')
}

// ── The pairing secret decodes identically from the URL fragment ─────────────
{
  const secret = Buffer.from(nacl.randomBytes(32)).toString('base64url')
  assert.deepEqual([...phone.unb64url(secret)], [...pairKey(secret)], 'base64url must decode the same both sides')

  // The real pairing exchange: phone seals its name, desktop replies with the link key.
  const opened = open<{ name: string }>(phone.seal({ name: 'iPhone' }, phone.unb64url(secret)), pairKey(secret))
  assert.deepEqual(opened, { name: 'iPhone' }, 'the desktop must open the pairing request')

  const linkKey = nacl.randomBytes(nacl.secretbox.keyLength)
  const back = phone.unseal(seal({ key: b64(linkKey) }, pairKey(secret)), phone.unb64url(secret))
  assert.deepEqual([...phone.unb64(back.key)], [...linkKey], 'the phone must recover the link key')
}

// ── The full handshake, run across both implementations ──────────────────────
{
  const eph = nacl.box.keyPair()            // the phone's ephemeral pair
  const desktop = nacl.box.keyPair()

  const hello = open<{ epub: string }>(phone.seal({ epub: phone.b64(eph.publicKey) }, key), key)
  assert.ok(hello, 'the desktop must open the phone hello')

  const deskSession = nacl.box.before(unb64(hello!.epub), desktop.secretKey)
  const reply = phone.unseal(seal({ epub: b64(desktop.publicKey) }, key), key)
  const phoneSession = nacl.box.before(phone.unb64(reply.epub), eph.secretKey)

  assert.deepEqual([...phoneSession], [...deskSession], 'both ends must agree on the session key')

  // And real traffic flows over it, in both directions.
  assert.deepEqual(open(phone.seal({ t: 'input', data: 'ls -la\r' }, phoneSession), deskSession), {
    t: 'input',
    data: 'ls -la\r'
  })
  assert.equal(phone.unseal(seal({ t: 'data', d: 'total 0' }, deskSession), phoneSession).d, 'total 0')
}

// ── A tampered frame is refused by the phone too, not just the desktop ───────
{
  const frame = seal({ t: 'data', d: 'trustworthy' }, key)
  const [nonce, box] = frame.split('.')
  const bytes = unb64(box)
  bytes[0] ^= 0x80
  assert.equal(phone.unseal(`${nonce}.${b64(bytes)}`, key), null, 'the phone must reject tampering')
  assert.equal(phone.unseal(frame, nacl.randomBytes(32)), null, 'the phone must reject a wrong key')
  assert.equal(phone.unseal('garbage', key), null, 'the phone must not throw on junk')
}

console.log('mobileCrypto.interop.check.ts — all assertions passed')
