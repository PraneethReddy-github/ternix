import { Pause, Play, X, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { useTransferStore } from '@/store/useTransferStore'
import { formatBytes, formatSpeed } from '@/utils/formatBytes'
import { formatEta } from '@/utils/formatDuration'
import { cn } from '@/utils/cn'

/**
 * One row, subscribed to its own transfer. A progress event replaces the `transfers` map
 * but keeps every other entry's identity, so only the row that actually moved re-renders.
 * Subscribing the parent to the whole map instead made all rows — including every finished
 * one still sitting in the list — re-render five times a second per active transfer.
 */
function TransferRow({ id }: { id: string }) {
  const t = useTransferStore((s) => s.transfers[id])
  if (!t) return null

  const pct = t.total > 0 ? Math.min(100, (t.transferred / t.total) * 100) : 0
  const done = ['done', 'cancelled', 'error'].includes(t.status)
  return (
    <div className="rounded-input border border-border p-2">
      <div className="flex items-center gap-2">
        {t.direction === 'upload' ? <ArrowUp size={12} className="text-accent" /> : <ArrowDown size={12} className="text-success" />}
        <span className="text-[12px] text-text truncate flex-1">{t.filename}</span>
        {!done && t.status === 'active' && (
          <button className="text-muted hover:text-text" title="Pause" onClick={() => window.ternix.sftp.pause(t.transferId)}>
            <Pause size={12} />
          </button>
        )}
        {!done && t.status === 'paused' && (
          <button className="text-muted hover:text-text" title="Resume" onClick={() => window.ternix.sftp.resume(t.transferId)}>
            <Play size={12} />
          </button>
        )}
        {!done && (
          <button className="text-muted hover:text-danger" title="Cancel" onClick={() => window.ternix.sftp.cancel(t.transferId)}>
            <X size={12} />
          </button>
        )}
      </div>
      <div className="h-1 bg-surface-2 rounded mt-1.5 overflow-hidden">
        <div
          className={cn('h-full', t.status === 'error' ? 'bg-danger' : t.status === 'done' ? 'bg-success' : 'bg-accent')}
          style={{ width: `${t.status === 'done' ? 100 : pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted mt-1">
        <span>{formatBytes(t.transferred)} / {formatBytes(t.total)}</span>
        {t.status === 'active' ? <span>{formatSpeed(t.bytesPerSecond)} · {formatEta(t.etaSeconds)}</span> : <span className="capitalize">{t.status}</span>}
      </div>
    </div>
  )
}

export function TransferQueue() {
  // Select a primitive: the id list only changes when a transfer is added or cleared, so
  // progress ticks never re-render this component. Ids are UUIDs, safe to join.
  const idKey = useTransferStore((s) => Object.keys(s.transfers).join('\n'))
  const clearCompleted = useTransferStore((s) => s.clearCompleted)
  const ids = idKey ? idKey.split('\n') : []

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">Transfers</span>
        <button className="text-muted hover:text-text" title="Clear completed" onClick={clearCompleted}>
          <Trash2 size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {ids.length === 0 && <div className="text-center text-[11px] text-muted py-4">No transfers</div>}
        {ids.map((id) => (
          <TransferRow key={id} id={id} />
        ))}
      </div>
    </div>
  )
}
