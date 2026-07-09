// Self-check for batch transfer accounting.
// Run: node --experimental-strip-types electron/services/transferOutcome.check.ts
import assert from 'node:assert/strict'
import { summarize, TransferCancelledError } from './transferOutcome.ts'

const ok = (v: unknown): PromiseSettledResult<unknown> => ({ status: 'fulfilled', value: v })
const bad = (reason: unknown): PromiseSettledResult<unknown> => ({ status: 'rejected', reason })

// The reported scenario: 30 files, one big one cancelled, everything else finishes.
const batch = [...Array(29)].map((_, i) => ok(`f${i}`))
batch.splice(7, 0, bad(new TransferCancelledError('big.iso')))
const o = summarize(batch)
assert.equal(o.completed, 29)
assert.equal(o.cancelled, 1)
assert.deepEqual(o.failures, [], 'a cancelled file must not be reported as a failure')

// A real error is still a failure and must not be swallowed by the cancel path.
const withError = summarize([ok(1), bad(new Error('Permission denied')), bad(new TransferCancelledError())])
assert.equal(withError.completed, 1)
assert.equal(withError.cancelled, 1)
assert.deepEqual(withError.failures, ['Permission denied'])

// Non-Error rejections still surface rather than vanishing.
assert.deepEqual(summarize([bad('ECONNRESET')]).failures, ['ECONNRESET'])

// A cancelled error carrying no filename is still recognised as a cancellation.
assert.equal(summarize([bad(new TransferCancelledError())]).cancelled, 1)

// Empty batch is a no-op, not a failure.
assert.deepEqual(summarize([]), { completed: 0, cancelled: 0, failures: [] })

console.log('transfer outcome: all checks passed')
