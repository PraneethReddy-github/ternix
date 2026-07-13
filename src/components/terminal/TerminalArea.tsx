import { useState, useRef, useEffect } from 'react'
import { Server, Plus } from 'lucide-react'
import { useTabStore, isTabSplit, tabDrag } from '@/store/useTabStore'
import { useUiStore } from '@/store/useUiStore'
import { SplitLayout } from './SplitLayout'
import { TabBar, moveToGroup } from '@/components/layout/TabBar'
import { SftpPanel } from '@/components/sftp/SftpPanel'

/** Height of a tab strip (h-9), which the panes below it are offset by. */
const STRIP_H = 36

export function TerminalArea() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const groupActive = useTabStore((s) => s.groupActive)
  const splitRatio = useTabStore((s) => s.splitRatio)
  const newTab = useTabStore((s) => s.newTab)
  const openDialog = useUiStore((s) => s.openDialog)
  const sftpOpen = useUiStore((s) => s.sftpOpen)

  const [sftpWidth, setSftpWidth] = useState(600)
  /** Which group a dragged tab would land in — drives the split preview overlay. */
  const [dropZone, setDropZone] = useState<0 | 1 | null>(null)
  const draggingRef = useRef(false)
  const splitDragRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (splitDragRef.current && areaRef.current) {
        const rect = areaRef.current.getBoundingClientRect()
        useTabStore.getState().setSplitRatio((e.clientX - rect.left) / rect.width)
        return
      }
      if (!draggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newWidth = rect.right - e.clientX
      setSftpWidth(Math.max(420, Math.min(newWidth, rect.width * 0.9)))
    }
    const handleMouseUp = () => {
      if (draggingRef.current || splitDragRef.current) {
        draggingRef.current = false
        splitDragRef.current = false
        document.body.style.cursor = ''
      }
    }
    const clearZone = () => setDropZone(null)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('dragend', clearZone) // cancelled drag never fires drop
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('dragend', clearZone)
    }
  }, [])

  const split = isTabSplit(tabs)
  // Fraction of the width the left group takes. An unsplit area previews a 50/50 drop.
  const r = split ? splitRatio : 0.5

  /** Rect of a split group's column, or the whole area when unsplit. */
  const col = (g: 0 | 1): React.CSSProperties =>
    split
      ? g === 0
        ? { left: 0, width: `calc(${r * 100}% - 2px)` }
        : { left: `calc(${r * 100}% + 2px)`, width: `calc(${(1 - r) * 100}% - 2px)` }
      : { left: 0, right: 0 }

  const empty = (
      <div className="h-full flex flex-col items-center justify-center gap-6 text-muted">
        <div className="flex items-center justify-center w-20 h-20 border-4 border-border rounded-[1.25rem] text-border font-mono font-bold tracking-tighter" style={{ fontSize: 32, lineHeight: 1 }}>
          {'>T<'}
        </div>
        <div className="text-center">
          <div className="text-lg text-text font-semibold">Ternix</div>
          <div className="text-[13px]">One terminal. Everything.</div>
        </div>
        <div className="flex gap-3">
          <button className="tx-btn-primary" onClick={() => newTab({ protocol: 'local', title: 'Local Shell' })}>
            <Plus size={15} /> Local shell
          </button>
          <button className="tx-btn-ghost border border-border" onClick={() => openDialog({ kind: 'newSession' })}>
            <Server size={15} /> New SSH session
          </button>
        </div>
        <div className="text-[11px] text-muted">
          <kbd className="px-1.5 py-0.5 bg-surface-2 rounded border border-border">Ctrl</kbd> +{' '}
          <kbd className="px-1.5 py-0.5 bg-surface-2 rounded border border-border">P</kbd> for the command palette
        </div>
      </div>
  )

  return (
    <div className="h-full flex min-h-0" ref={containerRef}>
      {/* Tabs stay flat, absolutely-positioned, id-keyed siblings — the tab split only
          changes each tab's rect, never its spot in the React tree, so panes (and their
          PTYs) survive splitting/unsplitting exactly like SplitLayout's panes do. */}
      <div
        className="flex-1 relative min-w-0"
        ref={areaRef}
        // Capture phase: xterm sits under here and would otherwise eat the drag events.
        onDragOverCapture={(e) => {
          if (!tabDrag.id || !areaRef.current) return
          e.preventDefault()
          // Over a tab strip the strip itself owns the drop (reorder / join that group).
          if ((e.target as HTMLElement).closest('[data-tabbar]')) return setDropZone(null)
          const rect = areaRef.current.getBoundingClientRect()
          const x = (e.clientX - rect.left) / rect.width
          setDropZone(x > 0.65 ? 1 : x < 0.35 ? 0 : null)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropZone(null)
        }}
        onDropCapture={() => {
          const id = tabDrag.id
          if (id && dropZone !== null) moveToGroup(id, dropZone)
          setDropZone(null)
        }}
      >
        {([0, 1] as const).map((g) =>
          g === 1 && !split ? null : (
            <div key={g} className="absolute top-0" style={{ ...col(g), height: STRIP_H }}>
              <TabBar group={g} />
            </div>
          )
        )}

        {tabs.map((tab) => {
          const g = tab.group ?? 0
          const visible = split ? tab.id === groupActive[g] : tab.id === activeTabId
          const style: React.CSSProperties = {
            ...col(g),
            top: STRIP_H,
            bottom: 0,
            display: visible ? 'block' : 'none'
          }
          return (
            <div
              key={tab.id}
              className="absolute"
              style={style}
              onMouseDownCapture={() => {
                if (useTabStore.getState().activeTabId !== tab.id) useTabStore.getState().setActiveTab(tab.id)
              }}
            >
              <SplitLayout tab={tab} />
            </div>
          )
        })}

        {tabs.length === 0 && <div className="absolute inset-x-0 bottom-0" style={{ top: STRIP_H }}>{empty}</div>}

        {split && (
          <div
            className="absolute top-0 bottom-0 w-[5px] cursor-col-resize z-10 bg-border hover:bg-accent/50 transition-colors"
            style={{ left: `calc(${r * 100}% - 2px)` }}
            onMouseDown={(e) => {
              e.preventDefault()
              splitDragRef.current = true
              document.body.style.cursor = 'col-resize'
            }}
          />
        )}

        {/* Drop preview: the half the dragged tab would land in, animating between sides. */}
        <div
          className="absolute top-0 bottom-0 z-20 pointer-events-none rounded-sm border-2 border-accent bg-accent/15 transition-all duration-150 ease-out"
          style={{
            ...(dropZone === 1 ? { left: `${r * 100}%`, right: 0 } : { left: 0, width: `${r * 100}%` }),
            opacity: dropZone === null ? 0 : 1
          }}
        />
      </div>
      {sftpOpen && (
        <div style={{ width: sftpWidth }} className="relative border-l border-border min-w-[420px] flex flex-col shrink-0">
          <div 
            className="absolute left-[-3px] top-0 bottom-0 w-[6px] cursor-col-resize z-10 hover:bg-accent/30 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault()
              draggingRef.current = true
              document.body.style.cursor = 'col-resize'
            }}
          />
          <SftpPanel />
        </div>
      )}
    </div>
  )
}
