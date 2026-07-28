// Self-check for the phone session gate.
// Run: node --experimental-strip-types electron/services/mobileGate.check.ts
import assert from 'node:assert/strict'
import { gateSession, type GateSession } from './mobileGate.ts'

const base: GateSession = {
  protocol: 'ssh',
  auth_type: 'password',
  host: 'example.com',
  port: 22,
  hasPassword: true,
  ssh_key_id: null,
  jump_host_id: null
}
const s = (over: Partial<GateSession> = {}): GateSession => ({ ...base, ...over })

const known = () => true
const unknown = () => false
const noLookup = () => null

// ── The happy path: stored password on a host we already trust ───────────────
assert.ok(gateSession(s(), known, 'prompt', noLookup).ok)

// ── Missing credentials block, because the desktop would open a modal ────────
assert.equal(gateSession(s({ hasPassword: false }), known, 'prompt', noLookup).reason, 'password')
assert.equal(gateSession(s({ auth_type: 'key' }), known, 'prompt', noLookup).reason, 'key')
// A linked key satisfies key auth even with no password stored.
assert.ok(gateSession(s({ auth_type: 'key', ssh_key_id: 3, hasPassword: false }), known, 'prompt', noLookup).ok)
// Agent and none auth need nothing stored at all.
for (const auth of ['agent', 'none', 'keyboard-interactive', null]) {
  assert.ok(gateSession(s({ auth_type: auth, hasPassword: false }), known, 'prompt', noLookup).ok, `auth ${auth}`)
}

// ── An untrusted host key blocks unless the user opted into auto-accept ──────
assert.equal(gateSession(s(), unknown, 'prompt', noLookup).reason, 'hostkey')
assert.equal(gateSession(s(), unknown, 'strict', noLookup).reason, 'hostkey')
assert.ok(gateSession(s(), unknown, 'auto-accept', noLookup).ok, 'auto-accept never prompts')

// ── Non-SSH protocols answer their own prompts inside the terminal ───────────
for (const p of ['local', 'telnet', 'serial']) {
  assert.ok(gateSession(s({ protocol: p, hasPassword: false }), unknown, 'strict', noLookup).ok, p)
}
// …but graphical protocols are not terminals at all.
for (const p of ['rdp', 'vnc']) {
  assert.equal(gateSession(s({ protocol: p }), known, 'prompt', noLookup).reason, 'protocol')
}

// ── A chain is only as open as its weakest hop ───────────────────────────────
{
  const jump = s({ hasPassword: false })
  const v = gateSession(s({ jump_host_id: 7 }), known, 'prompt', (id) => (id === 7 ? jump : null))
  assert.equal(v.reason, 'password', 'a blocked jump host must block the whole chain')
}
{
  const jump = s()
  assert.ok(gateSession(s({ jump_host_id: 7 }), known, 'prompt', (id) => (id === 7 ? jump : null)).ok)
}
// A jump host pointing at itself must terminate rather than recurse forever.
{
  const loop: GateSession = s({ jump_host_id: 7 })
  assert.ok(gateSession(loop, known, 'prompt', () => loop).ok, 'a cyclic chain must not hang')
}
// A dangling jump-host id is left to fail at connect time, like the desktop does.
assert.ok(gateSession(s({ jump_host_id: 99 }), known, 'prompt', noLookup).ok)

console.log('mobileGate.check.ts — all assertions passed')
