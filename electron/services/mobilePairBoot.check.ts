// Self-check for what the phone does with a `#p=` fragment it finds at startup.
//
// This is the "closed the browser and opened it again" path. A reopened tab lands back on
// the scanned URL — same fragment, same already-spent code — and getting that wrong strands
// a phone that is still perfectly well linked on the "Link this phone" screen, with no way
// back other than a fresh scan.
//
// The phone's real pairing code is lifted out of the served page rather than copied, the
// same way mobileCrypto.interop.check.ts does, so this fails if the page drifts from it.
//
// Run: node --experimental-strip-types electron/services/mobilePairBoot.check.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import nacl from 'tweetnacl'
import { b64, pairKey, seal } from './mobileCrypto.ts'

const here = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(here, '../../resources/mobile/index.html'), 'utf8')

const marker = (name: string) => {
  const at = html.indexOf(`// ------------------------------------------------------------ ${name}`)
  assert.ok(at > 0, `could not find the ${name} block in the phone client`)
  return at
}
const CRYPTO = marker('crypto')
const SOCKET = marker('socket')

/** The storage key names, read off the page so a rename there cannot silently pass here. */
const keyName = (v: string) => {
  const m = new RegExp(`var ${v} = '([^']+)'`).exec(html)
  assert.ok(m, `could not find ${v} in the phone client`)
  return m![1]
}
const KEY_KEY = keyName('KEY_KEY')
const USED_KEY = keyName('USED_KEY')

interface Reply { ok: boolean; body: unknown }

/**
 * Boot the page's pairing code against fakes for everything a browser would provide, then
 * hand back what it did: whether it posted to /pair, whether it went on to connect, and
 * what ended up in storage.
 */
function boot(opts: { stored?: Record<string, string>; hash: string; reply: Reply | Error }) {
  const store: Record<string, string> = { ...opts.stored }
  const els: Record<string, { textContent: string }> = {}
  const calls = { pairPosts: [] as string[], connects: 0 }

  const localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] }
  }
  const location = { hash: opts.hash, pathname: '/', protocol: 'http:', host: '192.168.1.9:8021' }
  const history = { replaceState: (_s: unknown, _t: string, url: string) => { location.hash = ''; location.pathname = url } }
  const fetch = (_url: string, init: { body: string }) => {
    calls.pairPosts.push(init.body)
    if (opts.reply instanceof Error) return Promise.reject(opts.reply)
    const { ok, body } = opts.reply
    return Promise.resolve({ ok, json: () => Promise.resolve(body) })
  }
  const navigator = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }
  const $ = (id: string) => (els[id] ??= { textContent: '' })

  const body = `
    var KEY_KEY = ${JSON.stringify(KEY_KEY)};
    var USED_KEY = ${JSON.stringify(USED_KEY)};
    var deviceKey = localStorage.getItem(KEY_KEY);
    function connect() { __calls.connects++; }
    ${html.slice(CRYPTO, SOCKET)}
    return { pairFromHash: pairFromHash, deviceKey: function () { return deviceKey; } };
  `
  const page = new Function('nacl', 'localStorage', 'location', 'history', 'fetch', 'navigator', '$', '__calls', body)(
    nacl, localStorage, location, history, fetch, navigator, $, calls
  ) as { pairFromHash: () => void; deviceKey: () => string | null }

  page.pairFromHash()
  // One macrotask drains every microtask the fetch chain queued.
  return new Promise<{ calls: typeof calls; store: typeof store; err: string; key: string | null }>((resolve) =>
    setTimeout(() => resolve({ calls, store, err: els.pairErr?.textContent ?? '', key: page.deviceKey() }), 0)
  )
}

const secret = () => Buffer.from(nacl.randomBytes(32)).toString('base64url')
const linkKey = () => b64(nacl.randomBytes(nacl.secretbox.keyLength))

// ── A first link: the code is redeemed and both the key and the code are kept ────────────
{
  const s = secret()
  const issued = linkKey()
  const r = await boot({ hash: `#p=${s}`, reply: { ok: true, body: { sealed: seal({ key: issued }, pairKey(s)) } } })

  assert.equal(r.calls.pairPosts.length, 1, 'an unseen code must be redeemed')
  assert.equal(r.key, issued, 'the link key from the reply must be adopted')
  assert.equal(r.store[KEY_KEY], issued, 'the link key must be persisted')
  assert.equal(r.store[USED_KEY], s, 'the spent code must be remembered, or reopening replays it')
  assert.equal(r.calls.connects, 1, 'a successful link must connect')
}

// ── Reopened onto the same URL: the spent code is not replayed ───────────────────────────
// Replaying it cannot succeed — a code is single use — and every failure counts against
// the live code on the desktop, so five reopens would burn the QR the user is looking at.
{
  const s = secret()
  const held = linkKey()
  const r = await boot({
    stored: { [KEY_KEY]: held, [USED_KEY]: s },
    hash: `#p=${s}`,
    reply: { ok: false, body: { error: 'Invalid or expired code' } }
  })

  assert.equal(r.calls.pairPosts.length, 0, 'a code this phone already spent must not be sent again')
  assert.equal(r.calls.connects, 1, 'the phone is still linked — it must just connect')
  assert.equal(r.key, held, 'the held link key must survive untouched')
  assert.equal(r.err, '', 'nothing failed, so nothing should be reported as failing')
}

// ── A genuinely stale code, with a link key in hand: refused, but not stranded ───────────
{
  const held = linkKey()
  const r = await boot({
    stored: { [KEY_KEY]: held },
    hash: `#p=${secret()}`,
    reply: { ok: false, body: { error: 'Invalid or expired code' } }
  })

  assert.equal(r.calls.pairPosts.length, 1, 'an unrecognised code is worth one attempt')
  assert.equal(r.calls.connects, 1, 'a refused code says nothing about the key already held')
  assert.equal(r.key, held, 'a failed pairing must never discard a working link key')
}

// ── Unreachable server, with a link key in hand: same — fall through to reconnecting ─────
{
  const held = linkKey()
  const r = await boot({ stored: { [KEY_KEY]: held }, hash: `#p=${secret()}`, reply: new Error('offline') })

  assert.equal(r.calls.connects, 1, 'a failed pair request must fall back to the normal reconnect')
  assert.equal(r.key, held)
}

// ── No link key and the code is dead: this phone really does need linking ────────────────
{
  const r = await boot({ hash: `#p=${secret()}`, reply: { ok: false, body: { error: 'Invalid or expired code' } } })

  assert.equal(r.calls.connects, 0, 'there is nothing to connect with')
  assert.equal(r.key, null)
  assert.match(r.err, /expired/i, 'the reason must reach the screen')
}

// ── A damaged fragment is rejected before anything is sent ───────────────────────────────
// 47 base64url characters decode to 35 bytes, so this one is long enough to match the
// pattern but is not a 256-bit key.
{
  const r = await boot({ hash: '#p=' + 'A'.repeat(47), reply: { ok: true, body: {} } })
  assert.equal(r.calls.pairPosts.length, 0, 'a fragment that is not a 256-bit key is not a code')
  assert.match(r.err, /damaged/i)
}

console.log('mobilePairBoot: all checks passed')
