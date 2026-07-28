// Self-check for the phone pairing gate.
// Run: node --experimental-strip-types electron/services/pairingGate.check.ts
import assert from 'node:assert/strict'
import { redeemPairing, type PairState } from './pairingGate.ts'

const MAX = 5
const NOW = 1_000_000
const SECRET = 'wR8kQx2vN4pL9tHc7mJb3sYd6fZa1gVe5nKu0iOx4Tw'
const live = (attempts = 0): PairState => ({ secret: SECRET, expires: NOW + 1000, attempts })

/** Stands in for "the phone sealed its request under the secret it scanned". */
const holds = (scanned: string) => (secret: string) => scanned === secret
const holdsNothing = holds('not-the-secret')

// ── A phone holding the secret redeems it, exactly once ──────────────────────
{
  const v = redeemPairing(live(), holds(SECRET), NOW, MAX)
  assert.ok(v.ok, 'proof of the correct secret must be accepted')
  assert.equal(v.next, null, 'a redeemed pairing must not survive — single use')
}

// ── No pairing outstanding: nothing is redeemable ────────────────────────────
{
  const v = redeemPairing(null, holds(SECRET), NOW, MAX)
  assert.ok(!v.ok)
  assert.equal(v.reason, 'no-code')
}

// ── Expiry beats correctness ─────────────────────────────────────────────────
{
  const v = redeemPairing(live(), holds(SECRET), NOW + 5000, MAX)
  assert.ok(!v.ok, 'an expired pairing must be refused even with the right secret')
  assert.equal(v.next, null, 'an expired pairing must be retired')
  assert.equal(v.reason, 'expired')
}

// ── Failed proofs burn the pairing ───────────────────────────────────────────
{
  let state: PairState | null = live()
  for (let i = 1; i < MAX; i++) {
    const v = redeemPairing(state, holdsNothing, NOW, MAX)
    assert.ok(!v.ok)
    assert.ok(v.next, `attempt ${i} should leave the pairing alive`)
    assert.equal(v.next!.attempts, i, 'each failure must be counted')
    state = v.next
  }
  const last = redeemPairing(state, holdsNothing, NOW, MAX)
  assert.ok(!last.ok)
  assert.equal(last.next, null, `the pairing must be destroyed on failure ${MAX}`)
  assert.equal(last.reason, 'burned')

  // And once burned, even the real secret is worthless.
  assert.ok(!redeemPairing(last.next, holds(SECRET), NOW, MAX).ok, 'a burned pairing must stay dead')
}

// ── A near-miss secret is still a miss ───────────────────────────────────────
for (const guess of ['', SECRET.slice(0, -1), SECRET + 'x', SECRET.toUpperCase()]) {
  assert.ok(!redeemPairing(live(), holds(guess), NOW, MAX).ok, `"${guess.slice(0, 12)}…" must not be accepted`)
}

console.log('pairingGate.check.ts — all assertions passed')
