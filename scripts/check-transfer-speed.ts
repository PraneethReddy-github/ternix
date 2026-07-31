/**
 * Status-bar throughput check: `node scripts/check-transfer-speed.ts`
 *
 * Three concurrent files each *claim* 50 MB/s while only 3 MB actually moves per 0.6 s. The
 * footer must report what moved (~5 MB/s), not the sum of the claims (150 MB/s).
 */
import assert from 'node:assert/strict'
import { useTransferStore } from '../src/store/useTransferStore.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const MB = 1024 * 1024

const progress = (id: string, transferred: number, status = 'active') =>
  ({
    transferId: id,
    direction: 'upload',
    filename: `${id}.bin`,
    localPath: `/tmp/${id}.bin`,
    remotePath: `/tmp/${id}.bin`,
    transferred,
    total: 10 * MB,
    bytesPerSecond: 50 * MB, // the inflated per-file sample the old footer trusted
    etaSeconds: 1,
    status
  }) as any

const ids = ['a', 'b', 'c']
const { upsert, totalSpeed } = useTransferStore.getState()

// 1 MB per file per round. The first round only opens the sample window (its baseline was
// taken before any file had reported), so read the rate once a full window has passed.
for (const mb of [0, 1, 2]) {
  ids.forEach((id) => upsert(progress(id, mb * MB)))
  await sleep(600)
}

const speed = totalSpeed()
assert.ok(speed > 3 * MB && speed < 7 * MB, `expected ~5 MB/s, got ${(speed / MB).toFixed(1)} MB/s`)

// Finished queue: no events left to re-sample, so the rate must not linger.
ids.forEach((id) => upsert(progress(id, 10 * MB, 'done')))
assert.equal(totalSpeed(), 0)

console.log(`ok — ${(speed / MB).toFixed(1)} MB/s measured, 150 MB/s not reported`)
