// Self-check for monitor targeting. Run: node --experimental-strip-types src/utils/statsTarget.check.ts
import assert from 'node:assert/strict'
import { isDead, statsTargetFor, type PaneLike } from './statsTarget.ts'

const pane = (id: string, protocol: string, state: string, host: string | null = null, message?: string) =>
  ({ id, protocol, state, host, title: `${id}-title`, message }) as unknown as PaneLike

// No SSH pane at all → the local machine really is the subject.
assert.deepEqual(statsTargetFor([pane('p1', 'local', 'connected')]), { kind: 'local' })
assert.deepEqual(statsTargetFor([]), { kind: 'local' })
assert.deepEqual(statsTargetFor(undefined), { kind: 'local' })

// Connected SSH → poll that pane.
assert.deepEqual(statsTargetFor([pane('p2', 'ssh', 'connected', 'srv1')]), {
  kind: 'remote',
  tabId: 'p2',
  host: 'srv1'
})

// The reported bug: a session mid-handshake must NOT resolve to local.
for (const state of ['connecting', 'idle', 'disconnected', 'error']) {
  const t = statsTargetFor([pane('p3', 'ssh', state, 'srv2')])
  assert.equal(t.kind, 'pending', `ssh/${state} should be pending, got ${t.kind}`)
  assert.notEqual(t.kind, 'local')
}

// A split holding a local shell plus a connecting SSH pane is still pending, not local.
assert.equal(statsTargetFor([pane('a', 'local', 'connected'), pane('b', 'ssh', 'connecting', 'srv3')]).kind, 'pending')

// A connected SSH pane wins over a sibling that is still connecting.
assert.deepEqual(statsTargetFor([pane('a', 'ssh', 'connecting', 'x'), pane('b', 'ssh', 'connected', 'y')]), {
  kind: 'remote',
  tabId: 'b',
  host: 'y'
})

// Non-SSH remote protocols cannot report stats; they keep the old local behaviour.
assert.equal(statsTargetFor([pane('r', 'rdp', 'connecting', 'win')]).kind, 'local')

// Falls back to the pane title when a host isn't set.
assert.equal(statsTargetFor([pane('p4', 'ssh', 'connecting')]).kind, 'pending')
assert.equal((statsTargetFor([pane('p4', 'ssh', 'connecting')]) as { host: string }).host, 'p4-title')

// A pane still handshaking is pending-but-alive: keep showing the spinner.
for (const state of ['connecting', 'idle']) {
  assert.equal(isDead(statsTargetFor([pane('p', 'ssh', state, 'srv')])), false, `ssh/${state} is not dead`)
}

// The reported bug: once the connection is refused, stop pretending we are still waiting.
for (const state of ['error', 'disconnected']) {
  assert.equal(isDead(statsTargetFor([pane('p', 'ssh', state, 'srv')])), true, `ssh/${state} is dead`)
}

// The failure reason rides along so the panel can name it instead of saying "waiting".
const refused = statsTargetFor([pane('p', 'ssh', 'error', 'srv', 'Connection refused')])
assert.equal(refused.kind === 'pending' && refused.message, 'Connection refused')

// Local and remote are never "dead" — there is always something to poll.
assert.equal(isDead(statsTargetFor([pane('p', 'local', 'connected')])), false)
assert.equal(isDead(statsTargetFor([pane('p', 'ssh', 'connected', 'srv')])), false)

// A dead pane next to a live one still polls the live one.
assert.equal(statsTargetFor([pane('a', 'ssh', 'error', 'x'), pane('b', 'ssh', 'connected', 'y')]).kind, 'remote')

console.log('stats targeting: all checks passed')
