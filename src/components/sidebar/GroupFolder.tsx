import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react'

export function GroupFolder({
  name,
  depth,
  collapsed,
  color,
  count,
  onToggle,
  onContext,
  onDropSession
}: {
  name: string
  depth: number
  collapsed: boolean
  color?: string | null
  count: number
  onToggle: () => void
  onContext: (e: React.MouseEvent) => void
  onDropSession: (sessionId: number) => void
}) {
  return (
    <div
      onClick={onToggle}
      onContextMenu={onContext}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.stopPropagation()
        const id = e.dataTransfer.getData('tx/session')
        if (id) onDropSession(Number(id))
      }}
      className="flex items-center gap-1.5 pr-2 py-1 rounded-input hover:bg-surface-2 cursor-pointer select-none"
      style={{ paddingLeft: 6 + depth * 14 }}
    >
      {collapsed ? <ChevronRight size={14} className="text-muted shrink-0" /> : <ChevronDown size={14} className="text-muted shrink-0" />}
      {collapsed ? (
        <Folder size={14} className="shrink-0" style={{ color: color ?? 'var(--tx-muted)' }} />
      ) : (
        <FolderOpen size={14} className="shrink-0" style={{ color: color ?? 'var(--tx-muted)' }} />
      )}
      <span className="text-[13px] text-text truncate">{name}</span>
      <span className="text-[11px] text-muted">{count}</span>
    </div>
  )
}
