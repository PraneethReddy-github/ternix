import { useRef } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'
import { useTabStore } from '@/store/useTabStore'
import { useUiStore } from '@/store/useUiStore'
import { useContextMenu } from '@/components/ui/ContextMenu'
import { ProtocolIcon } from '@/components/sidebar/ProtocolIcon'
import { cn } from '@/utils/cn'
import type { Tab } from '@shared/ui'

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const setActive = useTabStore((s) => s.setActiveTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const newTab = useTabStore((s) => s.newTab)
  const reorderTab = useTabStore((s) => s.reorderTab)
  const openDialog = useUiStore((s) => s.openDialog)
  const { open, element } = useContextMenu()
  const dragId = useRef<string | null>(null)

  return (
    <div className="h-9 flex items-stretch bg-bg border-b border-border shrink-0">
      <div className="flex-1 flex items-stretch overflow-x-auto">
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            onSelect={() => setActive(tab.id)}
            onClose={() => closeTab(tab.id)}
            onContext={(e) =>
              open(e, [
                { label: 'Rename tab', onClick: () => promptRename(tab) },
                { label: 'Split right', onClick: () => useTabStore.getState().splitPane(tab.id, 'h') },
                { label: 'Split down', onClick: () => useTabStore.getState().splitPane(tab.id, 'v') },
                { separator: true },
                { label: 'Close tab', onClick: () => closeTab(tab.id) },
                { label: 'Close other tabs', onClick: () => useTabStore.getState().closeOtherTabs(tab.id) },
                { label: 'Close tabs to the right', onClick: () => useTabStore.getState().closeTabsToRight(tab.id) }
              ])
            }
            onDragStart={() => (dragId.current = tab.id)}
            onDrop={() => dragId.current && dragId.current !== tab.id && reorderTab(dragId.current, tab.id)}
          />
        ))}
      </div>
      <button
        className="px-3 text-muted hover:text-text hover:bg-surface-2 border-l border-border"
        title="New tab"
        onClick={() => {
          const proto = window.localStorage.getItem('tx.newTabProtocol')
          if (proto === 'ssh') openDialog({ kind: 'newSession' })
          else newTab({ protocol: 'local', title: 'Local Shell' })
        }}
      >
        <Plus size={16} />
      </button>
      {element}
    </div>
  )
}

function promptRename(tab: Tab) {
  const name = window.prompt('Rename tab', tab.title)
  if (name) useTabStore.getState().renameTab(tab.id, name)
}

function TabItem({
  tab,
  active,
  onSelect,
  onClose,
  onContext,
  onDragStart,
  onDrop
}: {
  tab: Tab
  active: boolean
  onSelect: () => void
  onClose: () => void
  onContext: (e: React.MouseEvent) => void
  onDragStart: () => void
  onDrop: () => void
}) {
  const pane = tab.panes.find((p) => p.id === tab.activePaneId) ?? tab.panes[0]
  const connecting = pane?.state === 'connecting'
  const disconnected = pane?.state === 'disconnected' || pane?.state === 'error'

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onMouseDown={(e) => {
        if (e.button === 1) onClose()
        else onSelect()
      }}
      onContextMenu={onContext}
      className={cn(
        'group flex items-center gap-2 px-3 min-w-[120px] max-w-[200px] border-r border-border cursor-pointer select-none',
        active ? 'bg-surface text-text' : 'bg-bg text-muted hover:bg-surface-2'
      )}
    >
      {active && <span className="absolute" />}
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
