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
  shell?: string
  shellArgs?: string[]
}

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
  rowFr?: number[]
  colFr?: number[][]
  group?: 0 | 1
}


export interface TearoffPayload {
  tab: Tab
  scrollback: Record<string, string>
}

export type ActivityView = 'sessions' | 'sftp' | 'snippets' | 'tunnels' | 'recordings' | 'settings' | 'search' | 'monitor' | 'phone'

export interface SettingsMap {
  [key: string]: string
}
