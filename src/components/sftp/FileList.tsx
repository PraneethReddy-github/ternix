import { useState, useEffect } from 'react'
import { ArrowUp, RefreshCw, FolderPlus, Eye, EyeOff, Loader2 } from 'lucide-react'
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
    <div className="flex flex-col min-h-0 flex-1 border-r border-border last:border-r-0">
      <div className="h-8 flex items-center gap-1 px-2 border-b border-border bg-surface shrink-0">
        <span className="text-[11px] uppercase text-muted font-semibold mr-1">{title}</span>
        <button className="text-muted hover:text-text p-1" title="Up" onClick={pane.up}><ArrowUp size={13} /></button>
        <button className="text-muted hover:text-text p-1" title="Refresh" onClick={pane.refresh}><RefreshCw size={13} /></button>
        <button className="text-muted hover:text-text p-1" title="New folder" onClick={onMkdir}><FolderPlus size={13} /></button>
        <button className="text-muted hover:text-text p-1" title="Toggle hidden" onClick={() => pane.setShowHidden(!pane.showHidden)}>
          {pane.showHidden ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        {pane.loading && <Loader2 size={13} className="tx-spin text-muted" />}
        <span className="ml-auto text-[10px] text-muted opacity-50">Drag files to transfer</span>
      </div>

      <input
        className="px-2 py-1 text-[11px] text-muted font-mono truncate text-left border-b border-border bg-transparent outline-none focus:text-text hover:text-text w-full"
        value={pathInput || '/'}
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
        {pane.error ? (
          <div className="text-[12px] text-danger p-3">{pane.error}</div>
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
