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

/**
 * Panes mid-tear-off: their tab was handed to a new window, so the unmount in
 * this window must NOT kill the still-alive backend connection (useTerminal
 * checks and clears this set in its cleanup).
 */
export const detachedPanes = new Set<string>()

/** Scrollback text for adopted panes, written into the fresh xterm on mount then dropped. */
export const pendingScrollback = new Map<string, string>()

/** The tab currently being dragged, so drop targets outside the tab strip can see it. */
export const tabDrag: { id: string | null } = { id: null }

/**
 * Does this window own the pane? Main-process prompts (host key, keyboard-interactive,
 * credentials) broadcast to every window, so each one must ignore panes that aren't its own.
 */
export function ownsPane(paneId: string): boolean {
  return useTabStore.getState().tabs.some((t) => t.panes.some((p) => p.id === paneId))
}

/** A tab split (two side-by-side tab groups) is active iff any tab sits in group 1. */
export function isTabSplit(tabs: Tab[]): boolean {
  return tabs.some((t) => t.group === 1)
}

interface NewTabOpts {
  sessionId?: number | null
  protocol?: Protocol
  title?: string
  host?: string | null
  color?: string | null
  /** Which split group to open in. Defaults to the focused tab's group. */
  group?: 0 | 1
}

interface TabState {
  tabs: Tab[]
  activeTabId: string | null
  broadcastActive: boolean
  /** Which tab each split group displays. [0] = left, [1] = right (null when not split). */
  groupActive: { 0: string | null; 1: string | null }
  /** Left group's fraction of the workspace width while split. */
  splitRatio: number

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

  /** Move a tab into a split group (creating the split when it lands in group 1). Returns an error, or null. */
  moveTabToGroup: (tabId: string, group: 0 | 1) => string | null
  unsplitTabs: () => void
  setSplitRatio: (ratio: number) => void

