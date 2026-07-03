import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { Snippet } from '@shared/index'
import { useSessionStore } from '@/store/useSessionStore'
import { useTabStore } from '@/store/useTabStore'
import { useUiStore } from '@/store/useUiStore'
import { PanelHeader } from '@/components/layout/Sidebar'
import { ProtocolIcon } from './ProtocolIcon'
import { connectSession } from './SessionCard'
import { fuzzyFilter } from '@/utils/fuzzy'

/** Global search across sessions and snippets. */
export function SearchPanel() {
  const sessions = useSessionStore((s) => s.sessions)
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [q, setQ] = useState('')
  const notify = useUiStore((s) => s.notify)

  useEffect(() => {
    window.ternix.snippets.list().then(setSnippets)
  }, [])

  const sessionHits = useMemo(() => (q ? fuzzyFilter(q, sessions, (s) => `${s.name} ${s.host ?? ''} ${s.tags.join(' ')}`).slice(0, 20) : []), [q, sessions])
  const snippetHits = useMemo(() => (q ? fuzzyFilter(q, snippets, (s) => `${s.name} ${s.command}`).slice(0, 20) : []), [q, snippets])

  return (
    <div className="flex flex-col h-full min-h-0">
      <PanelHeader title="Global Search" />
      <div className="px-2 py-2 border-b border-border">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything…" className="w-full bg-bg border border-border rounded-input pl-7 pr-2 py-1 text-[12px]" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {sessionHits.length > 0 && <div className="text-[10px] uppercase text-muted mb-1">Sessions</div>}
        {sessionHits.map((s) => (
          <button key={`s${s.id}`} className="w-full flex items-center gap-2 px-2 py-1 rounded-input hover:bg-surface-2 text-left" onDoubleClick={() => connectSession(s, useTabStore)}>
            <ProtocolIcon protocol={s.protocol} size={13} />
            <span className="text-[13px] truncate">{s.name}</span>
            <span className="text-[11px] text-muted truncate">{s.host}</span>
          </button>
        ))}
        {snippetHits.length > 0 && <div className="text-[10px] uppercase text-muted mt-3 mb-1">Snippets</div>}
        {snippetHits.map((s) => (
          <button
            key={`n${s.id}`}
            className="w-full flex flex-col px-2 py-1 rounded-input hover:bg-surface-2 text-left"
            onClick={() => {
              const pane = useTabStore.getState().getActivePane()
              if (pane) window.ternix.terminal.write(pane.id, s.command + '\r')
              else notify('No active terminal', 'error')
            }}
          >
            <span className="text-[13px] truncate">{s.name}</span>
            <code className="text-[11px] text-muted truncate">{s.command}</code>
          </button>
        ))}
        {q && sessionHits.length === 0 && snippetHits.length === 0 && <div className="text-center text-[12px] text-muted mt-8">No results.</div>}
      </div>
    </div>
  )
}
