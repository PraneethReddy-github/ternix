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
  /** Saved session this pane came from, or null for an ad-hoc local shell. */
  sessionId: number | null
  /** webContents.id of the window that owns this pane — updated on tear-off adoption. */
  owner: number | null
  /** Last geometry pushed to the backend; a phone mirroring the pane renders at this size. */
  cols: number
  rows: number
}

/** A live pane as seen from outside the renderer (mobile clients listing panes to attach to). */
export interface PaneInfo {
  tabId: string
  sessionName: string
  host: string | null
  sessionId: number | null
  protocol: Protocol
  cols: number
  rows: number
}

/** Events mirrored to non-renderer consumers (mobile clients) alongside the Bus. */
export type TapEvent =
  | { type: 'data'; tabId: string; data: string }
  | { type: 'status'; tabId: string; state: string; message?: string }
  | { type: 'exit'; tabId: string; code: number; reason?: string }

/**
 * Replay buffer size per pane. A phone attaching to a pane that's already running needs
 * *some* history or it stares at a blank screen until the next keystroke.
 * ponytail: flat string sliced to a byte cap — the slice can cut an escape sequence in
 * half, so the first line of a replay may be garbled. A chunk list keyed to sequence
 * boundaries would fix it; not worth it for a scrollback preview.
 */
const SCROLLBACK_CAP = 128_000

/**
 * Central registry of active connections keyed by tabId. Also the single funnel for
 * outbound terminal data so session recording and the renderer bus stay in sync.
 */
class ConnectionManagerImpl {
  private entries = new Map<string, Entry>()
  private recorders = new Map<string, (data: string) => void>()
  /** Last working dir reported by the shell via OSC 7, keyed by tabId. */
  private cwds = new Map<string, string>()
  /** Recent output per pane, for clients that attach after a pane is already running. */
  private scrollback = new Map<string, string>()
  /** Geometry reported for a tab whose backend is still being spawned (see resize). */
  private pendingGeometry = new Map<string, { cols: number; rows: number }>()
  private taps = new Set<(e: TapEvent) => void>()

  /** Subscribe to terminal traffic from outside the renderer. Returns an unsubscribe fn. */
  tap(fn: (e: TapEvent) => void): () => void {
    this.taps.add(fn)
    return () => this.taps.delete(fn)
  }

  private fire(e: TapEvent): void {
    for (const t of this.taps) {
      try {
        t(e)
      } catch {
        /* a bad tap must never break the terminal path */
      }
    }
  }

  /** Live panes, for a mobile client picking one to mirror. */
  list(): PaneInfo[] {
    return [...this.entries].map(([tabId, e]) => ({
      tabId,
      sessionName: e.sessionName,
      host: e.host,
      sessionId: e.sessionId,
      protocol: e.backend.protocol,
      cols: e.cols,
      rows: e.rows
    }))
  }

  getScrollback(tabId: string): string {
    return this.scrollback.get(tabId) ?? ''
  }

  register(tabId: string, backend: TerminalBackend, sessionName: string, host: string | null, sessionId: number | null, owner: number | null = null): void {
    const logId = logRepo.start(sessionId, sessionName, host)
    // Geometry the client already reported while we were still connecting, else a placeholder.
    const geo = this.pendingGeometry.get(tabId)
    this.pendingGeometry.delete(tabId)
    this.entries.set(tabId, { backend, logId, sessionName, host, sessionId, owner, cols: geo?.cols ?? 80, rows: geo?.rows ?? 24 })
    if (geo) this.resize(tabId, geo.cols, geo.rows)
  }

  /** Resize a backend and remember the geometry so other clients can match it. */
  resize(tabId: string, cols: number, rows: number): void {
    const e = this.entries.get(tabId)
    // Spawning is async, so the client's real geometry usually lands before the backend does.
    // Dropping it leaves the shell wrapping at the cols we guessed, which corrupts redraws.
    if (!e) {
      this.pendingGeometry.set(tabId, { cols, rows })
      return
    }
    e.cols = cols
    e.rows = rows
    e.backend.resize(cols, rows)
    Bus.emit(`terminal:geometry:${tabId}`, { cols, rows })
  }

  get(tabId: string): TerminalBackend | null {
    return this.entries.get(tabId)?.backend ?? null
  }

  has(tabId: string): boolean {
    return this.entries.has(tabId)
  }

  /** Transfer a live pane to another window (tab tear-off adoption). */
  setOwner(tabId: string, owner: number): void {
    const e = this.entries.get(tabId)
    if (e) e.owner = owner
  }

  /** Pane ids owned by a window — used to tear down connections when it closes. */
  idsOwnedBy(owner: number): string[] {
    return [...this.entries].filter(([, e]) => e.owner === owner).map(([id]) => id)
  }

  /** Funnel for terminal output: feed the recorder (if any) then the renderer. */
  pushData(tabId: string, data: string): void {
    const rec = this.recorders.get(tabId)
    if (rec) rec(data)
    if (data.includes('\x1b]7;')) this.trackCwd(tabId, data)
    const buf = (this.scrollback.get(tabId) ?? '') + data
    this.scrollback.set(tabId, buf.length > SCROLLBACK_CAP ? buf.slice(-SCROLLBACK_CAP) : buf)
    Bus.emit(`terminal:data:${tabId}`, data)
    this.fire({ type: 'data', tabId, data })
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
    this.fire({ type: 'status', tabId, state, message })
  }

  /** `clean` = the session ended on purpose (shell exited / peer closed), not a dropped link. */
  pushExit(tabId: string, code: number, reason?: string, clean = false): void {
    Bus.emit(`terminal:exit:${tabId}`, { code, reason, clean })
    this.fire({ type: 'exit', tabId, code, reason })
    this.finishLog(tabId, reason ?? `exit ${code}`)
    // The backend is dead — drop the entry so a reconnect spawn isn't mistaken
    // for a live connection (spawn is idempotent on existing entries).
    this.entries.delete(tabId)
  }

  attachRecorder(tabId: string, write: (data: string) => void): void {
    this.recorders.set(tabId, write)
  }

  detachRecorder(tabId: string): void {
    this.recorders.delete(tabId)
  }

  kill(tabId: string): void {
    const e = this.entries.get(tabId)
    if (e) {
      try {
        e.backend.kill()
      } catch {
        /* ignore */
      }
      this.finishLog(tabId, 'closed by user')
    }
    // Clean side maps even when the entry is already gone (e.g. exit deleted it).
    this.entries.delete(tabId)
    this.recorders.delete(tabId)
    this.cwds.delete(tabId)
    this.scrollback.delete(tabId)
    // A connection that failed to spawn never consumed its pending geometry.
    this.pendingGeometry.delete(tabId)
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
