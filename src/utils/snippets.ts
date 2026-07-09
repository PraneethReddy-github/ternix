import type { Snippet } from '@shared/index'

/** Global snippets show everywhere; scoped ones only in the session that owns them. */
export const visibleInSession = (s: Snippet, sessionId: number | null): boolean =>
  s.is_global || s.session_id === sessionId
