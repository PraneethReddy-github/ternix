import type { SftpEntry } from '@shared/index'

export type SftpSort = 'default' | 'name' | 'modified'

type Sortable = Pick<SftpEntry, 'name' | 'type' | 'modified'>

/**
 * 'default' is whatever order the server listed, untouched.
 * The other two interleave folders and files — a sort by name means A–Z, not
 * folders-then-A–Z. Ties fall back to name so the order never flickers.
 */
export function sortEntries<T extends Sortable>(entries: readonly T[], sortBy: SftpSort): T[] {
  if (sortBy === 'default') return [...entries]
  const byName = (a: T, b: T) => a.name.localeCompare(b.name)
  return [...entries].sort((a, b) => (sortBy === 'modified' ? b.modified - a.modified || byName(a, b) : byName(a, b)))
}
