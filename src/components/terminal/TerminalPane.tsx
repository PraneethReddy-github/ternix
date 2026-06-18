import { useEffect, useState } from 'react'
import type { Pane, Tab } from '@shared/ui'
import { useTerminal } from '@/hooks/useTerminal'
import { registerPane } from '@/hooks/terminalRegistry'
import { useTabStore } from '@/store/useTabStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUiStore } from '@/store/useUiStore'
import { useContextMenu } from '@/components/ui/ContextMenu'
import { TerminalSearch } from './TerminalSearch'
import { TerminalToolbar } from './TerminalToolbar'
import { cn } from '@/utils/cn'

export function TerminalPane({ tab, pane, active }: { tab: Tab; pane: Pane; active: boolean }) {
  const ctrl = useTerminal(pane)
  const [searchOpen, setSearchOpen] = useState(false)
  const setActivePane = useTabStore((s) => s.setActivePane)
  const showToolbar = useSettingsStore((s) => !s.getBool('appearance.compactMode'))
  const notify = useUiStore((s) => s.notify)
  const { open, element } = useContextMenu()

  // Register pane actions for global shortcuts.
  useEffect(() => {
    return registerPane(pane.id, {
      clear: () => ctrl.clear(),
      focus: () => ctrl.focus(),
      toggleSearch: () => setSearchOpen((v) => !v),
      paste: (t) => ctrl.paste(t)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id])

  // Broadcast terminal dimensions to the status bar.
  useEffect(() => {
    const term = ctrl.terminal.current
    if (!term) return
    const emit = () => window.dispatchEvent(new CustomEvent('tx:resize', { detail: { paneId: pane.id, cols: term.cols, rows: term.rows } }))
    const d = term.onResize(emit)
    emit()
    return () => d.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctrl.terminal.current])

  const doPaste = async () => {
    const text = await window.ternix.system.readClipboard()
    if (!text) return
    if (useSettingsStore.getState().getBool('terminal.pasteConfirmMultiline') && text.includes('\n')) {
      if (!window.confirm(`Paste ${text.split('\n').length} lines?`)) return
    }
    const trimmed = useSettingsStore.getState().getBool('terminal.trimPasteWhitespace') ? text.replace(/[ \t]+$/gm, '') : text
    ctrl.paste(trimmed)
  }

  const copy = () => {
    const sel = ctrl.terminal.current?.getSelection()
    if (sel) window.ternix.system.writeClipboard(sel)
  }

  const onContext = (e: React.MouseEvent) => {
    if (useSettingsStore.getState().get('terminal.rightClick') === 'paste') {
      e.preventDefault()
      doPaste()
      return
    }
    open(e, [
      { label: 'Copy', onClick: copy, disabled: !ctrl.terminal.current?.hasSelection() },
      { label: 'Paste', onClick: doPaste },
      { label: 'Select All', onClick: () => ctrl.terminal.current?.selectAll() },
      { separator: true },
      { label: 'Copy as HTML', onClick: copyAsHtml },
      { label: 'Find…', onClick: () => setSearchOpen(true) },
      { separator: true },
      { label: 'Clear', onClick: () => ctrl.clear() },
      { label: 'Reset', onClick: () => ctrl.terminal.current?.reset() }
    ])
  }

  const copyAsHtml = () => {
    const sel = ctrl.terminal.current?.getSelection() ?? ''
    window.ternix.system.writeClipboard(`<pre style="font-family:monospace">${sel.replace(/</g, '&lt;')}</pre>`)
    notify('Copied as HTML', 'success')
  }

  return (
    <div
      className={cn('relative flex flex-col min-h-0 min-w-0 h-full', active && tab.panes.length > 1 && 'ring-1 ring-accent/60')}
      onMouseDown={() => setActivePane(tab.id, pane.id)}
    >
      {showToolbar && <TerminalToolbar tab={tab} pane={pane} />}
      <div className="relative flex-1 min-h-0 bg-bg" onContextMenu={onContext}>
        <div ref={ctrl.containerRef} className="absolute inset-1.5" />
        {searchOpen && <TerminalSearch search={ctrl.search} onClose={() => setSearchOpen(false)} />}
      </div>
      {element}
    </div>
  )
}
