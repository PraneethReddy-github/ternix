// Self-check for SFTP sorting. Run: node --experimental-strip-types src/utils/sftpSort.check.ts
import assert from 'node:assert/strict'
import { sortEntries } from './sftpSort.ts'

const e = (name: string, type: 'file' | 'directory', modified: number) => ({ name, type, modified })

const entries = [
  e('notes.md', 'file', 200),
  e('archive', 'directory', 100),
  e('server.log', 'file', 900), // newest thing on the list, and it is a file
  e('deploy', 'directory', 800),
  e('config.yml', 'file', 300)
]

// Default: the server's own order, untouched.
assert.deepEqual(
  sortEntries(entries, 'default').map((x) => x.name),
  ['notes.md', 'archive', 'server.log', 'deploy', 'config.yml']
)

// Name sort: strictly A–Z, folders interleaved with files.
assert.deepEqual(
  sortEntries(entries, 'name').map((x) => x.name),
  ['archive', 'config.yml', 'deploy', 'notes.md', 'server.log']
)

// Date sort: strictly newest first, folders interleaved.
assert.deepEqual(
  sortEntries(entries, 'modified').map((x) => x.name),
  ['server.log', 'deploy', 'config.yml', 'notes.md', 'archive']
)

// Ties on mtime fall back to name, so the order never flickers between renders.
const tied = [e('b.txt', 'file', 500), e('a.txt', 'file', 500), e('c.txt', 'file', 500)]
assert.deepEqual(sortEntries(tied, 'modified').map((x) => x.name), ['a.txt', 'b.txt', 'c.txt'])

// Sorting must not mutate the caller's array (pane.entries is React state).
const original = [...entries]
sortEntries(entries, 'modified')
sortEntries(entries, 'default')
assert.deepEqual(entries, original)

console.log('sftp sorting: all checks passed')
