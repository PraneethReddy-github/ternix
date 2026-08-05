/**
 * Shortest window (ms) a transfer rate may be measured over. Anything that finishes faster
 * is reported as if it took this long — under-stating a blink-long transfer beats dividing
 * by a millisecond and claiming 500 MB/s.
 */
export const MIN_RATE_WINDOW_MS = 250

/**
 * Average throughput of a transfer, in bytes/second.
 *
 * Deliberately an average over the whole transfer rather than a delta since the last
 * sample: a file smaller than one SFTP chunk arrives in a single ~1 ms page-cached read,
 * and delta/0.001s reported hundreds of MB/s off a local disk read. That was the only
 * sample such a file ever produced, and the status bar sums the per-file rate across every
 * concurrent transfer — which is why 30-40 small files read as 500 MB/s while large ones
 * (many samples, self-correcting) looked right.
 *
 * ponytail: a running average lags a rate that changes mid-transfer. Swap in an EWMA if
 * responsiveness ever matters more than never lying.
 */
export function bytesPerSecond(transferred: number, elapsedMs: number): number {
  if (transferred <= 0) return 0
  return Math.round(transferred / (Math.max(elapsedMs, MIN_RATE_WINDOW_MS) / 1000))
}
