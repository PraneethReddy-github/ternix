import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTabStore, isTabSplit, tabDrag } from '@/store/useTabStore'
import { useSessionStore } from '@/store/useSessionStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUiStore } from '@/store/useUiStore'
import { useContextMenu } from '@/components/ui/ContextMenu'
import { ProtocolIcon } from '@/components/sidebar/ProtocolIcon'
import { connectSession } from '@/components/sidebar/SessionCard'
import { paneActions } from '@/hooks/terminalRegistry'
import { cn } from '@/utils/cn'
import type { Tab } from '@shared/ui'

/**
 * Tab tear-off: hand this tab to a brand-new Ternix window. The pane ids (and
 * their live connections in the main process) move with it — the new window
 * re-attaches instead of reconnecting. Scrollback goes along as plain text.
 */
function tearOffTab(tab: Tab) {
  const store = useTabStore.getState()
  if (store.tabs.length < 2) return // a lone tab is already its own window
  const scrollback: Record<string, string> = {}
  for (const p of tab.panes) {
    const buf = paneActions(p.id)?.getBuffer?.()
    if (buf) scrollback[p.id] = buf
  }
  window.ternix.window.openTab({ tab: { ...tab, group: 0 }, scrollback })
  store.detachTab(tab.id)
}

/** One tab strip per split group — VSCode-style: each group owns its tabs and its own "+". */
/** Move a tab into a split group, surfacing the store's rejection reason as a toast. */
export function moveToGroup(tabId: string, group: 0 | 1) {
  const err = useTabStore.getState().moveTabToGroup(tabId, group)
  if (err) useUiStore.getState().notify(err, 'error')
}

export function TabBar({ group = 0 }: { group?: 0 | 1 }) {
  const allTabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const groupActive = useTabStore((s) => s.groupActive)
  const setActive = useTabStore((s) => s.setActiveTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const newTab = useTabStore((s) => s.newTab)
  const reorderTab = useTabStore((s) => s.reorderTab)
  const openDialog = useUiStore((s) => s.openDialog)
  const { open, element } = useContextMenu()
  const dragId = useRef<string | null>(null)

  const split = isTabSplit(allTabs)
  const tabs = split ? allTabs.filter((t) => (t.group ?? 0) === group) : allTabs
  // While split, each group keeps showing its own tab; only one of them is focused.
  const shownId = split ? groupActive[group] : activeTabId

  const stripRef = useRef<HTMLDivElement | null>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })

  const updateOverflow = useCallback(() => {
    const el = stripRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setOverflow({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 })
  }, [])

  // Translate vertical wheel / trackpad scroll into horizontal scroll
  // (VSCode-style "scroll over the tabs"). Native horizontal swipe (deltaX)
  // is left to the browser so two-finger left/right keeps working.
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      if (el.scrollWidth <= el.clientWidth) return
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Recompute scroll affordances when the strip resizes.
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const ro = new ResizeObserver(updateOverflow)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateOverflow])

  useEffect(updateOverflow, [tabs.length, updateOverflow])
  useEffect(() => {
    const strip = stripRef.current
    if (!strip || !shownId) return
    const tab = strip.querySelector<HTMLElement>(`[data-tab-id="${shownId}"]`)
    if (!tab) return
    const tabLeft = tab.offsetLeft
    const tabRight = tabLeft + tab.offsetWidth
    if (tabLeft < strip.scrollLeft) {
      strip.scrollLeft = tabLeft
    } else if (tabRight > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = tabRight - strip.clientWidth
    }
    updateOverflow()
  }, [shownId, updateOverflow])

  const scrollByPage = (dir: -1 | 1) => {
    const el = stripRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  const handleNewTab = () => {
    const proto = useSettingsStore.getState().get('general.newTabProtocol')
    // A dialog-driven session lands in whichever group is focused, so focus this one first.
    if (shownId) setActive(shownId)
    if (proto === 'ssh') openDialog({ kind: 'newSession' })
    else newTab({ protocol: 'local', title: 'Local Shell', group })
  }

  return (
    <div
      data-tabbar={group}
      className="h-9 w-full min-w-0 flex items-stretch bg-bg border-b border-border shrink-0"
      style={{ overflow: 'hidden' }}
      onDragOver={(e) => tabDrag.id && e.preventDefault()}
      onDrop={() => {
        // Dropped on the strip's empty space → join this group, keep its order.
        const id = tabDrag.id
        if (id) moveToGroup(id, group)
      }}
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest('[data-tab-id]')) {
          handleNewTab()
        }
      }}
    >
      {overflow.left && (
        <button
          className="shrink-0 px-1 text-muted hover:text-text hover:bg-surface-2 border-r border-border"
          title="Scroll tabs left"
          onClick={() => scrollByPage(-1)}
        >
          <ChevronLeft size={16} />
        </button>
      )}
      {/* Wrapper: takes all remaining width, clips overflow so nothing leaks out */}
      <div className="flex-1 min-w-0 overflow-hidden relative">
        <div
          ref={stripRef}
          onScroll={updateOverflow}
          className="tx-tabstrip absolute inset-0 flex items-stretch overflow-x-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          {tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              active={tab.id === shownId}
              focused={tab.id === activeTabId}
              onSelect={() => setActive(tab.id)}
              onClose={() => closeTab(tab.id)}
              onContext={(e) => {
                const st = useTabStore.getState()
                open(e, [
                  { label: 'Duplicate tab', onClick: () => openSessionInNewTab(tab) },
                  { label: 'Rename tab', onClick: () => promptRename(tab) },
                  { label: 'Split right', onClick: () => useTabStore.getState().splitPane(tab.id, 'h') },
                  { label: 'Split down', onClick: () => useTabStore.getState().splitPane(tab.id, 'v') },
                  { separator: true },
                  ...((tab.group ?? 0) === 1
                    ? [
                      { label: 'Move tab to left group', onClick: () => moveToGroup(tab.id, 0) },
                      { label: 'Unsplit tabs', onClick: () => useTabStore.getState().unsplitTabs() }
                    ]
                    : [
                      { label: 'Move tab to right group', onClick: () => moveToGroup(tab.id, 1) },
                      ...(split ? [{ label: 'Unsplit tabs', onClick: () => useTabStore.getState().unsplitTabs() }] : [])
                    ]),
                  { label: 'Move tab to new window', onClick: () => tearOffTab(tab), disabled: st.tabs.length < 2 },
                  { separator: true },
                  { label: 'Close tab', onClick: () => closeTab(tab.id) },
                  { label: 'Close other tabs', onClick: () => useTabStore.getState().closeOtherTabs(tab.id) },
                  { label: 'Close tabs to the right', onClick: () => useTabStore.getState().closeTabsToRight(tab.id) }
                ])
              }}
              onDragStart={() => {
                dragId.current = tab.id
                tabDrag.id = tab.id
              }}
              onDrop={() => dragId.current && dragId.current !== tab.id && reorderTab(dragId.current, tab.id)}
              onDragEnd={(e) => {
                dragId.current = null
                tabDrag.id = null
                // Released outside the window (and not on a drop target) → tear off
                // into a new window. Cancelled drags report in-bounds coords and are ignored.
                const out = e.clientX < 0 || e.clientY < 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight
                if (out && e.dataTransfer.dropEffect === 'none') tearOffTab(tab)
              }}
            />
          ))}
        </div>
      </div>{/* end scroll wrapper */}
      {overflow.right && (
        <button
          className="shrink-0 px-1 text-muted hover:text-text hover:bg-surface-2 border-l border-border"
          title="Scroll tabs right"
          onClick={() => scrollByPage(1)}
        >
          <ChevronRight size={16} />
        </button>
      )}
      <button
        className="shrink-0 px-3 text-muted hover:text-text hover:bg-surface-2 border-l border-border"
        title="New tab"
        onClick={handleNewTab}
      >
        <Plus size={16} />
      </button>
      {element}
    </div>
  )
}

