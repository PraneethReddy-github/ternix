// Self-check for the VeNCrypt take-over decisions.
// Run: node --experimental-strip-types electron/services/vencrypt.check.ts
import assert from 'node:assert/strict'
import { needsBridge, pickTlsSubtype, innerAuth, SEC_PLAIN, SEC_VNC_AUTH, SEC_NONE } from './vencrypt.ts'

// Only step in when noVNC has nothing of its own to pick. Anything it already handles must
// pass through untouched — that is the whole no-regression guarantee.
assert.ok(needsBridge([19]))
assert.ok(needsBridge([19, 5])) // 5 (encrypted RA2) is not something noVNC can do
assert.ok(!needsBridge([2, 19])) // VncAuth on offer → noVNC picks it, bridge stays out
assert.ok(!needsBridge([6, 19])) // RA2ne likewise
assert.ok(!needsBridge([2])) // no VeNCrypt at all
assert.ok(!needsBridge([5, 129])) // nothing usable, but VeNCrypt can't rescue it either
assert.ok(!needsBridge([]))

// X.509 subtypes only, best first. Anonymous DH must never be selected — it authenticates
// nothing, so pinning a certificate would be meaningless.
assert.equal(pickTlsSubtype([262, 261, 260]), 262)
assert.equal(pickTlsSubtype([260, 261]), 261)
assert.equal(pickTlsSubtype([260]), 260)
assert.equal(pickTlsSubtype([257, 258, 259]), null) // TLSNone/TLSVnc/TLSPlain, anon DH
assert.equal(pickTlsSubtype([256]), null) // Plain, no TLS — noVNC does this natively
assert.equal(pickTlsSubtype([]), null)
assert.equal(pickTlsSubtype([259, 262]), 262) // prefer X509 when both are offered

// The inner scheme decides what the bridge advertises back to noVNC.
assert.equal(innerAuth(262), SEC_PLAIN)
assert.equal(innerAuth(261), SEC_VNC_AUTH)
assert.equal(innerAuth(260), SEC_NONE)
assert.throws(() => innerAuth(259), /Not a bridged VeNCrypt subtype/)

console.log('vencrypt: all checks passed')
