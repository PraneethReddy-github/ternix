import type { Client as SshClient } from 'ssh2'
import type { Protocol } from '@shared/index'
import { Bus } from './bus'
import { logRepo } from '../db/repo'

/** A live terminal-producing connection bound to a renderer tab. */
export interface TerminalBackend {
  protocol: Protocol
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  /** SSH-only: the underlying ssh2 client, reused by SFTP and tunnels. */
  getSshClient?(): SshClient | null
  /** Optional latency probe in ms. */
  latency?(): Promise<number | null>
}

interface Entry {
  backend: TerminalBackend
  logId: number | null
  sessionName: string
  host: string | null
}

/**
 * Central registry of active connections keyed by tabId. Also the single funnel for
 * outbound terminal data so session recording and the renderer bus stay in sync.
 */
class ConnectionManagerImpl {
  private entries = new Map<string, Entry>()
  private recorders = new Map<string, (data: string) => void>()
  /** Last working dir reported by the shell via OSC 7, keyed by tabId. */
  private cwds = new Map<string, string>()

  register(tabId: string, backend: TerminalBackend, sessionName: string, host: string | null, sessionId: number | null): void {
    const logId = logRepo.start(sessionId, sessionName, host)
    this.entries.set(tabId, { backend, logId, sessionName, host })
  }

  get(tabId: string): TerminalBackend | null {
    return this.entries.get(tabId)?.backend ?? null
  }

  has(tabId: string): boolean {
    return this.entries.has(tabId)
  }

  /** Funnel for terminal output: feed the recorder (if any) then the renderer. */
  pushData(tabId: string, data: string): void {
    const rec = this.recorders.get(tabId)
    if (rec) rec(data)
    if (data.includes('\x1b]7;')) this.trackCwd(tabId, data)
    Bus.emit(`terminal:data:${tabId}`, data)
  }

  // Parse OSC 7 (ESC ] 7 ; file://host/path  ST) — shells emit it on each prompt
  // when configured (starship, oh-my-posh, VTE distros, …). Used to open SFTP at
  // the terminal's current dir. ponytail: a sequence split across two chunks is
  // missed; not worth a per-tab reassembly buffer for a best-effort convenience.
  private trackCwd(tabId: string, data: string): void {
    const re = /\x1b\]7;file:\/\/[^/]*([^\x07\x1b]*)(?:\x07|\x1b\\)/g
    let m: RegExpExecArray | null
    let last: string | undefined
    while ((m = re.exec(data)) !== null) last = m[1]
    if (last === undefined) return
    try {
      this.cwds.set(tabId, decodeURIComponent(last))
    } catch {
      this.cwds.set(tabId, last)
    }
  }

  getCwd(tabId: string): string | null {
    return this.cwds.get(tabId) ?? null
  }

  pushStatus(tabId: string, state: string, message?: string): void {
    Bus.emit(`terminal:status:${tabId}`, { state, message })
  }

  pushExit(tabId: string, code: number, reason?: string): void {
    Bus.emit(`terminal:exit:${tabId}`, { code, reason })
    this.finishLog(tabId, reason ?? `exit ${code}`)
  }

  attachRecorder(tabId: string, write: (data: string) => void): void {
    this.recorders.set(tabId, write)
  }

  detachRecorder(tabId: string): void {
    this.recorders.delete(tabId)
  }

  kill(tabId: string): void {
    const e = this.entries.get(tabId)
    if (!e) return
    try {
      e.backend.kill()
    } catch {
      /* ignore */
    }
    this.finishLog(tabId, 'closed by user')
    this.entries.delete(tabId)
    this.recorders.delete(tabId)
    this.cwds.delete(tabId)
  }

  private finishLog(tabId: string, reason: string): void {
    const e = this.entries.get(tabId)
    if (e?.logId != null) {
      try {
        logRepo.end(e.logId, reason)
      } catch {
        /* ignore */
      }
      e.logId = null
    }
  }

  killAll(): void {
    for (const tabId of [...this.entries.keys()]) this.kill(tabId)
  }
}

export const ConnectionManager = new ConnectionManagerImpl()
