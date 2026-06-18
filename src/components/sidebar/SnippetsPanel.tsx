import { useEffect, useState } from 'react'
import { Plus, Play, Pencil, Trash2, Upload, Download, Search } from 'lucide-react'
import type { Snippet } from '@shared/index'
import { useTabStore } from '@/store/useTabStore'
import { useUiStore } from '@/store/useUiStore'
import { PanelHeader } from '@/components/layout/Sidebar'
import { fuzzyFilter } from '@/utils/fuzzy'

/** Expand ${VAR} placeholders by prompting the user for each unique variable. */
export function expandSnippet(command: string): string | null {
  const vars = [...new Set([...command.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]))]
  let out = command
  for (const v of vars) {
    const val = window.prompt(`Value for \${${v}}`)
    if (val === null) return null
    out = out.replaceAll(`\${${v}}`, val)
  }
  return out
}

export function SnippetsPanel() {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [filter, setFilter] = useState('')
  const openDialog = useUiStore((s) => s.openDialog)
  const notify = useUiStore((s) => s.notify)

  const load = () => window.ternix.snippets.list().then(setSnippets)
  useEffect(() => {
    load()
    const id = setInterval(load, 2000)
    return () => clearInterval(id)
  }, [])

  const send = (snip: Snippet) => {
    const pane = useTabStore.getState().getActivePane()
    if (!pane) return notify('No active terminal', 'error')
    const expanded = expandSnippet(snip.command)
    if (expanded === null) return
    window.ternix.terminal.write(pane.id, expanded + '\r')
  }

  const remove = (snip: Snippet) =>
    openDialog({ kind: 'confirm', title: 'Delete snippet', message: `Delete "${snip.name}"?`, danger: true, onConfirm: async () => { await window.ternix.snippets.delete(snip.id); load() } })

  const exportJson = async () => {
    const json = await window.ternix.snippets.export()
    const path = await window.ternix.system.saveFile('snippets.json', json)
    if (path) notify('Snippets exported', 'success')
  }
  const importJson = async () => {
    const path = await window.ternix.system.selectFile([{ name: 'JSON', extensions: ['json'] }])
    if (!path) return
    notify('Use Export/Import dialog for files; pasting supported in editor', 'info')
  }

  const filtered = fuzzyFilter(filter, snippets, (s) => `${s.name} ${s.description ?? ''} ${s.tags.join(' ')}`)

  return (
    <div className="flex flex-col h-full min-h-0">
      <PanelHeader title="Snippets">
        <button className="text-muted hover:text-text" title="New snippet" onClick={() => openDialog({ kind: 'snippet' })}>
          <Plus size={15} />
        </button>
        <button className="text-muted hover:text-text" title="Import" onClick={importJson}>
          <Upload size={14} />
        </button>
        <button className="text-muted hover:text-text" title="Export" onClick={exportJson}>
          <Download size={14} />
        </button>
      </PanelHeader>
      <div className="px-2 py-2 border-b border-border">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search snippets…" className="w-full bg-bg border border-border rounded-input pl-7 pr-2 py-1 text-[12px]" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.map((s) => (
          <div key={s.id} className="group rounded-input border border-border p-2 hover:border-accent/50">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-text font-medium truncate flex-1">{s.name}</span>
              <button className="text-muted hover:text-success" title="Send to terminal" onClick={() => send(s)}>
                <Play size={14} />
              </button>
              <button className="text-muted hover:text-text opacity-0 group-hover:opacity-100" onClick={() => openDialog({ kind: 'snippet', id: s.id })}>
                <Pencil size={13} />
              </button>
              <button className="text-muted hover:text-danger opacity-0 group-hover:opacity-100" onClick={() => remove(s)}>
                <Trash2 size={13} />
              </button>
            </div>
            <code className="block text-[11px] text-muted truncate mt-1">{s.command}</code>
            {s.tags.length > 0 && <div className="flex gap-1 mt-1 flex-wrap">{s.tags.map((t) => <span key={t} className="text-[10px] px-1 rounded bg-surface-2 text-muted">{t}</span>)}</div>}
          </div>
        ))}
        {snippets.length === 0 && <div className="text-center text-[12px] text-muted mt-6">No snippets yet.</div>}
      </div>
    </div>
  )
}
