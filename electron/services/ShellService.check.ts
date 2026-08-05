// Self-check for shell discovery parsing.
// Run: node --experimental-strip-types electron/services/ShellService.check.ts
import assert from 'node:assert/strict'
import { parseWslList, dedupeShells } from './ShellService.ts'

const WSL = 'C:\\Windows\\System32\\wsl.exe'
// wsl.exe --list --quiet, verbatim: UTF-16LE, CRLF, and a trailing blank line.
const listing = Buffer.from('Ubuntu-22.04\r\nDebian\r\nkali-linux\r\n', 'utf16le')

const distros = parseWslList(listing, WSL)
assert.deepEqual(
  distros.map((d) => d.name),
  ['Ubuntu-22.04', 'Debian', 'kali-linux']
)
// Each must launch that distro specifically, not whatever the default one is.
assert.deepEqual(distros[1], { name: 'Debian', shell: WSL, args: ['-d', 'Debian'] })

// Decoding the same bytes as utf8 is the classic bug — names come back NUL-separated.
assert.ok(listing.toString('utf8').includes('\0'), 'fixture must really be UTF-16LE')
assert.ok(!distros.some((d) => d.name.includes('\0')))

// A BOM-prefixed first line must not produce a distro named "\ufeffUbuntu".
assert.equal(parseWslList(Buffer.from('\ufeffUbuntu\r\n', 'utf16le'), WSL)[0].name, 'Ubuntu')

// No distros installed: the header-less quiet output is empty, and that is not an error.
assert.deepEqual(parseWslList(Buffer.from('', 'utf16le'), WSL), [])
assert.deepEqual(parseWslList(Buffer.from('\r\n\r\n', 'utf16le'), WSL), [])

// pwsh found under both Program Files and WindowsApps is one menu entry, canonical path first.
const deduped = dedupeShells([
  { name: 'PowerShell', shell: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' },
  { name: 'PowerShell', shell: 'C:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe' },
  { name: 'Command Prompt', shell: 'C:\\Windows\\System32\\cmd.exe' }
])
assert.deepEqual(deduped.map((s) => s.name), ['PowerShell', 'Command Prompt'])
assert.equal(deduped[0].shell, 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'first found wins')

// /bin/sh and /usr/bin/sh across the usr-merge symlink are one row, not two identical ones.
assert.equal(dedupeShells([{ name: 'sh', shell: '/bin/sh' }, { name: 'sh', shell: '/usr/bin/sh' }]).length, 1)

// rbash and sh are bash under another name — different shells, so they must both survive.
assert.equal(
  dedupeShells([{ name: 'bash', shell: '/bin/bash' }, { name: 'rbash', shell: '/bin/rbash' }, { name: 'sh', shell: '/bin/sh' }]).length,
  3
)

// Distinct WSL distros share wsl.exe as their binary — dedupe must not collapse them.
assert.equal(dedupeShells(distros).length, 3, 'WSL distros differ by args, not by path')

console.log('ShellService.check.ts ok')
