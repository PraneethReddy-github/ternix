// Self-check for URL-vs-path routing in system:openPath.
// Run: node --experimental-strip-types electron/ipc/openTarget.check.ts
import assert from 'node:assert/strict'
import { isUrl } from './openTarget.ts'

// URLs → shell.openExternal (the Tailscale SSH auth link is the case that broke on Windows).
for (const u of [
  'https://login.tailscale.com/a/1a2b3c4d',
  'http://example.com',
  'vnc://host:5900',
  'ftp://files/x',
  'file:///home/user/x'
]) assert.ok(isUrl(u), `expected URL: ${u}`)

// Filesystem paths → shell.openPath (must NOT be treated as URLs).
for (const p of [
  '.',
  '/home/user/notes.txt',
  'C:\\Users\\me\\file.txt',
  'C:/Users/me/file.txt', // single slash after drive colon — not a scheme
  '\\\\server\\share',
  '/tmp/ternix-download.pdf'
]) assert.ok(!isUrl(p), `expected path: ${p}`)

console.log('openTarget: all checks passed')
