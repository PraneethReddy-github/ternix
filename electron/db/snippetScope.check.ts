// Self-check for snippet scoping. Run: node --experimental-strip-types electron/db/snippetScope.check.ts
import assert from 'node:assert/strict'
import { scopeSnippet } from './snippetScope.ts'
import { visibleInSession } from '../../src/utils/snippets.ts'

// Global wins regardless of any session id riding along, so toggling the box back to
// global never leaves a stale owner behind.
assert.deepEqual(scopeSnippet(true, null), { is_global: 1, session_id: null })
assert.deepEqual(scopeSnippet(true, 7), { is_global: 1, session_id: null })
assert.deepEqual(scopeSnippet(undefined, null), { is_global: 1, session_id: null })

// Unchecking the box records the owning session.
assert.deepEqual(scopeSnippet(false, 7), { is_global: 0, session_id: 7 })

// An unowned scoped snippet would be visible from nowhere: refuse to write it.
assert.throws(() => scopeSnippet(false, null), /must belong to a session/)
assert.throws(() => scopeSnippet(false, undefined), /must belong to a session/)

const snip = (is_global: boolean, session_id: number | null) =>
  ({ is_global, session_id }) as Parameters<typeof visibleInSession>[0]

// Global snippets show everywhere, including on local tabs with no session.
assert.equal(visibleInSession(snip(true, null), 7), true)
assert.equal(visibleInSession(snip(true, null), null), true)

// Scoped snippets show only in their own session — this is the bug that was reported.
assert.equal(visibleInSession(snip(false, 7), 7), true)
assert.equal(visibleInSession(snip(false, 7), 8), false)
assert.equal(visibleInSession(snip(false, 7), null), false)

console.log('snippet scoping: all checks passed')
