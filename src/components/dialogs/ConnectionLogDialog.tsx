import { useEffect, useState } from 'react'
import type { ConnectionLogEntry } from '@shared/index'
import { Modal } from '@/components/ui/Modal'
import { formatDuration } from '@/utils/formatDuration'

export function ConnectionLogDialog({ sessionId, onClose }: { sessionId?: number; onClose: () => void }) {
  const [log, setLog] = useState<ConnectionLogEntry[]>([])

  useEffect(() => {
    window.ternix.log.list(sessionId).then(setLog)
  }, [sessionId])

  return (
    <Modal
      title="Connection log"
      width={640}
      onClose={onClose}
      footer={
        <button
          className="tx-btn-ghost border border-border"
          onClick={async () => {
            await window.ternix.log.clear()
            setLog([])
          }}
        >
          Clear log
        </button>
      }
    >
      <div className="max-h-[60vh] overflow-y-auto">
        <table className="w-full text-[12px]">
          <thead className="text-muted text-left sticky top-0 bg-surface">
            <tr>
              <th className="py-1 font-medium">Session</th>
              <th className="py-1 font-medium">Host</th>
              <th className="py-1 font-medium">Connected</th>
              <th className="py-1 font-medium">Duration</th>
              <th className="py-1 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {log.map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="py-1.5 text-text">{e.session_name}</td>
                <td className="py-1.5 text-muted">{e.host}</td>
                <td className="py-1.5 text-muted">{e.connected_at ? new Date(e.connected_at + 'Z').toLocaleString() : '—'}</td>
                <td className="py-1.5 text-muted">{e.duration_seconds != null ? formatDuration(e.duration_seconds) : '—'}</td>
                <td className="py-1.5 text-muted truncate max-w-[140px]">{e.disconnect_reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {log.length === 0 && <div className="text-center text-[12px] text-muted py-8">No connection history.</div>}
      </div>
    </Modal>
  )
}
