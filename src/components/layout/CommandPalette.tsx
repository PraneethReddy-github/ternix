import { useEffect, useMemo, useRef, useState } from 'react'
import { Server, TerminalSquare, Command, Code2, Settings, KeyRound, SplitSquareHorizontal } from 'lucide-react'
import { useUiStore } from '@/store/useUiStore'
import { useSessionStore } from '@/store/useSessionStore'
import { useTabStore } from '@/store/useTabStore'
import { connectSession } from '@/components/sidebar/SessionCard'
import { fuzzyScore } from '@/utils/fuzzy'

interface Item {
  id: string
  label: string
  hint?: string
  icon: React.ReactNode
  run: () => void
}

export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen)
  const setOpen = useUiStore((s) => s.setPaletteOpen)
  const openDialog = useUiStore((s) => s.openDialog)
  const setView = useUiStore((s) => s.setView)
  const sessions = useSessionStore((s) => s.sessions)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const actions: Item[] = useMemo(
    () => [
      { id: 'a.newSsh', label: 'New SSH session', icon: <Server size={15} />, run: () => openDialog({ kind: 'newSession' }) },
      { id: 'a.newLocal', label: 'New local shell', icon: <TerminalSquare size={15} />, run: () => useTabStore.getState().newTab({ protocol: 'local', title: 'Local Shell' }) },
      { id: 'a.splitRight', label: 'Split terminal right', icon: <SplitSquareHorizontal size={15} />, run: () => { const t = useTabStore.getState(); t.activeTabId && t.splitPane(t.activeTabId, 'h') } },
      { id: 'a.splitDown', label: 'Split terminal down', icon: <SplitSquareHorizontal size={15} />, run: () => { const t = useTabStore.getState(); t.activeTabId && t.splitPane(t.activeTabId, 'v') } },
      { id: 'a.toggleSidebar', label: 'Toggle sidebar', icon: <Command size={15} />, run: () => useUiStore.getState().toggleSidebar() },
      { id: 'a.sftp', label: 'Open SFTP file manager', icon: <Code2 size={15} />, run: () => useUiStore.getState().toggleSftp() },
      { id: 'a.keyVault', label: 'Open key vault', icon: <KeyRound size={15} />, run: () => openDialog({ kind: 'keyVault' }) },
      { id: 'a.broadcast', label: 'Toggle broadcast mode', icon: <Command size={15} />, run: () => { const t = useTabStore.getState(); t.activeTabId && t.toggleBroadcast(t.activeTabId) } },
      { id: 'a.settings', label: 'Open settings', icon: <Settings size={15} />, run: () => setView('settings') },
      { id: 'a.import', label: 'Import sessions', icon: <Server size={15} />, run: () => openDialog({ kind: 'exportImport' }) },
      { id: 'a.export', label: 'Export sessions', icon: <Server size={15} />, run: () => openDialog({ kind: 'exportImport' }) }
    ],
    [openDialog, setView]
  )

  const sessionItems: Item[] = useMemo(
    () =>
      sessions.map((s) => ({
        id: `s.${s.id}`,
        label: s.name,
        hint: s.host ?? s.protocol,
        icon: <Server size={15} className="text-accent" />,
        run: () => connectSession(s, useTabStore)
      })),
    [sessions]
  )

  const all = [...sessionItems, ...actions]
  const results = useMemo(() => {
    if (!query.trim()) return all.slice(0, 12)
    return all
      .map((item) => ({ item, score: fuzzyScore(query, item.label + ' ' + (item.hint ?? '')) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((x) => x.item)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sessions])

  if (!open) return null

  const choose = (item?: Item) => {
    item?.run()
    setOpen(false)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] bg-black/40" onMouseDown={() => setOpen(false)}>
      <div className="w-[600px] max-w-[90vw] bg-surface border border-border rounded-panel shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setIndex((i) => Math.min(i + 1, results.length - 1))
            else if (e.key === 'ArrowUp') setIndex((i) => Math.max(i - 1, 0))
            else if (e.key === 'Enter') choose(results[index])
            else if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="Search sessions and commands…"
          className="w-full bg-bg px-4 py-3 text-[14px] text-text border-b border-border outline-none"
        />
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {results.map((item, i) => (
            <button
              key={item.id}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(item)}
              className={`w-full flex items-center gap-3 px-4 py-2 text-left ${i === index ? 'bg-accent/15' : ''}`}
            >
              {item.icon}
              <span className="text-[13px] text-text flex-1 truncate">{item.label}</span>
              {item.hint && <span className="text-[11px] text-muted">{item.hint}</span>}
            </button>
          ))}
          {results.length === 0 && <div className="px-4 py-6 text-center text-[12px] text-muted">No matches</div>}
        </div>
      </div>
    </div>
  )
}
