import { useState, useEffect, useMemo } from 'react'
import { ArrowUp, RefreshCw, FolderPlus, Eye, EyeOff, Loader2, RotateCcw, WifiOff, ArrowDownUp } from 'lucide-react'
import type { SftpEntry } from '@shared/index'
import type { MenuItem } from '@/components/ui/ContextMenu'
import { useContextMenu } from '@/components/ui/ContextMenu'
import { sortEntries, type SftpSort } from '@/utils/sftpSort'
import { FileRow } from './FileRow'

export interface DragPayload {
  side: 'local' | 'remote'
  // Only name and path are ever read, which lets an OS drop supply plain paths.
  entries: Pick<SftpEntry, 'name' | 'path'>[]
}

// A "stack of cards" drag image for multi-file drags. Returns an off-screen node
// the caller must remove after setDragImage reads it.
function buildStackGhost(count: number): HTMLElement {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:fixed;top:-1000px;left:-1000px;width:150px;height:44px;'
  for (let i = 2; i >= 0; i--) {
    const card = document.createElement('div')
    card.style.cssText =
      `position:absolute;left:${i * 4}px;top:${i * 4}px;width:140px;height:30px;` +
      'border-radius:6px;background:var(--tx-surface-2,#333);border:1px solid var(--tx-accent,#6cf);'
    wrap.appendChild(card)
  }
  const badge = document.createElement('div')
  badge.textContent = `${count} items`
  badge.style.cssText =
    'position:absolute;left:8px;top:6px;font:600 12px sans-serif;color:var(--tx-text,#eee);' +
    'line-height:18px;padding:0 6px;'
  wrap.appendChild(badge)
  return wrap
}

