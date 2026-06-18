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

export type PaneLayout = 'single' | 'h' | 'v' | 'grid'

/** A UI tab that hosts 1–4 panes in a split layout. */
export interface Tab {
  id: string
  title: string
  color: string | null
  layout: PaneLayout
  panes: Pane[]
  activePaneId: string
  broadcast: boolean
}

export type ActivityView = 'sessions' | 'sftp' | 'snippets' | 'tunnels' | 'recordings' | 'settings' | 'search'

export interface SettingsMap {
  [key: string]: string
}
