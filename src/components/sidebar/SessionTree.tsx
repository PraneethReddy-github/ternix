import { useMemo, useState } from 'react'
import { Plus, FolderPlus, ArrowDownUp, Search, ArrowRightLeft } from 'lucide-react'
import type { Group, Session } from '@shared/index'
import { useSessionStore } from '@/store/useSessionStore'
import { useTabStore } from '@/store/useTabStore'
import { useUiStore } from '@/store/useUiStore'
import { useContextMenu } from '@/components/ui/ContextMenu'
import { PanelHeader } from '@/components/layout/Sidebar'
import { GroupFolder } from './GroupFolder'
import { SessionCard, connectSession } from './SessionCard'
import { fuzzyFilter } from '@/utils/fuzzy'

export function SessionTree() {
  const { sessions, groups, filter, setFilter, sortBy, setSortBy } = useSessionStore()
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const duplicateSession = useSessionStore((s) => s.duplicateSession)
  const updateSession = useSessionStore((s) => s.updateSession)
  const createGroup = useSessionStore((s) => s.createGroup)
  const updateGroup = useSessionStore((s) => s.updateGroup)
  const deleteGroup = useSessionStore((s) => s.deleteGroup)
  const openDialog = useUiStore((s) => s.openDialog)
  const notify = useUiStore((s) => s.notify)
  const { open, element } = useContextMenu()
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const sorted = useMemo(() => {
    const arr = [...sessions]
    if (sortBy === 'name') arr.sort((a, b) => a.name.localeCompare(b.name))
    else if (sortBy === 'recent') arr.sort((a, b) => (b.last_connected ?? '').localeCompare(a.last_connected ?? ''))
    else arr.sort((a, b) => a.protocol.localeCompare(b.protocol) || a.name.localeCompare(b.name))
    return arr
  }, [sessions, sortBy])

  const filtered = useMemo(
    () => (filter ? fuzzyFilter(filter, sorted, (s) => `${s.name} ${s.host ?? ''} ${s.tags.join(' ')}`) : sorted),
    [filter, sorted]
  )

  const connect = (s: Session) => connectSession(s, useTabStore)

  const sessionContext = (e: React.MouseEvent, s: Session) =>
    open(e, [
      { label: 'Connect', onClick: () => connect(s) },
      { label: 'Connect in split right', onClick: () => { connect(s); const t = useTabStore.getState(); t.activeTabId && t.splitPane(t.activeTabId, 'h') } },
      { label: 'Open SFTP', onClick: () => { connect(s); useUiStore.getState().toggleSftp() } },
      { separator: true },
      { label: 'Edit', onClick: () => openDialog({ kind: 'newSession', session: s }) },
      { label: 'Duplicate', onClick: () => openDialog({ kind: 'newSession', session: s, duplicate: true }) },
      { label: 'Tunnels…', onClick: () => openDialog({ kind: 'tunnels', sessionId: s.id }) },
      { label: 'View connection log', onClick: () => openDialog({ kind: 'connectionLog', sessionId: s.id }) },
      { label: 'Copy host address', onClick: () => { window.ternix.system.writeClipboard(s.host ?? ''); notify('Host copied', 'success') } },
      { separator: true },
      {
        label: 'Delete',
        danger: true,
        onClick: () =>
          openDialog({
            kind: 'confirm',
            title: 'Delete session',
            message: `Delete "${s.name}"? This cannot be undone.`,
            danger: true,
            onConfirm: () => deleteSession(s.id)
          })
      }
    ])

  const groupContext = (e: React.MouseEvent, g: Group) =>
    open(e, [
      { label: 'New session in group', onClick: () => openDialog({ kind: 'newSession', groupId: g.id }) },
      { label: 'New sub-group', onClick: () => promptNewGroup(createGroup, g.id) },
      { label: 'Rename', onClick: () => useUiStore.getState().openDialog({ kind: 'prompt', title: 'Rename Group', label: 'Group name', defaultValue: g.name, onSubmit: (n) => { if (n) updateGroup(g.id, { name: n }) } }) },
      { label: 'Collapse all', onClick: () => setCollapsed(new Set(groups.map((x) => x.id))) },
      { separator: true },
      {
        label: 'Delete group',
        danger: true,
        onClick: () =>
          openDialog({
            kind: 'confirm',
            title: 'Delete group',
            message: `Delete group "${g.name}"? Sessions inside move to ungrouped.`,
            danger: true,
            onConfirm: () => deleteGroup(g.id)
          })
      }
    ])

  const toggle = (id: number) => setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n })

  const renderGroup = (group: Group, depth: number): React.ReactNode => {
    const childGroups = groups.filter((g) => g.parent_id === group.id)
    const groupSessions = filtered.filter((s) => s.group_id === group.id)
    if (filter && childGroups.length === 0 && groupSessions.length === 0) return null
    const isCollapsed = collapsed.has(group.id) && !filter
    return (
      <div key={`g${group.id}`}>
        <GroupFolder
          name={group.name}
          depth={depth}
          collapsed={isCollapsed}
          color={group.color}
          count={groupSessions.length}
          onToggle={() => toggle(group.id)}
          onContext={(e) => groupContext(e, group)}
          onDropSession={(sid) => { const s = sessions.find((x) => x.id === sid); if (s) updateSession(sid, { name: s.name, protocol: s.protocol, group_id: group.id }) }}
        />
        {!isCollapsed && (
          <div>
            {childGroups.map((cg) => renderGroup(cg, depth + 1))}
            {groupSessions.map((s) => (
              <SessionCard key={s.id} session={s} depth={depth + 1} onConnect={() => connect(s)} onContext={(e) => sessionContext(e, s)} />
            ))}
          </div>
        )}
      </div>
    )
  }

  const rootGroups = groups.filter((g) => g.parent_id == null)
  const ungrouped = filtered.filter((s) => s.group_id == null)

  return (
    <div className="flex flex-col h-full min-h-0">
      <PanelHeader title="Sessions">
        <button className="text-muted hover:text-text" title="New session" onClick={() => openDialog({ kind: 'newSession' })}>
          <Plus size={15} />
        </button>
        <button className="text-muted hover:text-text" title="New group" onClick={() => promptNewGroup(createGroup, null)}>
          <FolderPlus size={15} />
        </button>
        <button
          className="text-muted hover:text-text"
          title="Sort"
          onClick={(e) =>
            open(e, [
              { label: 'A–Z' + (sortBy === 'name' ? ' ✓' : ''), onClick: () => setSortBy('name') },
              { label: 'Last connected' + (sortBy === 'recent' ? ' ✓' : ''), onClick: () => setSortBy('recent') },
              { label: 'Protocol' + (sortBy === 'protocol' ? ' ✓' : ''), onClick: () => setSortBy('protocol') }
            ])
          }
        >
          <ArrowDownUp size={15} />
        </button>
        <button className="text-muted hover:text-text" title="Import / Export" onClick={() => openDialog({ kind: 'exportImport' })}>
          <ArrowRightLeft size={15} />
        </button>
      </PanelHeader>

      <div className="px-2 py-2 border-b border-border">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter sessions…"
            className="w-full bg-bg border border-border rounded-input pl-7 pr-2 py-1 text-[12px] text-text"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {rootGroups.map((g) => renderGroup(g, 0))}
        {ungrouped.map((s) => (
          <SessionCard key={s.id} session={s} depth={0} onConnect={() => connect(s)} onContext={(e) => sessionContext(e, s)} />
        ))}
        {sessions.length === 0 && (
          <div className="text-center text-[12px] text-muted mt-8 px-4">
            No sessions yet.
            <button className="block mx-auto mt-2 text-accent" onClick={() => openDialog({ kind: 'newSession' })}>
              Create your first session
            </button>
          </div>
        )}
      </div>
      {element}
    </div>
  )
}

function promptNewGroup(createGroup: (name: string, parentId?: number | null) => void, parentId: number | null) {
  useUiStore.getState().openDialog({
    kind: 'prompt',
    title: 'New Group',
    label: 'Group name',
    onSubmit: (name) => {
      if (name) createGroup(name, parentId)
    }
  })
}
