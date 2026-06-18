import { create } from 'zustand'
import type { Protocol } from '@shared/index'
import type { Tab, Pane, ConnState, LayoutRows } from '@shared/ui'
import { useSftpStore } from './useSftpStore'

function uuid(): string {
  return crypto.randomUUID()
}

/** Kill a pane's backend connection and drop any SFTP state tied to it. */
function killPane(paneId: string): void {
  window.ternix.terminal.kill(paneId).catch(() => {})
  useSftpStore.getState().clearRemotePath(paneId)
}

interface NewTabOpts {
  sessionId?: number | null
  protocol?: Protocol
  title?: string
  host?: string | null
  color?: string | null
}

interface TabState {
  tabs: Tab[]
  activeTabId: string | null
  broadcastActive: boolean

  newTab: (opts?: NewTabOpts) => string
  closeTab: (tabId: string) => void
  closeOtherTabs: (tabId: string) => void
  closeTabsToRight: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  renameTab: (tabId: string, title: string) => void
  setTabColor: (tabId: string, color: string | null) => void
  reorderTab: (fromId: string, toId: string) => void
  nextTab: () => void
  prevTab: () => void
  goToTab: (index: number) => void

  splitPane: (tabId: string, dir: 'h' | 'v') => void
  closePane: (tabId: string, paneId: string) => void
  setActivePane: (tabId: string, paneId: string) => void
  setPaneState: (paneId: string, state: ConnState, message?: string) => void
  setPaneRecording: (paneId: string, recording: boolean) => void

  toggleBroadcast: (tabId: string) => void
  setBroadcastActive: (active: boolean) => void

  getActiveTab: () => Tab | null
  getActivePane: () => Pane | null
}

function makePane(opts?: NewTabOpts): Pane {
  return {
    id: uuid(),
    sessionId: opts?.sessionId ?? null,
    protocol: opts?.protocol ?? 'local',
    title: opts?.title ?? 'Local Shell',
    host: opts?.host ?? null,
    state: 'connecting',
    recording: false
  }
}

/** Upper bound on panes per tab. */
const MAX_PANES = 6
const MAX_ROWS = 2
const MAX_COLS = 3

/** Locate a pane in the row/column grid. Returns [-1, -1] if absent. */
function findPane(rows: LayoutRows, id: string): [number, number] {
  for (let r = 0; r < rows.length; r++) {
    const c = rows[r].indexOf(id)
    if (c !== -1) return [r, c]
  }
  return [-1, -1]
}

/**
 * Insert `newId` relative to `activeId`:
 *  - 'h' (split right): add it as a new column immediately right of the active pane, in the same row.
 *  - 'v' (split down): add it as a new full-width row immediately below the active pane's row.
 * Falls back to appending a bottom row if the active pane can't be found.
 */
function insertPane(rows: LayoutRows, activeId: string, newId: string, dir: 'h' | 'v'): LayoutRows | null {
  const [r, c] = findPane(rows, activeId)
  if (r !== -1) {
    if (dir === 'h' && rows[r].length >= MAX_COLS) return null
    if (dir === 'v' && rows.length >= MAX_ROWS) return null
  }

  const next = rows.map((row) => [...row])
  if (r === -1) {
    next.push([newId])
  } else if (dir === 'h') {
    next[r].splice(c + 1, 0, newId)
  } else {
    next.splice(r + 1, 0, [newId])
  }
  return next
}

