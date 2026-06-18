import type { TransferProgress } from '@shared/index'
import { formatBytes, formatSpeed } from '@/utils/formatBytes'
import { formatEta } from '@/utils/formatDuration'
import { cn } from '@/utils/cn'

/** A single per-file transfer progress bar (used inside the transfer queue / status strip). */
export function TransferProgressBar({ transfer }: { transfer: TransferProgress }) {
  const pct = transfer.total > 0 ? Math.min(100, (transfer.transferred / transfer.total) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted mb-0.5">
        <span className="truncate">{transfer.filename}</span>
        <span>{Math.round(transfer.status === 'done' ? 100 : pct)}%</span>
      </div>
      <div className="h-1 bg-surface-2 rounded overflow-hidden">
        <div
          className={cn('h-full', transfer.status === 'error' ? 'bg-danger' : transfer.status === 'done' ? 'bg-success' : 'bg-accent')}
          style={{ width: `${transfer.status === 'done' ? 100 : pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted mt-0.5">
        <span>{formatBytes(transfer.transferred)} / {formatBytes(transfer.total)}</span>
        {transfer.status === 'active' && <span>{formatSpeed(transfer.bytesPerSecond)} · {formatEta(transfer.etaSeconds)}</span>}
      </div>
    </div>
  )
}
