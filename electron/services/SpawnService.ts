import type { SpawnOptions, SpawnResult } from '@shared/index'
import { ConnectionManager } from './ConnectionManager'
import { PtyService } from './PtyService'
import { SshService } from './SshService'
import { TelnetService } from './TelnetService'
import { SerialService } from './SerialService'
import { TunnelService } from './TunnelService'
import { RecordingService } from './RecordingService'
import { sessionsRepo, tunnelsRepo, settingsRepo } from '../db/repo'

/**
 * The one place a terminal connection is created. Called by the `terminal:spawn` IPC for
 * desktop panes and by MobileService for panes a phone opens — both must go through here
 * so recording, tunnel auto-start and the connection registry behave identically.
 *
 * `owner` is the webContents id of the window responsible for the pane, or null for panes
 * with no window behind them (mobile), which must survive a window close.
 */
export async function spawnTerminal(opts: SpawnOptions, owner: number | null): Promise<SpawnResult> {
  const { tabId, sessionId, cols, rows } = opts

  // Tab tear-off adoption: the pane id already has a live connection spawned by
  // another window — transfer ownership and re-attach instead of reconnecting.
  const existing = ConnectionManager.get(tabId)
  if (existing) {
    if (owner != null) ConnectionManager.setOwner(tabId, owner)
    ConnectionManager.pushStatus(tabId, 'connected')
    return { tabId, protocol: existing.protocol, ok: true }
  }

  // Local shell when no sessionId.
  if (sessionId == null) {
    const backend = PtyService.spawn(tabId, cols, rows, opts.localShell)
    ConnectionManager.register(tabId, backend, 'Local Shell', 'localhost', null, owner)
    maybeAutoRecord(tabId, null, 'Local Shell', cols, rows)
    return { tabId, protocol: 'local', ok: true }
  }

  const session = sessionsRepo.get(sessionId)
  if (!session) return { tabId, protocol: 'local', ok: false, error: 'Session not found' }

  try {
    let banner: string | undefined
    switch (session.protocol) {
      case 'ssh': {
        const r = await SshService.spawn(tabId, session, cols, rows)
        ConnectionManager.register(tabId, r.backend, session.name, session.host, session.id, owner)
        banner = r.banner
        await autoStartTunnels(tabId, session.id)
        break
      }
      case 'telnet': {
        const backend = await TelnetService.spawn(tabId, session, cols, rows)
        ConnectionManager.register(tabId, backend, session.name, session.host, session.id, owner)
        break
      }
      case 'serial': {
        const backend = await SerialService.spawn(tabId, session)
        ConnectionManager.register(tabId, backend, session.name, session.com_port, session.id, owner)
        break
      }
      case 'local': {
        const backend = PtyService.spawn(tabId, cols, rows, opts.localShell)
        ConnectionManager.register(tabId, backend, session.name, 'localhost', session.id, owner)
        break
      }
      case 'rdp':
      case 'vnc':
        // RDP/VNC are rendered by RemoteDesktopPane via the `remote:*` IPC, not as a terminal.
        return { tabId, protocol: session.protocol, ok: false, error: `${session.protocol.toUpperCase()} is rendered in a remote-desktop pane, not a terminal.` }
      default:
        return { tabId, protocol: session.protocol, ok: false, error: 'Unsupported protocol' }
    }
    maybeAutoRecord(tabId, session.id, session.name, cols, rows)
    return { tabId, protocol: session.protocol, ok: true, banner }
  } catch (err: any) {
    ConnectionManager.pushStatus(tabId, 'error', err.message)
    return { tabId, protocol: session.protocol, ok: false, error: err.message }
  }
}

function maybeAutoRecord(tabId: string, sessionId: number | null, name: string, cols: number, rows: number): void {
  if (settingsRepo.get('recording.autoRecord') === 'true') {
    RecordingService.start(tabId, sessionId, name, cols, rows)
  }
}

async function autoStartTunnels(tabId: string, sessionId: number): Promise<void> {
  const tunnels = tunnelsRepo.listForSession(sessionId).filter((t) => t.auto_start)
  for (const t of tunnels) {
    try {
      await TunnelService.start(t.id, tabId)
    } catch {
      /* surfaced via tunnels:update */
    }
  }
}
