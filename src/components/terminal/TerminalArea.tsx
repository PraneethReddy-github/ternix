import { useState, useRef, useEffect } from 'react'
import { TerminalSquare, Server, Plus } from 'lucide-react'
import { useTabStore } from '@/store/useTabStore'
import { useUiStore } from '@/store/useUiStore'
import { SplitLayout } from './SplitLayout'
import { SftpPanel } from '@/components/sftp/SftpPanel'

export function TerminalArea() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const newTab = useTabStore((s) => s.newTab)
  const openDialog = useUiStore((s) => s.openDialog)
  const sftpOpen = useUiStore((s) => s.sftpOpen)

  const [sftpWidth, setSftpWidth] = useState(600)
  const draggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newWidth = rect.right - e.clientX
      setSftpWidth(Math.max(420, Math.min(newWidth, rect.width * 0.9)))
    }
    const handleMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false
        document.body.style.cursor = ''
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  if (tabs.length === 0) {
    return (
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
  }

  return (
    <div className="h-full flex min-h-0" ref={containerRef}>
      <div className="flex-1 relative min-w-0">
        {tabs.map((tab) => (
          <div key={tab.id} className="absolute inset-0" style={{ display: tab.id === activeTabId ? 'block' : 'none' }}>
            <SplitLayout tab={tab} />
          </div>
        ))}
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
