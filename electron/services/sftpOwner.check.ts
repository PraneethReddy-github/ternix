// Self-check for longname parsing. Run: node --experimental-strip-types electron/services/sftpOwner.check.ts
import assert from 'node:assert/strict'
import { ownerFromLongname } from './sftpOwner.ts'

const uid = { owner: '0', group: '0' }

// The ordinary OpenSSH shape, with the ragged column padding real servers emit.
assert.deepEqual(ownerFromLongname('-rw-r--r--   1 root  wheel   4096 Jul  9 12:00 notes.md', uid), {
  owner: 'root',
  group: 'wheel'
})
assert.deepEqual(ownerFromLongname('drwxr-xr-x    2 praneeth praneeth     4096 Jan 12  2025 deploy', uid), {
  owner: 'praneeth',
  group: 'praneeth'
})

// Servers that don't resolve names still send numbers there; passing them through is correct.
assert.deepEqual(ownerFromLongname('-rw-r--r-- 1 1000 1000 12 Jul 9 12:00 a', uid), { owner: '1000', group: '1000' })

// Anything that isn't the Unix shape falls back to the uid/gid we already had.
assert.deepEqual(ownerFromLongname(undefined, uid), uid)
assert.deepEqual(ownerFromLongname('', uid), uid)
assert.deepEqual(ownerFromLongname('07-09-2026  12:00PM   4096 notes.md', uid), uid) // Windows SFTP
assert.deepEqual(ownerFromLongname('-rw-r--r-- root wheel 4096 Jul 9 notes.md', uid), uid) // no nlink column

console.log('sftp owner parsing: all checks passed')
