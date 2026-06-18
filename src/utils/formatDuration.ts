/** Format seconds as "1h 02m 03s" / "2m 05s" / "12s". */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0s'
  const s = Math.floor(seconds % 60)
  const m = Math.floor((seconds / 60) % 60)
  const h = Math.floor(seconds / 3600)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

/** Short ETA form for transfers: "—" when unknown. */
export function formatEta(seconds: number): string {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '—'
  return formatDuration(seconds)
}

/** Relative "time ago" for last-connected indicators. */
export function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso.includes('Z') ? iso : iso + 'Z').getTime()
  const diff = Math.max(0, Date.now() - then) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`
  return `${Math.floor(diff / 2592000)}mo ago`
}

/** Whether a session was connected within the last 7 days (for the green dot). */
export function isRecent(iso: string | null): boolean {
  if (!iso) return false
  const then = new Date(iso.includes('Z') ? iso : iso + 'Z').getTime()
  return Date.now() - then < 7 * 86400 * 1000
}
