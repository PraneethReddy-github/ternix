import type { Session } from '@shared/index'
import { ProtocolIcon } from './ProtocolIcon'
import { isRecent, timeAgo } from '@/utils/formatDuration'
import { cn } from '@/utils/cn'

export function connectSession(session: Session, useTabStore: any) {
  useTabStore.getState().newTab({
    sessionId: session.id,
    protocol: session.protocol,
    title: session.name,
    host: session.host,
    color: session.color
  })
}

export function SessionCard({
  session,
  depth,
  onConnect,
  onContext
}: {
  session: Session
  depth: number
  onConnect: () => void
  onContext: (e: React.MouseEvent) => void
}) {
  return (
    <div
      tabIndex={0}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('tx/session', String(session.id))}
      onDoubleClick={onConnect}
      onKeyDown={(e) => e.key === 'Enter' && onConnect()}
      onContextMenu={onContext}
      className="group flex items-center gap-2 pr-2 py-1 rounded-input hover:bg-surface-2 cursor-pointer outline-none focus:bg-surface-2"
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      <ProtocolIcon protocol={session.protocol} size={14} className="shrink-0" />
      <span className="text-[13px] text-text truncate">{session.name}</span>
      {session.host && <span className="text-[11px] text-muted truncate">{session.host}</span>}
      <div className="flex-1" />
      <span
        className={cn('w-1.5 h-1.5 rounded-full shrink-0', isRecent(session.last_connected) ? 'bg-success' : 'bg-border')}
        title={`Last connected ${timeAgo(session.last_connected)}`}
      />
    </div>
  )
}
