import { useState, useEffect } from 'react'
import { ArrowUp, RefreshCw, FolderPlus, Eye, EyeOff, Loader2, RotateCcw, WifiOff } from 'lucide-react'
import type { SftpEntry } from '@shared/index'
import type { MenuItem } from '@/components/ui/ContextMenu'
import { useContextMenu } from '@/components/ui/ContextMenu'
import { FileRow } from './FileRow'

export interface DragPayload {
  side: 'local' | 'remote'
  entry: SftpEntry
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
  contextItems: (entry: SftpEntry, side: 'local' | 'remote') => MenuItem[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { open, element } = useContextMenu()

  const [pathInput, setPathInput] = useState(pane.path)

  useEffect(() => {
    setPathInput(pane.path)
  }, [pane.path])

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
        className="flex-1 overflow-y-auto"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData('tx/file')
          if (raw) {
            const payload = JSON.parse(raw) as DragPayload
            if (payload.side !== side) onDropTransfer(payload, pane.path)
          }
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
              {pane.entries.map((entry) => (
                <FileRow
                  key={entry.path}
                  entry={entry}
                  selected={selected.has(entry.path)}
                  onOpen={() => onOpenEntry(entry)}
                  onSelect={(e) =>
                    setSelected((s) => {
                      const n = new Set(e.ctrlKey || e.metaKey ? s : [])
                      n.has(entry.path) ? n.delete(entry.path) : n.add(entry.path)
                      return n
                    })
                  }
                  onContext={(e) => open(e, contextItems(entry, side))}
                  onDragStart={(e) => e.dataTransfer.setData('tx/file', JSON.stringify({ side, entry } satisfies DragPayload))}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="h-6 flex items-center px-2 border-t border-border text-[10px] text-muted shrink-0">
        {pane.entries.length} items{selected.size > 0 ? ` · ${selected.size} selected` : ''}
      </div>
      {element}
    </div>
  )
}
