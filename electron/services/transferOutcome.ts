/**
 * Outcome accounting for a batch (folder) transfer.
 * Kept dependency-free so both SftpService and its self-check can import it.
 */

/** Thrown by a transfer the user cancelled, so a batch can tell it apart from a failure. */
export class TransferCancelledError extends Error {
  constructor(filename?: string) {
    super(filename ? `Transfer cancelled: ${filename}` : 'Transfer cancelled')
    this.name = 'TransferCancelledError'
  }
}

export interface BatchOutcome {
  completed: number
  cancelled: number
  failures: string[]
}

/**
 * Cancelling one file must not fail the folder — that is the whole point of a per-file
 * cancel button. Real errors still surface; cancellations are counted and forgiven.
 */
export function summarize(results: PromiseSettledResult<unknown>[]): BatchOutcome {
  const out: BatchOutcome = { completed: 0, cancelled: 0, failures: [] }
  for (const r of results) {
    if (r.status === 'fulfilled') out.completed++
    else if (r.reason instanceof TransferCancelledError) out.cancelled++
    else out.failures.push(r.reason instanceof Error ? r.reason.message : String(r.reason))
  }
  return out
}
