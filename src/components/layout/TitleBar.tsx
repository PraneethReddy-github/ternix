import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X, TerminalSquare } from 'lucide-react'

/** Frameless custom titlebar with window controls (Windows/Linux). On macOS the OS
 *  traffic lights are inset, so we only render the drag region + title there. */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false)
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    window.ternix.system.platform().then((p) => setIsMac(p === 'darwin'))
    window.ternix.window.isMaximized().then(setMaximized)
    return window.ternix.window.onMaximizeChange(setMaximized)
  }, [])

  return (
    <div className="drag-region h-8 flex items-center justify-between bg-bg border-b border-border select-none">
      <div className="flex items-center gap-2 px-3" style={{ paddingLeft: isMac ? 78 : 12 }}>
        <div className="text-accent font-mono font-bold tracking-tighter" style={{ fontSize: 10 }}>{'>T<'}</div>
        <span className="text-[12px] text-muted">Ternix</span>
      </div>
      {!isMac && (
        <div className="flex no-drag h-full">
          <button className="px-3 hover:bg-surface-2 text-muted hover:text-text" onClick={() => window.ternix.window.minimize()}>
            <Minus size={14} />
          </button>
          <button className="px-3 hover:bg-surface-2 text-muted hover:text-text" onClick={() => window.ternix.window.maximize()}>
            {maximized ? <Copy size={12} /> : <Square size={11} />}
          </button>
          <button className="px-3 hover:bg-danger hover:text-white text-muted" onClick={() => window.ternix.window.close()}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
