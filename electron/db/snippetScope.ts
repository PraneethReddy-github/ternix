/**
 * The two states a snippet may be in. A global snippet belongs to no session; a scoped one
 * must name the session that owns it, otherwise it is visible from nowhere.
 * Kept dependency-free so both the repo and its self-check can import it.
 */
export function scopeSnippet(is_global: boolean | undefined, session_id: number | null | undefined) {
  if (is_global !== false) return { is_global: 1 as const, session_id: null }
  if (session_id == null) throw new Error('A session-scoped snippet must belong to a session')
  return { is_global: 0 as const, session_id }
}
