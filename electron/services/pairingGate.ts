/** An outstanding pairing. `null` means no pairing is in progress. */
export interface PairState {
  /** The 256-bit pairing secret, base64url. Only ever leaves the machine inside the QR. */
  secret: string
  expires: number
  attempts: number
}

export type PairReason = 'no-code' | 'expired' | 'wrong' | 'burned'

export interface PairVerdict {
  /** True only when the caller proved it holds the live pairing secret. */
  ok: boolean
  /** The pairing state to keep. `null` retires the secret — used up, expired, or burned. */
  next: PairState | null
  reason?: PairReason
}

/**
 * Decides whether a pairing attempt may be redeemed.
 *
 * The secret is never presented over the network — the phone proves it holds one by
 * sealing its request under it, and `verify` is what tries to open that. This function
 * owns only the lifecycle around that proof: single-use, time-limited, and destroyed
 * after `maxAttempts` failures. Those three are what stop a pairing window being useful
 * to anyone but the phone that scanned the QR, so they live in one pure function with a
 * self-check rather than scattered through the server.
 *
 * No constant-time compare here any more: `verify` succeeds only by decrypting under the
 * secret, and a Poly1305 tag either authenticates or it does not — there is no prefix to
 * walk, so there is no timing signal to leak.
 */
export function redeemPairing(
  state: PairState | null,
  verify: (secret: string) => boolean,
  now: number,
  maxAttempts: number
): PairVerdict {
  if (!state) return { ok: false, next: null, reason: 'no-code' }
  if (now > state.expires) return { ok: false, next: null, reason: 'expired' }

  if (!verify(state.secret)) {
    const attempts = state.attempts + 1
    if (attempts >= maxAttempts) return { ok: false, next: null, reason: 'burned' }
    return { ok: false, next: { ...state, attempts }, reason: 'wrong' }
  }
  return { ok: true, next: null }
}