export function FileList({
  title,
  side,
  pane,
  onOpenEntry,
  onMkdir,
  onDropTransfer,
  contextItems
}: {
  title: string
  side: 'local' | 'remote'
  pane: ReturnType<typeof import('@/hooks/useSftp').usePane>
  onOpenEntry: (entry: SftpEntry) => void
  onMkdir: () => void
  onDropTransfer: (payload: DragPayload, targetDir: string) => void
  contextItems: (entries: SftpEntry[], side: 'local' | 'remote') => MenuItem[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SftpSort>('default')
  const { open, element } = useContextMenu()

  const [pathInput, setPathInput] = useState(pane.path)

  // Display order. Everything below works off `rows`, never pane.entries, so that
  // shift-range selection and Ctrl+A follow what is actually on screen.
  const rows = useMemo(() => sortEntries(pane.entries, sortBy), [pane.entries, sortBy])

  // Reset selection whenever the folder changes.
  useEffect(() => {
    setPathInput(pane.path)
    setSelected(new Set())
    setAnchor(null)
  }, [pane.path])

  // Click select with ctrl/cmd (toggle) and shift (range) modifiers.
  const handleSelect = (entry: SftpEntry, e: React.MouseEvent) => {
    const paths = rows.map((x) => x.path)
    if (e.shiftKey && anchor) {
      const a = paths.indexOf(anchor)
      const b = paths.indexOf(entry.path)
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        setSelected((prev) => {
          const n = new Set(e.ctrlKey || e.metaKey ? prev : [])
          for (let i = lo; i <= hi; i++) n.add(paths[i])
          return n
        })
        return
      }
    }
    setSelected((prev) => {
      const n = new Set(e.ctrlKey || e.metaKey ? prev : [])
      n.has(entry.path) ? n.delete(entry.path) : n.add(entry.path)
      return n
    })
    setAnchor(entry.path)
  }

  // The rows an action operates on: the whole selection if the target is part of
  // it, otherwise just the target (which also becomes the new selection).
  const targetsFor = (entry: SftpEntry): SftpEntry[] => {
    if (selected.has(entry.path) && selected.size > 1) return rows.filter((x) => selected.has(x.path))
    return [entry]
  }

  const startDrag = (entry: SftpEntry, e: React.DragEvent) => {
    const entries = targetsFor(entry)
    e.dataTransfer.setData('tx/file', JSON.stringify({ side, entries } satisfies DragPayload))
    e.dataTransfer.effectAllowed = 'copyMove'
    if (entries.length > 1) {
      const ghost = buildStackGhost(entries.length)
      document.body.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, 12, 12)
      setTimeout(() => ghost.remove(), 0)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="h-8 flex items-center gap-1 px-2 border-b border-border bg-surface shrink-0">
        <span className="text-[11px] uppercase text-muted font-semibold mr-1">{title}</span>
        <button className="text-muted hover:text-text p-1" title="Up" onClick={pane.up}><ArrowUp size={13} /></button>
        <button className="text-muted hover:text-text p-1" title="Refresh" onClick={pane.refresh}><RefreshCw size={13} /></button>
        <button className="text-muted hover:text-text p-1" title="New folder" onClick={onMkdir}><FolderPlus size={13} /></button>
        <button className="text-muted hover:text-text p-1" title="Toggle hidden" onClick={() => pane.setShowHidden(!pane.showHidden)}>
          {pane.showHidden ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button
          className="text-muted hover:text-text p-1"
          title="Sort"
          onClick={(e) =>
            open(e, [
              { label: 'Default' + (sortBy === 'default' ? ' ✓' : ''), onClick: () => setSortBy('default') },
              // Re-picking the active sort unchecks it and falls back to the server's order.
              ...(['name', 'modified'] as const).map((s) => ({
                label: (s === 'name' ? 'Name (A–Z)' : 'Date modified') + (sortBy === s ? ' ✓' : ''),
                onClick: () => setSortBy(sortBy === s ? 'default' : s)
              }))
            ])
          }
        >
          <ArrowDownUp size={13} />
        </button>
        {pane.loading && <Loader2 size={13} className="animate-spin text-muted ml-1" />}
        {'retry' in pane && pane.error && (
          <button className="text-muted hover:text-warning p-1" title="Retry" onClick={(pane as any).retry}>
            <RotateCcw size={12} />
          </button>
        )}
        <span className="ml-auto text-[10px] text-muted opacity-50">Drag files to transfer</span>
      </div>

      <input
        className="px-2 py-1 text-[11px] text-muted font-mono truncate text-left border-b border-border bg-transparent outline-none focus:text-text hover:text-text w-full"
        value={pathInput}
        onChange={(e) => setPathInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') pane.list(pathInput)
        }}
        onBlur={() => setPathInput(pane.path)}
        spellCheck={false}
      />

      <div
        className="flex-1 overflow-y-auto outline-none"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault()
            setSelected(new Set(rows.map((x) => x.path)))
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const raw = e.dataTransfer.getData('tx/file')
          if (raw) {
            const payload = JSON.parse(raw) as DragPayload
            if (payload.side !== side) onDropTransfer(payload, pane.path)
            return
          }
          // A drop from outside the app. Only the remote pane can act on it — uploading
          // is the one thing we can do with an OS path. SftpService.upload recurses into
          // directories on its own, so a dropped folder needs no special handling here.
          if (side !== 'remote') return
          const entries = Array.from(e.dataTransfer.files)
            .map((f) => ({ name: f.name, path: window.ternix.system.getPathForFile(f) }))
            .filter((x) => x.path)
          if (entries.length) onDropTransfer({ side: 'local', entries }, pane.path)
        }}
      >
        {pane.loading && !pane.path ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted py-6">
            <Loader2 size={20} className="animate-spin opacity-50" />
            <span className="text-[11px] opacity-60">Opening SFTP session…</span>
          </div>
        ) : pane.error ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-3 text-center py-6">
            <WifiOff size={22} className="text-danger opacity-60" />
            <div className="text-[11px] text-danger leading-relaxed whitespace-pre-line">{pane.error}</div>
            {'retry' in pane && (
              <button
                className="flex items-center gap-1 px-3 py-1 text-[11px] rounded border border-border text-muted hover:text-text transition-colors"
                onClick={(pane as any).retry}
              >
                <RotateCcw size={11} /> Retry
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <tbody>
              {rows.map((entry) => (
                <FileRow
                  key={entry.path}
                  entry={entry}
                  selected={selected.has(entry.path)}
                  onOpen={() => onOpenEntry(entry)}
                  onSelect={(e) => handleSelect(entry, e)}
                  onContext={(e) => {
                    if (!selected.has(entry.path)) {
                      setSelected(new Set([entry.path]))
                      setAnchor(entry.path)
                    }
                    open(e, contextItems(targetsFor(entry), side))
                  }}
                  onDragStart={(e) => startDrag(entry, e)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="h-6 flex items-center px-2 border-t border-border text-[10px] text-muted shrink-0">
        {rows.length} items{selected.size > 0 ? ` · ${selected.size} selected` : ''}
      </div>
      {element}
    </div>
  )
}
