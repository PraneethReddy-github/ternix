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

  // Ensure terminal grabs focus when it becomes the active pane
  useEffect(() => {
    if (active) {
      // Small timeout to ensure DOM is visible if we just switched tabs
      const timer = setTimeout(() => ctrl.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [active, ctrl])

  const doPaste = async () => {
    const text = await window.ternix.system.readClipboard()
    if (!text) {
      ctrl.focus()
      return
    }
    
    // Normalize Windows CRLF to LF to prevent double-enters in nano/vim
    const normalized = text.replace(/\r\n/g, '\n')
    
    const lines = normalized.split('\n').length
    if (useSettingsStore.getState().getBool('terminal.pasteConfirmMultiline') && lines > 1) {
      useUiStore.getState().openDialog({
        kind: 'confirm',
        title: 'Paste multiple lines?',
        message: `You are about to paste ${lines} lines of text.`,
        onConfirm: () => {
          const trimmed = useSettingsStore.getState().getBool('terminal.trimPasteWhitespace') ? normalized.replace(/[ \t]+$/gm, '') : normalized
          ctrl.paste(trimmed)
          setTimeout(() => ctrl.focus(), 10)
        },
        onCancel: () => {
          setTimeout(() => ctrl.focus(), 10)
        }
      })
      return
    }
    
    const trimmed = useSettingsStore.getState().getBool('terminal.trimPasteWhitespace') ? normalized.replace(/[ \t]+$/gm, '') : normalized
    ctrl.paste(trimmed)
    setTimeout(() => ctrl.focus(), 10)
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
    const html = `<pre style="font-family:monospace">${sel.replace(/</g, '&lt;')}</pre>`
    window.ternix.system.writeClipboardHtml(html, sel)
    notify('Copied as HTML', 'success')
  }

  return (
    <div
      className={cn('relative flex flex-col min-h-0 min-w-0 h-full', active && tab.panes.length > 1 && 'ring-1 ring-accent/60')}
      onMouseDown={() => {
        setActivePane(tab.id, pane.id)
        ctrl.focus()
      }}
    >
      {showToolbar && <TerminalToolbar tab={tab} pane={pane} />}
      <div
        className="relative flex-1 min-h-0 bg-bg"
        onContextMenu={onContext}
        onMouseDown={(e) => {
          if (e.button === 1 && useSettingsStore.getState().getBool('terminal.pasteOnMiddleClick')) {
            e.preventDefault()
            doPaste()
          }
        }}
      >
        <div ref={ctrl.containerRef} className="absolute inset-1.5" />
        {pane.recording && (
          <div className="absolute top-1.5 right-2.5 z-10 flex items-center gap-1 rounded bg-danger/90 px-1.5 py-0.5 text-[10px] font-semibold text-white pointer-events-none" title="This session is being recorded">
            <span className="w-1.5 h-1.5 rounded-full bg-white tx-pulse" /> REC
          </div>
        )}
        {searchOpen && <TerminalSearch search={ctrl.search} onClose={() => setSearchOpen(false)} />}
      </div>
      {element}
    </div>
  )
}
