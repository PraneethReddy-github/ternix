import { useState } from 'react'
import type { Session } from '@shared/index'
import { Modal } from '@/components/ui/Modal'

/** Multi-select list of sessions. Used to pick which servers a vault key applies to or gets deployed to. */
export function SessionPickerDialog({
  title,
  sessions,
  preselected = [],
  applyLabel = 'Apply',
  onApply,
  onClose
}: {
  title: string
  sessions: Session[]
  preselected?: number[]
  applyLabel?: string
  onApply: (ids: number[]) => void
  onClose: () => void
}) {
  const [picked, setPicked] = useState<Set<number>>(new Set(preselected))
  const allPicked = sessions.length > 0 && sessions.every((s) => picked.has(s.id))

  const toggle = (id: number) =>
    setPicked((p) => {
      const n = new Set(p)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  return (
    <Modal
      title={title}
      width={480}
      onClose={onClose}
      footer={
        <>
          <button className="tx-btn-ghost border border-border mr-auto" onClick={() => setPicked(allPicked ? new Set() : new Set(sessions.map((s) => s.id)))}>
            {allPicked ? 'Select none' : 'Select all'}
          </button>
          <button className="tx-btn-ghost border border-border" onClick={onClose}>Cancel</button>
          <button className="tx-btn-primary" onClick={() => { onApply([...picked]); onClose() }}>{applyLabel}</button>
        </>
      }
    >
      <div className="space-y-1 max-h-[240px] overflow-y-auto">
        {sessions.map((s) => (
          <label key={s.id} className="flex items-center gap-2 rounded-input border border-border p-2 text-[13px] text-text cursor-pointer hover:bg-surface-2">
            <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
            <span className="truncate">{s.name}</span>
            <span className="ml-auto text-[11px] text-muted shrink-0">{s.username ? `${s.username}@` : ''}{s.host}</span>
          </label>
        ))}
        {sessions.length === 0 && <div className="text-center text-[12px] text-muted py-8">No SSH sessions.</div>}
      </div>
    </Modal>
  )
}
