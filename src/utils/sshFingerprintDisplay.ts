/** Helpers for rendering SSH key fingerprints in the UI. */

/** Return the algorithm + short tail of a SHA256 fingerprint for compact display. */
export function shortFingerprint(fingerprint: string | null | undefined): string {
  if (!fingerprint) return '—'
  const body = fingerprint.replace(/^SHA256:/, '')
  if (body.length <= 16) return fingerprint
  return `SHA256:${body.slice(0, 8)}…${body.slice(-8)}`
}

/** Colorize a fingerprint deterministically so a changed key is visually obvious. */
export function fingerprintColor(fingerprint: string): string {
  let hash = 0
  for (let i = 0; i < fingerprint.length; i++) hash = (hash * 31 + fingerprint.charCodeAt(i)) >>> 0
  const hue = hash % 360
  return `hsl(${hue}, 65%, 60%)`
}

/** Convert a fingerprint into a randomart-like sparkline for quick visual comparison. */
export function fingerprintSparkline(fingerprint: string): string {
  const chars = '▁▂▃▄▅▆▇█'
  const body = fingerprint.replace(/^SHA256:/, '')
  let out = ''
  for (let i = 0; i < body.length; i += 2) {
    const code = body.charCodeAt(i) + (body.charCodeAt(i + 1) || 0)
    out += chars[code % chars.length]
  }
  return out.slice(0, 24)
}
