import { create } from 'zustand'
import type { Protocol } from '@shared/index'
import type { Tab, Pane, ConnState, PaneLayout } from '@shared/ui'

function uuid(): string {
  return crypto.randomUUID()
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

function layoutFor(count: number): PaneLayout {
  if (count <= 1) return 'single'
  if (count === 2) return 'h'
  return 'grid'
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
      layout: 'single',
      panes: [pane],
      activePaneId: pane.id,
      broadcast: false
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
    return pane.id
  },

  closeTab: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (tab) for (const p of tab.panes) window.ternix.terminal.kill(p.id).catch(() => {})
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tabId)
      let activeTabId = s.activeTabId
      if (s.activeTabId === tabId) activeTabId = tabs.length ? tabs[Math.max(0, s.tabs.findIndex((t) => t.id === tabId) - 1)]?.id ?? tabs[0].id : null
      return { tabs, activeTabId }
    })
  },

  closeOtherTabs: (tabId) => {
    for (const t of get().tabs) if (t.id !== tabId) for (const p of t.panes) window.ternix.terminal.kill(p.id).catch(() => {})
    set((s) => ({ tabs: s.tabs.filter((t) => t.id === tabId), activeTabId: tabId }))
  },

  closeTabsToRight: (tabId) => {
    const idx = get().tabs.findIndex((t) => t.id === tabId)
    const toClose = get().tabs.slice(idx + 1)
    for (const t of toClose) for (const p of t.panes) window.ternix.terminal.kill(p.id).catch(() => {})
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
        if (t.id !== tabId || t.panes.length >= 4) return t
        const active = t.panes.find((p) => p.id === t.activePaneId)
        const pane = makePane({ sessionId: active?.sessionId, protocol: active?.protocol, title: active?.title, host: active?.host })
        const panes = [...t.panes, pane]
        return { ...t, panes, activePaneId: pane.id, layout: panes.length === 2 ? dir : layoutFor(panes.length) }
      })
    })),

  closePane: (tabId, paneId) => {
    window.ternix.terminal.kill(paneId).catch(() => {})
    const tab = get().tabs.find((t) => t.id === tabId)
    if (tab && tab.panes.length === 1) {
      get().closeTab(tabId)
      return
    }
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t
        const panes = t.panes.filter((p) => p.id !== paneId)
        return { ...t, panes, activePaneId: panes[0]?.id ?? t.activePaneId, layout: layoutFor(panes.length) }
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
