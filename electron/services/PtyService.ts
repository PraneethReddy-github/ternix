import { createRequire } from 'node:module'
import os from 'node:os'
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

/** Spawns and manages local pseudo-terminals via node-pty. */
class PtyServiceImpl {
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
