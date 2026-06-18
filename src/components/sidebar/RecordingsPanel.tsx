import { useEffect, useState } from 'react'
import { Play, Trash2, CircleDot, Download } from 'lucide-react'
import type { Recording } from '@shared/index'
import { useUiStore } from '@/store/useUiStore'
import { PanelHeader } from '@/components/layout/Sidebar'
import { formatDuration } from '@/utils/formatDuration'
import { RecordingPlayer } from '@/components/dialogs/RecordingPlayer'

export function RecordingsPanel() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [playing, setPlaying] = useState<Recording | null>(null)
  const openDialog = useUiStore((s) => s.openDialog)
  const notify = useUiStore((s) => s.notify)

  const load = () => window.ternix.recordings.list().then(setRecordings)
  useEffect(() => {
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [])

  const remove = (r: Recording) =>
    openDialog({ kind: 'confirm', title: 'Delete recording', message: `Delete recording of "${r.session_name}"?`, danger: true, onConfirm: async () => { await window.ternix.recordings.delete(r.id); load() } })

  const exportCast = async (r: Recording) => {
    try {
      const content = await window.ternix.recordings.read(r.id)
      const path = await window.ternix.system.saveFile(`${r.session_name}.cast`, content)
      if (path) notify('Exported', 'success')
    } catch (e: any) {
      notify(e.message, 'error')
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <PanelHeader title="Recordings" />
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {recordings.map((r) => (
          <div key={r.id} className="group rounded-input border border-border p-2">
            <div className="flex items-center gap-2">
              <CircleDot size={13} className="text-danger shrink-0" />
              <span className="text-[12px] text-text truncate flex-1">{r.session_name}</span>
              <button className="text-muted hover:text-success" title="Play" onClick={() => setPlaying(r)}>
                <Play size={14} />
              </button>
              <button className="text-muted hover:text-text opacity-0 group-hover:opacity-100" title="Export .cast" onClick={() => exportCast(r)}>
                <Download size={13} />
              </button>
              <button className="text-muted hover:text-danger opacity-0 group-hover:opacity-100" onClick={() => remove(r)}>
                <Trash2 size={13} />
              </button>
            </div>
            <div className="text-[10px] text-muted mt-1 flex gap-2">
              <span>{new Date(r.started_at + 'Z').toLocaleString()}</span>
              {r.duration_ms != null && <span>· {formatDuration(r.duration_ms / 1000)}</span>}
            </div>
          </div>
        ))}
        {recordings.length === 0 && <div className="text-center text-[12px] text-muted mt-8">No recordings yet.</div>}
      </div>
      {playing && <RecordingPlayer recording={playing} onClose={() => setPlaying(null)} />}
    </div>
  )
}