  /** Remove a tab without killing its connections — it's being adopted by a new window. */
  detachTab: (tabId: string) => void
  /** Add a torn-off tab from another window, reusing its live pane ids. */
  adoptTab: (tab: Tab) => void

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

// While the tab split is active every tab renders half-width, so pane grids cap
// at 2x2 (4 panes) instead of the full-width 3x2 (6 panes).
const maxColsFor = (tabs: Tab[]) => (isTabSplit(tabs) ? 2 : MAX_COLS)
const maxPanesFor = (tabs: Tab[]) => (isTabSplit(tabs) ? 4 : MAX_PANES)

/** Whether a tab's pane grid fits the split-mode 2x2 budget. */
function fits2x2(tab: Tab): boolean {
  return tab.layout.length <= 2 && tab.layout.every((row) => row.length <= 2)
}

const groupOf = (t: Tab): 0 | 1 => t.group ?? 0

/** A split only exists while both sides hold tabs — flatten everything back to group 0 otherwise. */
function collapseIfEmpty(tabs: Tab[]): Tab[] {
  const twoSided = tabs.some((t) => groupOf(t) === 0) && tabs.some((t) => groupOf(t) === 1)
  return twoSided ? tabs : tabs.map((t) => (groupOf(t) === 1 ? { ...t, group: 0 as const } : t))
}

/**
 * Rebuild active/group bookkeeping after tabs were removed: collapse the split
 * when either side emptied, and re-point each group's shown tab (and the focused
 * tab) at a surviving neighbour in the previous strip order.
 */
function afterRemoval(prev: TabState, remaining: Tab[]): Pick<TabState, 'tabs' | 'activeTabId' | 'groupActive'> {
  const tabs = collapseIfEmpty(remaining)
  const pick = (g: 0 | 1, wanted: string | null): string | null => {
    const group = tabs.filter((t) => groupOf(t) === g)
    if (!group.length) return null
    if (wanted && group.some((t) => t.id === wanted)) return wanted
    // Nearest surviving group member left of the closed tab, else the group's first.
    const oldIdx = wanted ? prev.tabs.findIndex((t) => t.id === wanted) : -1
    const before = oldIdx > 0 ? prev.tabs.slice(0, oldIdx).reverse().find((t) => group.some((x) => x.id === t.id)) : undefined
    return (before ?? group[0]).id
  }
  const groupActive = { 0: pick(0, prev.groupActive[0]), 1: pick(1, prev.groupActive[1]) }
  let activeTabId = prev.activeTabId && tabs.some((t) => t.id === prev.activeTabId) ? prev.activeTabId : null
  if (!activeTabId) {
    const oldGroup = prev.tabs.find((t) => t.id === prev.activeTabId)
    activeTabId = pick(oldGroup ? groupOf(oldGroup) : 0, prev.activeTabId) ?? groupActive[0] ?? groupActive[1]
  }
  return { tabs, activeTabId, groupActive }
}

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
function insertPane(rows: LayoutRows, activeId: string, newId: string, dir: 'h' | 'v', maxCols: number): LayoutRows | null {
  const [r, c] = findPane(rows, activeId)
  if (r !== -1) {
    if (dir === 'h' && rows[r].length >= maxCols) return null
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
  groupActive: { 0: null, 1: null },
  splitRatio: 0.5,

  newTab: (opts) => {
    const pane = makePane(opts)
    // New tabs join the group the user is focused in, so "new tab" inside the
    // right split opens there.
    const s = get()
    const active = s.tabs.find((t) => t.id === s.activeTabId)
    const g = opts?.group ?? (active ? groupOf(active) : 0)
    const tab: Tab = {
      id: uuid(),
      title: opts?.title ?? 'Local Shell',
      color: opts?.color ?? null,
      layout: [[pane.id]],
      panes: [pane],
      activePaneId: pane.id,
      broadcast: false,
      group: g
    }
    set((st) => ({ tabs: [...st.tabs, tab], activeTabId: tab.id, groupActive: { ...st.groupActive, [g]: tab.id } }))
    return pane.id
  },

  closeTab: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (tab) for (const p of tab.panes) killPane(p.id)
    set((s) => afterRemoval(s, s.tabs.filter((t) => t.id !== tabId)))
  },

  closeOtherTabs: (tabId) => {
    for (const t of get().tabs) if (t.id !== tabId) for (const p of t.panes) killPane(p.id)
    set((s) => afterRemoval(s, s.tabs.filter((t) => t.id === tabId)))
  },

  closeTabsToRight: (tabId) => {
    const idx = get().tabs.findIndex((t) => t.id === tabId)
    const toClose = get().tabs.slice(idx + 1)
    for (const t of toClose) for (const p of t.panes) killPane(p.id)
    set((s) => afterRemoval(s, s.tabs.slice(0, idx + 1)))
  },

  setActiveTab: (tabId) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId)
      if (!tab) return {}
      return { activeTabId: tabId, groupActive: { ...s.groupActive, [groupOf(tab)]: tabId } }
    }),
  renameTab: (tabId, title) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)) })),
  setTabColor: (tabId, color) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, color } : t)) })),

  // Dropping a tab onto one in the other group moves it there (VSCode-style), so
  // reorder carries the target's group with it.
  reorderTab: (fromId, toId) =>
    set((s) => {
      const tabs = [...s.tabs]
      const from = tabs.findIndex((t) => t.id === fromId)
      const to = tabs.findIndex((t) => t.id === toId)
      if (from < 0 || to < 0) return {}
      const g = groupOf(tabs[to])
      const [moved] = tabs.splice(from, 1)
      tabs.splice(to, 0, { ...moved, group: g })
      const next = collapseIfEmpty(tabs)
      const split = next.some((t) => groupOf(t) === 1)
      return {
        tabs: next,
        activeTabId: fromId,
        groupActive: split
          ? ({ ...s.groupActive, [g]: fromId } as TabState['groupActive'])
          : { 0: fromId, 1: null }
      }
    }),

  nextTab: () => {
    const { tabs, activeTabId } = get()
    if (!tabs.length) return
    const idx = tabs.findIndex((t) => t.id === activeTabId)
    get().setActiveTab(tabs[(idx + 1) % tabs.length].id)
  },
  prevTab: () => {
    const { tabs, activeTabId } = get()
    if (!tabs.length) return
    const idx = tabs.findIndex((t) => t.id === activeTabId)
    get().setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length].id)
  },
  goToTab: (index) => {
    const { tabs } = get()
    if (tabs[index]) get().setActiveTab(tabs[index].id)
  },

  moveTabToGroup: (tabId, to) => {
    const s = get()
    const tab = s.tabs.find((t) => t.id === tabId)
    if (!tab) return 'Tab not found'
    const from = groupOf(tab)
    if (from === to) return null
    // Moving into group 1 is what creates the split, so it inherits the split's limits.
    if (to === 1 && !isTabSplit(s.tabs)) {
      if (s.tabs.length < 2) return 'Open another tab first — a split shows two tabs side by side'
      if (!fits2x2(tab)) return 'This tab has more than a 2x2 pane grid — close some panes before splitting'
    }
    const tabs = collapseIfEmpty(s.tabs.map((t) => (t.id === tabId ? { ...t, group: to } : t)))
    const landed = groupOf(tabs.find((t) => t.id === tabId)!)
    if (!isTabSplit(tabs)) {
      set({ tabs, activeTabId: tabId, groupActive: { 0: tabId, 1: null } })
      return null
    }
    // The side it left keeps showing a tab that's still there — its old one when that
    // survived, else the moved tab's nearest neighbour in strip order.
    const shown = s.groupActive[from]
    const stays = tabs.filter((t) => groupOf(t) === from)
    const idx = s.tabs.findIndex((t) => t.id === tabId)
    const fromActive =
      shown && stays.some((t) => t.id === shown)
        ? shown
        : (s.tabs.slice(0, idx).reverse().find((t) => stays.some((x) => x.id === t.id)) ?? stays[0]).id
    set({
      tabs,
      activeTabId: tabId,
      groupActive: { ...s.groupActive, [from]: fromActive, [landed]: tabId } as TabState['groupActive']
    })
    return null
  },

  unsplitTabs: () =>
    set((s) => ({
      tabs: s.tabs.map((t) => (groupOf(t) === 1 ? { ...t, group: 0 as const } : t)),
      groupActive: { 0: s.activeTabId ?? s.groupActive[0], 1: null }
    })),

  setSplitRatio: (ratio) => set({ splitRatio: Math.min(0.8, Math.max(0.2, ratio)) }),

  detachTab: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return
    // The panes' connections live on in the new window — skip the unmount kill.
    for (const p of tab.panes) detachedPanes.add(p.id)
    set((s) => afterRemoval(s, s.tabs.filter((t) => t.id !== tabId)))
  },

  adoptTab: (tab) =>
    set((s) => ({
      tabs: [...s.tabs, { ...tab, group: 0 as const }],
      activeTabId: tab.id,
      groupActive: { ...s.groupActive, 0: tab.id }
    })),

  splitPane: (tabId, dir) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId || t.panes.length >= maxPanesFor(s.tabs)) return t
        const active = t.panes.find((p) => p.id === t.activePaneId)
        const pane = makePane({ sessionId: active?.sessionId, protocol: active?.protocol, title: active?.title, host: active?.host })
        const layout = insertPane(t.layout, t.activePaneId, pane.id, dir, maxColsFor(s.tabs))
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