/** Drop a pane and collapse any row left empty. */
function removePane(rows: LayoutRows, id: string): LayoutRows {
  return rows.map((row) => row.filter((p) => p !== id)).filter((row) => row.length > 0)
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  broadcastActive: false,

  newTab: (opts) => {
    const pane = makePane(opts)
    const tab: Tab = {
      id: uuid(),
      title: opts?.title ?? 'Local Shell',
      color: opts?.color ?? null,
      layout: [[pane.id]],
      panes: [pane],
      activePaneId: pane.id,
      broadcast: false
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
    return pane.id
  },

  closeTab: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (tab) for (const p of tab.panes) killPane(p.id)
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tabId)
      let activeTabId = s.activeTabId
      if (s.activeTabId === tabId) activeTabId = tabs.length ? tabs[Math.max(0, s.tabs.findIndex((t) => t.id === tabId) - 1)]?.id ?? tabs[0].id : null
      return { tabs, activeTabId }
    })
  },

  closeOtherTabs: (tabId) => {
    for (const t of get().tabs) if (t.id !== tabId) for (const p of t.panes) killPane(p.id)
    set((s) => ({ tabs: s.tabs.filter((t) => t.id === tabId), activeTabId: tabId }))
  },

  closeTabsToRight: (tabId) => {
    const idx = get().tabs.findIndex((t) => t.id === tabId)
    const toClose = get().tabs.slice(idx + 1)
    for (const t of toClose) for (const p of t.panes) killPane(p.id)
    set((s) => ({ tabs: s.tabs.slice(0, idx + 1) }))
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),
  renameTab: (tabId, title) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)) })),
  setTabColor: (tabId, color) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, color } : t)) })),

  reorderTab: (fromId, toId) =>
    set((s) => {
      const tabs = [...s.tabs]
      const from = tabs.findIndex((t) => t.id === fromId)
      const to = tabs.findIndex((t) => t.id === toId)
      if (from < 0 || to < 0) return {}
      const [moved] = tabs.splice(from, 1)
      tabs.splice(to, 0, moved)
      return { tabs }
    }),

  nextTab: () => {
    const { tabs, activeTabId } = get()
    if (!tabs.length) return
    const idx = tabs.findIndex((t) => t.id === activeTabId)
    set({ activeTabId: tabs[(idx + 1) % tabs.length].id })
  },
  prevTab: () => {
    const { tabs, activeTabId } = get()
    if (!tabs.length) return
    const idx = tabs.findIndex((t) => t.id === activeTabId)
    set({ activeTabId: tabs[(idx - 1 + tabs.length) % tabs.length].id })
  },
  goToTab: (index) => {
    const { tabs } = get()
    if (tabs[index]) set({ activeTabId: tabs[index].id })
  },

  splitPane: (tabId, dir) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId || t.panes.length >= MAX_PANES) return t
        const active = t.panes.find((p) => p.id === t.activePaneId)
        const pane = makePane({ sessionId: active?.sessionId, protocol: active?.protocol, title: active?.title, host: active?.host })
        const layout = insertPane(t.layout, t.activePaneId, pane.id, dir)
        if (!layout) return t
        return { ...t, panes: [...t.panes, pane], activePaneId: pane.id, layout }
      })
    })),

  closePane: (tabId, paneId) => {
    killPane(paneId)
    const tab = get().tabs.find((t) => t.id === tabId)
    if (tab && tab.panes.length === 1) {
      get().closeTab(tabId)
      return
    }
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t
        const panes = t.panes.filter((p) => p.id !== paneId)
        const layout = removePane(t.layout, paneId)
        const activePaneId = t.activePaneId === paneId ? (panes[0]?.id ?? t.activePaneId) : t.activePaneId
        return { ...t, panes, activePaneId, layout }
      })
    }))
  },

  setActivePane: (tabId, paneId) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, activePaneId: paneId } : t)) })),

  setPaneState: (paneId, state, message) =>
    set((s) => ({
      tabs: s.tabs.map((t) => ({ ...t, panes: t.panes.map((p) => (p.id === paneId ? { ...p, state, message } : p)) }))
    })),

  setPaneRecording: (paneId, recording) =>
    set((s) => ({
      tabs: s.tabs.map((t) => ({ ...t, panes: t.panes.map((p) => (p.id === paneId ? { ...p, recording } : p)) }))
    })),

  toggleBroadcast: (tabId) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, broadcast: !t.broadcast } : t)) })),
  setBroadcastActive: (broadcastActive) => set({ broadcastActive }),

  getActiveTab: () => get().tabs.find((t) => t.id === get().activeTabId) ?? null,
  getActivePane: () => {
    const tab = get().getActiveTab()
    return tab?.panes.find((p) => p.id === tab.activePaneId) ?? null
  }
}))
