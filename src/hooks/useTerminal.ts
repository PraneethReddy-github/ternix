import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import type { Pane } from '@shared/ui'
import { useTabStore } from '@/store/useTabStore'
import { useThemeStore } from '@/store/useThemeStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { toXtermTheme } from '@/themes'

export interface TerminalController {
  containerRef: React.RefObject<HTMLDivElement>
  terminal: React.MutableRefObject<Terminal | null>
  search: React.MutableRefObject<SearchAddon | null>
  fit: () => void
  focus: () => void
  paste: (text: string) => void
  clear: () => void
}

/**
 * Owns the xterm.js instance for a single pane: creation, addon wiring, spawn over IPC,
 * data plumbing, resize → SIGWINCH, and teardown.
 */
export function useTerminal(pane: Pane): TerminalController {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)
  const search = useRef<SearchAddon | null>(null)
  const setPaneState = useTabStore((s) => s.setPaneState)
  const settings = useSettingsStore

  const fit = () => {
    try {
      fitAddon.current?.fit()
    } catch {
      /* container not measurable yet */
    }
  }
  const focus = () => terminal.current?.focus()
  const paste = (text: string) => terminal.current?.paste(text)
  const clear = () => terminal.current?.clear()

  useEffect(() => {
    if (!containerRef.current) return
    const s = settings.getState()
    const theme = useThemeStore.getState().active()

    const term = new Terminal({
      fontFamily: s.get('appearance.fontFamily'),
      fontSize: s.getNum('appearance.fontSize') || 14,
      lineHeight: Number(s.get('appearance.lineHeight')) || 1.2,
      letterSpacing: Number(s.get('appearance.letterSpacing')) || 0,
      cursorStyle: (s.get('appearance.cursorStyle') as 'block' | 'underline' | 'bar') || 'block',
      cursorBlink: s.getBool('appearance.cursorBlink'),
      scrollback: s.getNum('terminal.scrollback') || 5000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      theme: toXtermTheme(theme),
      wordSeparator: s.get('terminal.wordSeparators')
    })

    const fitA = new FitAddon()
    const searchA = new SearchAddon()
    term.loadAddon(fitA)
    term.loadAddon(searchA)
    term.loadAddon(new WebLinksAddon((_e, uri) => window.ternix.system.openPath(uri)))
    const uni = new Unicode11Addon()
    term.loadAddon(uni)
    term.unicode.activeVersion = '11'

    term.open(containerRef.current)
    fitAddon.current = fitA
    search.current = searchA
    terminal.current = term

    // Optional GPU renderer.
    let isDisposed = false;
    if (s.get('advanced.rendererType') === 'webgl' && s.getBool('advanced.hardwareAcceleration')) {
      import('@xterm/addon-webgl')
        .then(({ WebglAddon }) => {
          if (isDisposed) return;
          try {
            const webgl = new WebglAddon()
            webgl.onContextLoss(() => webgl.dispose())
            term.loadAddon(webgl)
          } catch {
            /* fall back to canvas/dom */
          }
        })
        .catch(() => {})
    }

    fit()

    // Copy-on-select.
    term.onSelectionChange(() => {
      if (s.getBool('terminal.copyOnSelect')) {
        const sel = term.getSelection()
        if (sel) window.ternix.system.writeClipboard(sel)
      }
    })

    // Bell.
    term.onBell(() => {
      const mode = s.get('terminal.bell')
      if (mode === 'visual' && containerRef.current) {
        containerRef.current.style.transition = 'background 80ms'
        containerRef.current.style.background = 'rgba(255,255,255,0.12)'
        setTimeout(() => containerRef.current && (containerRef.current.style.background = ''), 90)
      }
    })

    // User input → backend.
    const inputDisposable = term.onData((data) => window.ternix.terminal.write(pane.id, data))

    // Backend output → terminal.
    const offData = window.ternix.terminal.onData(pane.id, (data) => term.write(data))
    const offStatus = window.ternix.terminal.onStatus(pane.id, ({ state, message }) =>
      setPaneState(pane.id, state as any, message)
    )
    const spawnConnection = () => {
      // For local shells, honour the user's configured default shell (e.g. powershell.exe
      // on Windows, /bin/zsh on Unix). Read fresh so a settings change applies on reconnect.
      const shellPref = useSettingsStore.getState().get('general.defaultShell').trim()
      const localShell =
        pane.protocol === 'local' && shellPref ? { shell: shellPref } : undefined
      window.ternix.terminal
        .spawn({ tabId: pane.id, sessionId: pane.sessionId, cols: term.cols, rows: term.rows, localShell })
        .then((res) => {
          if (!res.ok) {
            term.writeln(`\r\n\x1b[31m${res.error ?? 'Connection failed'}\x1b[0m`)
            term.writeln(`\x1b[90m[ Press Ctrl+R to reconnect ]\x1b[0m`)
            setPaneState(pane.id, 'error', res.error)
          }
        })
        .catch((err) => {
          term.writeln(`\r\n\x1b[31m${err.message}\x1b[0m`)
          term.writeln(`\x1b[90m[ Press Ctrl+R to reconnect ]\x1b[0m`)
          setPaneState(pane.id, 'error', err.message)
        })
    }

    const offExit = window.ternix.terminal.onExit(pane.id, ({ reason }) => {
      term.writeln(`\r\n\x1b[90m[ ${reason ?? 'disconnected'} ]\x1b[0m`)
      term.writeln(`\x1b[90m[ Press Ctrl+R to reconnect ]\x1b[0m`)
      setPaneState(pane.id, 'disconnected', reason)
    })

    term.onKey(({ key, domEvent }) => {
      if (domEvent.ctrlKey && domEvent.key.toLowerCase() === 'r') {
        const tabs = useTabStore.getState().tabs
        let state: string | undefined
        for (const t of tabs) {
          const p = t.panes.find(x => x.id === pane.id)
          if (p) { state = p.state; break; }
        }
        if (state === 'disconnected' || state === 'error') {
          term.clear()
          setPaneState(pane.id, 'connecting')
          spawnConnection()
        }
      }
    })

    // Spawn the connection.
    spawnConnection()

    // Resize handling → fit + notify backend.
    const ro = new ResizeObserver(() => {
      if (!isDisposed) fit()
      if (terminal.current && !isDisposed) window.ternix.terminal.resize(pane.id, terminal.current.cols, terminal.current.rows)
    })
    ro.observe(containerRef.current)

    return () => {
      isDisposed = true;
      ro.disconnect()
      inputDisposable.dispose()
      offData()
      offStatus()
      offExit()
      window.ternix.terminal.kill(pane.id).catch(() => {})
      term.dispose()
      if (terminal.current === term) {
        terminal.current = null
        fitAddon.current = null
        search.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id])

  // Live-apply theme changes.
  const themeId = useThemeStore((s) => s.activeId)
  useEffect(() => {
    if (terminal.current) terminal.current.options.theme = toXtermTheme(useThemeStore.getState().active())
  }, [themeId])

  return { containerRef, terminal, search, fit, focus, paste, clear }
}
