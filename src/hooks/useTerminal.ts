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

let audioCtx: AudioContext | null = null
/** Short terminal bell tone via WebAudio (no asset needed). */
function playBeep() {
  try {
    audioCtx ??= new AudioContext()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.05
    osc.connect(gain).connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.12)
  } catch {
    /* audio unavailable */
  }
}

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
    // Ligatures (Fira Code / JetBrains Mono →, ⇒, ≥ …) only render in xterm's DOM
    // renderer, which shapes real text runs. The WebGL/canvas renderers draw glyph-by-glyph
    // and can't. The addon-ligatures package needs Node fs in the renderer (disabled here
    // for security), so we deliver ligatures by staying on the DOM renderer when enabled.
    let isDisposed = false;
    const ligatures = s.getBool('appearance.ligatures')
    if (!ligatures && s.get('advanced.rendererType') === 'webgl' && s.getBool('advanced.hardwareAcceleration')) {
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
      } else if (mode === 'audio') {
        playBeep()
      }
    })

    // User input → backend.
    const inputDisposable = term.onData((data) => window.ternix.terminal.write(pane.id, data))

    // Backend output → terminal.
    const offData = window.ternix.terminal.onData(pane.id, (data) => term.write(data))
    const offStatus = window.ternix.terminal.onStatus(pane.id, ({ state, message }) =>
      setPaneState(pane.id, state as any, message)
    )
    // Auto-reconnect bookkeeping. Only remote sessions auto-reconnect — respawning a
    // local shell the user deliberately exited would be annoying.
    let reconnectAttempts = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    // Schedule an auto-reconnect if enabled and the retry budget isn't spent.
    // Returns true if a retry was scheduled (caller then skips the manual-hint path).
    const scheduleReconnect = (reason?: string): boolean => {
      const st = useSettingsStore.getState()
      if (pane.protocol === 'local' || isDisposed || !st.getBool('general.autoReconnect')) return false
      const maxRetries = st.getNum('general.autoReconnectRetries')
      if (reconnectAttempts >= maxRetries) return false
      reconnectAttempts++
      const delay = (st.getNum('general.autoReconnectDelay') || 3) * 1000
      term.writeln(`\r\n\x1b[90m[ ${reason ?? 'disconnected'} — reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${maxRetries}) ]\x1b[0m`)
      setPaneState(pane.id, 'connecting')
      reconnectTimer = setTimeout(() => {
        if (isDisposed) return
        reconnectTimer = null
        spawnConnection()
      }, delay)
      return true
    }

    const failed = (msg: string, color: string) => {
      if (scheduleReconnect(msg)) return
      term.writeln(`\r\n${color}${msg}\x1b[0m`)
      term.writeln(`\x1b[90m[ Press Ctrl+R to reconnect ]\x1b[0m`)
      setPaneState(pane.id, 'error', msg)
    }

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
            failed(res.error ?? 'Connection failed', '\x1b[31m')
          } else {
            reconnectAttempts = 0 // clean connect resets the retry budget
            // Reflect auto-recording (recording.autoRecord) so the indicator shows.
            window.ternix.recordings
              .isRecording(pane.id)
              .then((rec) => rec && useTabStore.getState().setPaneRecording(pane.id, true))
              .catch(() => {})
          }
        })
        .catch((err) => failed(err.message, '\x1b[31m'))
    }

    const offExit = window.ternix.terminal.onExit(pane.id, ({ reason, clean }) => {
      // Ctrl+D / `exit` ends the session on purpose — close the pane instead of
      // offering to reconnect to something the user just walked away from.
      if (clean) {
        const tab = useTabStore.getState().tabs.find((t) => t.panes.some((p) => p.id === pane.id))
        if (tab) {
          useTabStore.getState().closePane(tab.id, pane.id)
          return
        }
      }
      if (scheduleReconnect(reason)) return
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
          reconnectAttempts = 0 // manual reconnect gets a fresh retry budget
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
      if (reconnectTimer) clearTimeout(reconnectTimer)
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
