// Self-check for transfer rate measurement.
// Run: node --experimental-strip-types electron/services/transferRate.check.ts
import assert from 'node:assert/strict'
import { bytesPerSecond, MIN_RATE_WINDOW_MS } from './transferRate.ts'

// The reported bug: a 40 KB file read from page cache in 1 ms must not read as 40 MB/s.
// Floored to the 250 ms window it reports ~160 KB/s — an understatement, never a fiction.
assert.equal(bytesPerSecond(40_960, 1), 163_840)
assert.ok(bytesPerSecond(40_960, 1) < 1_000_000, 'sub-millisecond reads must never report MB/s')

// A whole SFTP chunk landing in one event was the worst offender (260 MB/s before).
assert.ok(bytesPerSecond(260_096, 1) < 1_100_000)

// 30 concurrent small files must stay in a plausible total, not sum to hundreds of MB/s.
const batch = [...Array(30)].reduce((sum) => sum + bytesPerSecond(40_960, 2), 0)
assert.ok(batch < 10_000_000, `30 small files summed to ${batch} B/s`)

// Past the floor it is a plain average: 10 MB in 2 s is 5 MB/s.
assert.equal(bytesPerSecond(10 * 1024 * 1024, 2000), 5 * 1024 * 1024)

// Exactly at the floor, no clamping applies.
assert.equal(bytesPerSecond(1000, MIN_RATE_WINDOW_MS), 4000)

// Degenerate inputs report nothing rather than Infinity/NaN reaching the UI.
assert.equal(bytesPerSecond(0, 0), 0)
assert.equal(bytesPerSecond(-1, 100), 0)
assert.ok(Number.isFinite(bytesPerSecond(1, 0)))

console.log('transferRate.check.ts ok')
