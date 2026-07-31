import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import { join } from 'node:path'
import type { ShellInfo } from '@shared/index'
import { ConnectionManager, type TerminalBackend } from './ConnectionManager'

const nodeRequire = createRequire(import.meta.url)
// node-pty is a native module; load via createRequire so it resolves at runtime in ESM.
const pty = nodeRequire('node-pty') as typeof import('node-pty')

export interface LocalShellOptions {
  shell?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
}

function defaultShell(): { shell: string; args: string[] } {
  if (process.platform === 'win32') {
    return { shell: process.env.COMSPEC || 'powershell.exe', args: [] }
  }
  return { shell: process.env.SHELL || '/bin/bash', args: [] }
}

/**
 * Which shells this machine actually has, for the tab bar's picker. Windows only: it's the
 * platform where cmd and PowerShell both exist and neither is a superset of the other, so a
 * single default shell setting can't serve both. Everywhere else $SHELL is the answer and the
 * list stays empty, which is what keeps the picker off those platforms.
 *
 * ponytail: fixed candidate list, and one WSL entry that opens the default distro. Both are
 * upgrades if asked for — a PATH sweep for the first, `wsl -l -q` for per-distro entries.
 */
function detectShells(): ShellInfo[] {
  if (process.platform !== 'win32') return []
  const sys = process.env.SystemRoot || 'C:\\Windows'
  const sys32 = join(sys, 'System32')
  const pf = process.env.ProgramFiles || 'C:\\Program Files'
  return [
    { name: 'Command Prompt', path: process.env.COMSPEC || join(sys32, 'cmd.exe') },
    { name: 'Windows PowerShell', path: join(sys32, 'WindowsPowerShell', 'v1.0', 'powershell.exe') },
    { name: 'PowerShell 7', path: join(pf, 'PowerShell', '7', 'pwsh.exe') },
    { name: 'Git Bash', path: join(pf, 'Git', 'bin', 'bash.exe') },
    { name: 'WSL', path: join(sys32, 'wsl.exe') }
  ].filter((c) => existsSync(c.path))
}

// Installed shells don't come and go while the app runs, so probe the disk once.
const SHELLS = detectShells()

/** Spawns and manages local pseudo-terminals via node-pty. */
class PtyServiceImpl {
  shells(): ShellInfo[] {
    return SHELLS
  }

  spawn(tabId: string, cols: number, rows: number, opts: LocalShellOptions = {}): TerminalBackend {
    const def = defaultShell()
    const shell = opts.shell || def.shell
    const args = opts.args ?? def.args

    const proc = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: Math.max(cols, 1),
      rows: Math.max(rows, 1),
      cwd: opts.cwd || os.homedir(),
      env: { ...process.env, ...opts.env, TERM: 'xterm-256color' } as Record<string, string>
    })

    proc.onData((data) => ConnectionManager.pushData(tabId, data))
    proc.onExit(({ exitCode }) => ConnectionManager.pushExit(tabId, exitCode, 'shell exited', true))

    const backend: TerminalBackend = {
      protocol: 'local',
      write: (data) => proc.write(data),
      resize: (c, r) => {
        try {
          proc.resize(Math.max(c, 1), Math.max(r, 1))
        } catch {
          /* ignore resize on dead pty */
        }
      },
      kill: () => {
        try {
          proc.kill()
        } catch {
          /* ignore */
        }
      }
    }

    ConnectionManager.pushStatus(tabId, 'connected')
    return backend
  }
}

export const PtyService = new PtyServiceImpl()
