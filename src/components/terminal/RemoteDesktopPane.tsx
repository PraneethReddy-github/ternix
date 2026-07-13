import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, ExternalLink, Loader2, AlertTriangle, MonitorOff, Monitor } from 'lucide-react'
import type { Pane, Tab } from '@shared/ui'
import { useTabStore } from '@/store/useTabStore'
import { useUiStore } from '@/store/useUiStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { ensureVaultUnlocked } from '@/utils/vaultGuard'
import { ProtocolIcon } from '@/components/sidebar/ProtocolIcon'
import { cn } from '@/utils/cn'

// 'native' = the session was handed off to the OS Remote Desktop client (separate window).
type Status = 'connecting' | 'connected' | 'disconnected' | 'error' | 'native'

// Guacamole.Client.State enum values we care about.
const GUAC_CONNECTED = 3
const GUAC_DISCONNECTED = 5

const isWindows = () => navigator.userAgent.toLowerCase().includes('windows')

/**
 * Renders an RDP or VNC session inside a pane, just like the terminal — VNC via
 * noVNC speaking to the loopback bridge, RDP via guacamole-common-js speaking to
 * the local guacd gateway. Both fall back to launching the OS-native client.
 */
export function RemoteDesktopPane({ tab, pane, active }: { tab: Tab; pane: Pane; active: boolean }) {
  const screenRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>('connecting')
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  const setActivePane = useTabStore((s) => s.setActivePane)
  const tabFocused = useTabStore((s) => s.activeTabId === tab.id)
  const setPaneState = useTabStore((s) => s.setPaneState)
  const notify = useUiStore((s) => s.notify)
  const showToolbar = useSettingsStore((s) => !s.getBool('appearance.compactMode'))

  const update = useCallback(
    (s: Status, msg = '') => {
      setStatus(s)
      setMessage(msg)
      // 'native' isn't a ConnState — a handed-off session is live, so store it as connected.
      setPaneState(pane.id, s === 'native' ? 'connected' : s, msg)
    },
    [pane.id, setPaneState]
  )

  useEffect(() => {
    if (pane.sessionId == null) {
      update('error', 'This session has no saved connection.')
      return
    }
    let disposed = false
    let cleanup = () => {}

    const connect = async () => {
      update('connecting')
      // RDP/VNC use the saved password, which needs the vault key. Prompt for the master
      // password first if the vault is locked (master-password mode).
      if (!(await ensureVaultUnlocked())) {
        if (!disposed) update('error', 'Vault is locked. Enter your master password to connect.')
        return
      }
      if (disposed) return
      const el = screenRef.current
      if (!el) return
      while (el.firstChild) el.removeChild(el.firstChild) // clean slate on reconnect
      const width = Math.max(640, Math.round(el.clientWidth))
      const height = Math.max(480, Math.round(el.clientHeight))

      try {
        if (pane.protocol === 'vnc') {
          const { wsUrl, password } = await window.ternix.remote.openVnc(pane.id, pane.sessionId!)
          if (disposed) return
          const { default: RFB } = await import('@novnc/novnc')
          const rfb = new RFB(el, wsUrl, { credentials: { password: password || undefined } })
          rfb.scaleViewport = true
          rfb.clipViewport = false
          rfb.background = '#000000'
          let specificError = false
          rfb.addEventListener('connect', () => !disposed && update('connected'))
          rfb.addEventListener('securityfailure', (e: any) => {
            specificError = true
            !disposed && update('error', e?.detail?.reason || 'Authentication failed')
          })
          rfb.addEventListener('credentialsrequired', () => {
            specificError = true
            !disposed && update('error', 'A VNC password is required for this server.')
          })
          rfb.addEventListener('disconnect', (e: any) => {
            if (disposed || specificError) return
            e?.detail?.clean ? update('disconnected', 'Disconnected') : update('error', 'Connection lost')
          })
          cleanup = () => {
            try { rfb.disconnect() } catch { /* ignore */ }
          }
        } else {
          // RDP. In-pane RDP needs guacd, which has no native Windows build — so on
          // Windows we hand the session straight to the OS Remote Desktop client
          // (mstsc), which does NLA natively. On Linux/macOS we use the embedded
          // guacd viewer when a guacd is actually reachable, else hand off too.
          let embedded = false
          if (!isWindows()) {
            const guacd = await window.ternix.remote.guacdStatus()
            if (disposed) return
            embedded = guacd.available
          }
          if (!embedded) {
            update('connecting', 'Opening in your Remote Desktop client…')
            try {
              const what = await window.ternix.remote.launchNative(pane.sessionId!)
              if (!disposed) update('native', `Opened in ${what}.`)
            } catch (e: any) {
              if (!disposed) update('error', e?.message || 'No Remote Desktop client was found on this system.')
            }
            return
          }
          const { wsUrl, token } = await window.ternix.remote.openRdp(pane.id, pane.sessionId!, width, height)
          if (disposed) return
          const { default: Guacamole } = await import('guacamole-common-js')
          const tunnel = new Guacamole.WebSocketTunnel(wsUrl)
          const client = new Guacamole.Client(tunnel)
          const display = client.getDisplay()
          const displayEl = display.getElement() as HTMLElement
          displayEl.style.position = 'absolute'
          displayEl.style.transformOrigin = 'top left'
          el.appendChild(displayEl)

          const fit = () => {
            const dw = display.getWidth()
            const dh = display.getHeight()
            if (!dw || !dh) return
            const scale = Math.min(el.clientWidth / dw, el.clientHeight / dh) || 1
            display.scale(scale)
            // Center the scaled display within the pane.
            displayEl.style.left = `${Math.max(0, (el.clientWidth - dw * scale) / 2)}px`
            displayEl.style.top = `${Math.max(0, (el.clientHeight - dh * scale) / 2)}px`
          }
          display.onresize = fit

          const GUAC_WAITING = 2
          const GUAC_CONNECTED = 3
          const GUAC_DISCONNECTED = 5

          client.onstatechange = (state: number) => {
            if (disposed) return
            if (state === GUAC_WAITING) update('connecting', 'Negotiating connection...')
            else if (state === GUAC_CONNECTED) { update('connected'); fit() }
            else if (state === GUAC_DISCONNECTED) update('disconnected', 'Disconnected')
          }
          client.onerror = (err: any) => {
            if (disposed) return
            update('error', err?.message || 'RDP connection error')
            try { client.disconnect() } catch { /* ignore */ }
          }

          // Input. Mouse binds to the (scaled) display element so coordinates map
          // back to the remote correctly; keyboard binds to the focusable pane.
          const mouse = new Guacamole.Mouse(displayEl)
          mouse.onEach(['mousedown', 'mousemove', 'mouseup'], (e: any) => client.sendMouseState(e.state, true))
          mouse.on('mousedown', () => el.focus())
          const keyboard = new Guacamole.Keyboard(el)
          keyboard.onkeydown = (sym: number) => client.sendKeyEvent(1, sym)
          keyboard.onkeyup = (sym: number) => client.sendKeyEvent(0, sym)

          const ro = new ResizeObserver(() => fit())
          ro.observe(el)

          client.connect(`token=${encodeURIComponent(token)}&width=${width}&height=${height}&dpi=96`)
          cleanup = () => {
            ro.disconnect()
            try { keyboard.onkeydown = null; keyboard.onkeyup = null } catch { /* ignore */ }
            try { client.disconnect() } catch { /* ignore */ }
          }
        }
      } catch (err: any) {
        if (!disposed) update('error', err?.message || 'Failed to connect')
      }
    }

    connect()
    return () => {
      disposed = true
      cleanup()
      window.ternix.remote.close(pane.id).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id, pane.sessionId, pane.protocol, attempt])

  // Grab keyboard focus when this becomes the active pane of the focused tab (see TerminalPane).
  useEffect(() => {
    if (active && tabFocused && status === 'connected') {
      const t = setTimeout(() => screenRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [active, tabFocused, status])

  const openNative = async () => {
    if (pane.sessionId == null) return
    try {
      const what = await window.ternix.remote.launchNative(pane.sessionId)
      notify(`Opening in ${what}…`, 'success')
    } catch (e: any) {
      notify(e.message || 'No native client found', 'error')
    }
  }

  const reconnect = () => setAttempt((a) => a + 1)

  return (
    <div
      className={cn('relative flex flex-col min-h-0 min-w-0 h-full', active && tab.panes.length > 1 && 'ring-1 ring-accent/60')}
      onMouseDown={() => {
        setActivePane(tab.id, pane.id)
        screenRef.current?.focus()
      }}
    >
      {showToolbar && (
        <div className="flex items-center gap-2 px-2 h-8 shrink-0 bg-surface border-b border-border text-[12px]">
          <ProtocolIcon protocol={pane.protocol} size={13} />
          <span className="text-text truncate">{pane.title}</span>
          <span className={cn('w-1.5 h-1.5 rounded-full', status === 'connected' || status === 'native' ? 'bg-success' : status === 'error' ? 'bg-danger' : 'bg-warning')} />
          <span className="text-muted truncate">{pane.host}</span>
          <div className="ml-auto flex items-center gap-1">
            <button className="p-1 text-muted hover:text-text" title="Reconnect" onClick={reconnect}><RefreshCw size={13} /></button>
            <button className="p-1 text-muted hover:text-text" title="Open in native client" onClick={openNative}><ExternalLink size={13} /></button>
          </div>
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        <div ref={screenRef} className="absolute inset-0 bg-black outline-none overflow-hidden" tabIndex={0} />

        {status !== 'connected' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg/85 text-center px-6">
            {status === 'connecting' ? (
              <>
                <Loader2 size={28} className="text-accent animate-spin" />
                <div className="text-[13px] text-muted">{message || `Connecting to ${pane.protocol.toUpperCase()} · ${pane.host}…`}</div>
              </>
            ) : status === 'native' ? (
              <>
                <Monitor size={28} className="text-accent" />
                <div className="text-[13px] text-text max-w-md">{message || 'Opened in your Remote Desktop client.'}</div>
                <div className="text-[12px] text-muted max-w-md">
                  {pane.protocol.toUpperCase()} runs in its own window for full performance and native security (NLA).
                </div>
                <button className="tx-btn-primary" onClick={openNative}><ExternalLink size={14} /> Relaunch</button>
              </>
            ) : (
              <>
                {status === 'error' ? <AlertTriangle size={28} className="text-danger" /> : <MonitorOff size={28} className="text-muted" />}
                <div className="text-[13px] text-text max-w-md whitespace-pre-wrap">{message || (status === 'disconnected' ? 'Session disconnected.' : 'Connection failed.')}</div>
                <div className="flex gap-2">
                  <button className="tx-btn-ghost border border-border" onClick={reconnect}><RefreshCw size={14} /> Reconnect</button>
                  <button className="tx-btn-primary" onClick={openNative}><ExternalLink size={14} /> Open in native client</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