function promptRename(tab: Tab) {
  useUiStore.getState().openDialog({
    kind: 'prompt',
    title: 'Rename tab',
    label: 'New name',
    defaultValue: tab.title,
    onSubmit: (name) => {
      if (!name) return
      // Renames the tab label only — never the underlying saved session.
      useTabStore.getState().renameTab(tab.id, name)
    }
  })
}

/**
 * Open a fresh tab with a brand-new connection to the same target as `tab`.
 * For a saved-session tab this launches a second live session; for a plain
 * local shell it opens another local shell.
 */
function openSessionInNewTab(tab: Tab) {
  const pane = tab.panes.find((p) => p.id === tab.activePaneId) ?? tab.panes[0]
  if (pane?.sessionId != null) {
    const session = useSessionStore.getState().sessions.find((x) => x.id === pane.sessionId)
    if (session) {
      connectSession(session, useTabStore)
      return
    }
  }
  // Fall back to reopening whatever the pane represents (e.g. a local shell).
  useTabStore.getState().newTab({
    sessionId: pane?.sessionId ?? null,
    protocol: pane?.protocol ?? 'local',
    title: tab.title,
    host: pane?.host ?? null,
    color: tab.color
  })
}

function TabItem({
  tab,
  active,
  focused,
  onSelect,
  onClose,
  onContext,
  onDragStart,
  onDrop,
  onDragEnd
}: {
  tab: Tab
  active: boolean
  focused: boolean
  onSelect: () => void
  onClose: () => void
  onContext: (e: React.MouseEvent) => void
  onDragStart: () => void
  onDrop: () => void
  onDragEnd: (e: React.DragEvent) => void
}) {
  const pane = tab.panes.find((p) => p.id === tab.activePaneId) ?? tab.panes[0]
  const connecting = pane?.state === 'connecting'
  const disconnected = pane?.state === 'disconnected' || pane?.state === 'error'

  return (
    <div
      data-tab-id={tab.id}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseDown={(e) => {
        if (e.button === 1) onClose()
        else onSelect()
      }}
      onContextMenu={onContext}
      className={cn(
        'group relative flex items-center gap-2 px-3 min-w-[120px] max-w-[200px] shrink-0 border-r border-border cursor-pointer select-none',
        active ? 'bg-surface text-text' : 'bg-bg text-muted hover:bg-surface-2'
      )}
    >
      {/* Only the focused group's shown tab gets the accent bar — like VSCode's inactive editor group. */}
      {active && <span className={cn('absolute inset-x-0 top-0 h-[2px]', focused ? 'bg-accent' : 'bg-border')} />}
      {connecting ? (
        <Loader2 size={13} className="tx-spin shrink-0" />
      ) : (
        <ProtocolIcon protocol={pane?.protocol ?? 'local'} size={13} className={cn('shrink-0', disconnected && 'opacity-40')} />
      )}
      {tab.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tab.color }} />}
      {tab.broadcast && <span className="w-1.5 h-1.5 rounded-full bg-warning tx-pulse shrink-0" title="Broadcast on" />}
      <span className={cn('truncate flex-1 text-[12px]', disconnected && 'line-through opacity-60')}>{tab.title}</span>
      <button
        className="opacity-0 group-hover:opacity-100 text-muted hover:text-text shrink-0"
        onMouseDown={(e) => {
          e.stopPropagation()
          onClose()
        }}
      >
        <X size={13} />
      </button>
    </div>
  )
}
