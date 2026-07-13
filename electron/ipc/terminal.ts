import { handle, handleE, on } from './util'
import type { SpawnOptions, SpawnResult } from '@shared/index'
import { ConnectionManager } from '../services/ConnectionManager'
import { PtyService } from '../services/PtyService'
import { SshService } from '../services/SshService'
import { TelnetService } from '../services/TelnetService'
import { SerialService } from '../services/SerialService'
import { SftpService } from '../services/SftpService'
import { TunnelService } from '../services/TunnelService'
import { RecordingService } from '../services/RecordingService'
import { sessionsRepo, tunnelsRepo, settingsRepo } from '../db/repo'

export function registerTerminalHandlers(): void {
  handleE<SpawnResult>('terminal:spawn', async (event, opts: SpawnOptions) => {
    const { tabId, sessionId, cols, rows } = opts
    const owner = event.sender.id

    // Tab tear-off adoption: the pane id already has a live connection spawned by
    // another window — transfer ownership and re-attach instead of reconnecting.
    const existing = ConnectionManager.get(tabId)
    if (existing) {
      ConnectionManager.setOwner(tabId, owner)
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
  })

  on('terminal:write', (tabId: string, data: string) => {
    ConnectionManager.get(tabId)?.write(data)
  })

  on('terminal:resize', (tabId: string, cols: number, rows: number) => {
    ConnectionManager.get(tabId)?.resize(cols, rows)
  })

  handle<void>('terminal:kill', async (tabId: string) => {
    RecordingService.stop(tabId)
    SftpService.close(tabId)
    TunnelService.stopForTab(tabId)
    ConnectionManager.kill(tabId)
  })

  on('terminal:hostkey:respond', (tabId: string, decision: 'accept' | 'always' | 'reject') => {
    SshService.respondHostKey(tabId, decision)
  })

  on('terminal:kbi:respond', (tabId: string, responses: string[]) => {
    SshService.respondKbi(tabId, responses)
  })

  on('terminal:credentials-respond', (tabId: string, response: any) => {
    SshService.respondCredentials(tabId, response)
  })

  handle<number | null>('terminal:latency', async (tabId: string) => {
    const backend = ConnectionManager.get(tabId)
    return backend?.latency ? backend.latency() : null
  })
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
