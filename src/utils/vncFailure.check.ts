// Self-check for noVNC failure-line parsing.
// Run: node --experimental-strip-types src/utils/vncFailure.check.ts
import assert from 'node:assert/strict'
import { parseRfbFailure, explainVncFailure } from './vncFailure.ts'

// The four shapes noVNC's _fail() emits.
assert.equal(
  parseRfbFailure('Failed when connecting: Unsupported security types (types: 5)'),
  'Unsupported security types (types: 5)'
)
assert.equal(parseRfbFailure('Failed while connected: Disconnect timeout'), 'Disconnect timeout')
assert.equal(parseRfbFailure('Failed when disconnecting: bad state'), 'bad state')
assert.equal(parseRfbFailure('RFB failure: Got data while disconnected'), 'Got data while disconnected')

// Everything else on the console must be ignored, including noVNC's other Log.Error lines.
assert.equal(parseRfbFailure('Tried changing state of a disconnected RFB object'), null)
assert.equal(parseRfbFailure('Uncaught TypeError: x is not a function'), null)
assert.equal(parseRfbFailure(''), null)

// VeNCrypt subtypes are 32-bit and share noVNC's message with the 1-byte security types —
// 262 is X509Plain (TLS), NOT security type 5. The advice has to differ.
const x509 = explainVncFailure('Unsupported security types (types: 262)')
assert.match(x509, /262 \(VeNCrypt X509Plain\)/)
assert.doesNotMatch(x509, /RealVNC Server's encrypted default/)
// The bridge negotiates X509 itself, so this must NOT be blamed on anonymous TLS.
assert.doesNotMatch(x509, /anonymous/)

// Anonymous-DH subtypes are the ones that genuinely dead-end, and say why.
const anon = explainVncFailure('Unsupported security types (types: 258,259)')
assert.match(anon, /258 \(VeNCrypt TLSVnc\)/)
assert.match(anon, /anonymous TLS/)
assert.match(anon, /wayvnc/)

const ra2 = explainVncFailure('Unsupported security types (types: 5,129)')
assert.match(ra2, /5 \(RealVNC RSA-AES, encrypted\)/)
assert.match(ra2, /Encryption=PreferOff/)
assert.doesNotMatch(ra2, /wayvnc/)

// A mixed list is not purely anonymous TLS, so it must not blame anonymous DH.
assert.doesNotMatch(explainVncFailure("Unsupported security types (types: 258,18)"), /anonymous TLS/)

// Unknown numbers still render, and non-"unsupported types" reasons pass through verbatim.
assert.match(explainVncFailure('Unsupported security types (types: 77)'), /77 \(unknown\)/)
assert.equal(explainVncFailure('Authentication failure'), 'Authentication failure')
assert.equal(explainVncFailure('Unsupported security types (types: )'), 'Unsupported security types (types: )')

console.log('vncFailure: all checks passed')
