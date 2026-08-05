import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'
import type { ShellProfile } from '@shared/index'

const exists = (p: string): boolean => {
  try {
    return !!p && existsSync(p)
  } catch {
    return false
  }
}

/**
 * Parse `wsl.exe --list --quiet` output. It is written as **UTF-16LE** — decoding the
 * buffer as utf8 puts a NUL between every character, which is why naive versions of this
 * list distros that look empty. The NUL strip is a second belt for a BOM-prefixed line.
 */
export function parseWslList(raw: Buffer, wsl: string): ShellProfile[] {
  return raw
    .toString('utf16le')
    .split(/\r?\n/)
    .map((l) => l.replace(/[\0\uFEFF]/g, '').trim())
    .filter(Boolean)
    .map((distro) => ({ name: distro, shell: wsl, args: ['-d', distro] }))
}

/**
 * One entry per label. The menu is a list of names, so a second row reading "PowerShell"
 * (the WindowsApps alias for the same install) or "sh" (the same binary either side of the
 * usr-merge symlink) is pure noise. First found wins, and probing order puts the canonical
 * path first.
 *
 * Keyed on the name rather than the path because WSL distros all run the same `wsl.exe` and
 * must stay distinct, while one shell under two paths must not. ponytail: this hides a
 * second install sharing a name (Homebrew bash alongside /bin/bash) — that user can point
 * `general.defaultShell` straight at the path.
 */
export function dedupeShells(found: ShellProfile[]): ShellProfile[] {
  const seen = new Set<string>()
  return found.filter((p) => {
    if (seen.has(p.name)) return false
    seen.add(p.name)
    return true
  })
}

function wslDistros(wsl: string): ShellProfile[] {
  if (!exists(wsl)) return []
  try {
    return parseWslList(execFileSync(wsl, ['--list', '--quiet'], { timeout: 5000, windowsHide: true }), wsl)
  } catch {
    // No WSL installed, or the feature is present but has no distros — either way, none.
    return []
  }
}

function windowsShells(): ShellProfile[] {
  const sysRoot = process.env.SystemRoot || 'C:\\Windows'
  const pf = process.env.ProgramFiles || 'C:\\Program Files'
  const local = process.env.LOCALAPPDATA || ''
  const out: ShellProfile[] = []
  const add = (name: string, shell: string, args?: string[]) => {
    if (exists(shell)) out.push({ name, shell, args })
  }

  add('Windows PowerShell', `${sysRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`)
  // PowerShell 7+ lives outside System32 and isn't reliably on a GUI app's PATH.
  add('PowerShell', `${pf}\\PowerShell\\7\\pwsh.exe`)
  add('PowerShell', `${local}\\Microsoft\\WindowsApps\\pwsh.exe`)
  add('Command Prompt', `${sysRoot}\\System32\\cmd.exe`)
  // Git Bash needs a login+interactive shell or it starts without its profile or a prompt.
  add('Git Bash', `${pf}\\Git\\bin\\bash.exe`, ['--login', '-i'])
  add('Git Bash', `${process.env['ProgramFiles(x86)'] || ''}\\Git\\bin\\bash.exe`, ['--login', '-i'])
  out.push(...wslDistros(`${sysRoot}\\System32\\wsl.exe`))
  return out
}

function unixShells(): ShellProfile[] {
  const paths = new Set<string>()
  if (process.env.SHELL) paths.add(process.env.SHELL)
  try {
    for (const line of readFileSync('/etc/shells', 'utf8').split('\n')) {
      const s = line.trim()
      if (s && !s.startsWith('#')) paths.add(s)
    }
  } catch {
    /* not every system ships /etc/shells */
  }
  for (const s of ['/bin/bash', '/bin/zsh', '/bin/fish', '/usr/bin/fish', '/bin/sh']) paths.add(s)
  // $SHELL was added first, so the user's own shell heads the menu (and wins its label
  // during dedupe). Symlinks are deliberately left unresolved: rbash and sh *are* bash
  // reached under another name, and realpath would fold three shells into one.
  return [...paths].filter(exists).map((shell) => ({ name: basename(shell), shell }))
}

/** Probed once — this shells out to wsl.exe, and installed shells don't change mid-session. */
let cached: ShellProfile[] | null = null

/**
 * Shells installed on this machine, for the "+" button's right-click menu. Empty is a
 * valid answer (the caller then just opens the default shell).
 */
export const ShellService = {
  list(): ShellProfile[] {
    cached ??= dedupeShells(process.platform === 'win32' ? windowsShells() : unixShells())
    return cached
  }
}
