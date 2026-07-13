import type { Protocol } from './index'

export type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

/** A single terminal instance. Its `id` doubles as the backend IPC tabId. */
export interface Pane {
  id: string
  sessionId: number | null
  protocol: Protocol
  title: string
  host: string | null
  state: ConnState
  message?: string
  recording: boolean
}

/**
 * Tiling layout: a top-to-bottom stack of rows, where each row is a
 * left-to-right list of pane ids (the columns in that row). All rows share the
 * height equally; within a row, columns share the width equally.
 *
 * e.g. `[['a', 'b'], ['c']]` renders panes `a | b` on top and a full-width `c`
 * below — so a "split down" after a "split right" gives the new pane the whole
 * width beneath the existing pair rather than a single quadrant.
 */
export type LayoutRows = string[][]

/** A UI tab that hosts panes in a tiled split layout. */
export interface Tab {
  id: string
  title: string
  color: string | null
  layout: LayoutRows
  panes: Pane[]
  activePaneId: string
  broadcast: boolean
  /** Row heights as fractions summing to 1. Absent (or stale length) ⇒ equal heights. */
  rowFr?: number[]
  /** Per-row column widths as fractions summing to 1. Absent (or stale length) ⇒ equal widths. */
  colFr?: number[][]
  /** Tab-split group: 0 = left (default), 1 = right. A split is active iff any tab is in group 1. */
  group?: 0 | 1
}

/**
 * A tab torn out of one window and adopted by a new one. Pane ids are kept, so the
 * new window re-attaches to the still-alive connections in the main process instead
 * of reconnecting. `scrollback` is plain buffer text per pane (colors not preserved).
 */
export interface TearoffPayload {
  tab: Tab
  scrollback: Record<string, string>
}

export type ActivityView = 'sessions' | 'sftp' | 'snippets' | 'tunnels' | 'recordings' | 'settings' | 'search' | 'monitor'

export interface SettingsMap {
  [key: string]: string
}
