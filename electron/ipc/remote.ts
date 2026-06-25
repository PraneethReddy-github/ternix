import { handle } from './util'
import type { VncOpenResult, RdpOpenResult, GuacdStatus } from '@shared/index'
import { VncBridgeService } from '../services/VncBridgeService'
import { RdpGatewayService } from '../services/RdpGatewayService'
import { NativeClientService } from '../services/NativeClientService'
import { sessionsRepo, logRepo } from '../db/repo'

/** Open connection-log rows for live RDP/VNC tabs, so durations are recorded. */
const logIds = new Map<string, number>()

function startLog(tabId: string, session: { id: number; name: string; host: string | null }): void {
  endLog(tabId, 'reconnected')
  try {
    logIds.set(tabId, logRepo.start(session.id, session.name, session.host))
    sessionsRepo.markConnected(session.id)
  } catch {
    /* logging is best-effort */
  }
}

function endLog(tabId: string, reason: string): void {
  const id = logIds.get(tabId)
  if (id != null) {
    try { logRepo.end(id, reason) } catch { /* ignore */ }
    logIds.delete(tabId)
  }
}

function parseHostPort(hostStr: string, defaultPort: number) {
  let h = hostStr
  let p = defaultPort
  const match = hostStr.match(/^(?:\[([^\]]+)\]|([^:]+))(?::(\d+))?$/)
  if (match) {
    h = match[1] || match[2] || hostStr
    p = match[3] ? parseInt(match[3], 10) : defaultPort
  }
  return { host: h, port: p }
}

export function registerRemoteHandlers(): void {
  handle<VncOpenResult>('remote:vnc:open', async (tabId: string, sessionId: number) => {
    const session = sessionsRepo.get(sessionId)
    if (!session) throw new Error('Session not found')
    if (session.protocol !== 'vnc') throw new Error('Not a VNC session')
    const target = parseHostPort(session.host || '', session.port || 5900)
    const { wsUrl } = await VncBridgeService.open(tabId, target.host, target.port)
    const { vncPassword } = sessionsRepo.getSecrets(sessionId)
    startLog(tabId, session)
    return { protocol: 'vnc', wsUrl, password: vncPassword }
  })

  handle<RdpOpenResult>('remote:rdp:open', async (tabId: string, sessionId: number, width?: number, height?: number) => {
    const session = sessionsRepo.get(sessionId)
    if (!session) throw new Error('Session not found')
    if (session.protocol !== 'rdp') throw new Error('Not an RDP session')
    const { password } = sessionsRepo.getSecrets(sessionId)
    const target = parseHostPort(session.host || '', session.port || 3389)
    const { wsUrl, token } = await RdpGatewayService.open({
      hostname: target.host,
      port: target.port,
      username: session.username,
      password,
      domain: session.rdp_domain,
      width: width || session.rdp_width || 1920,
      height: height || session.rdp_height || 1080
    })
    startLog(tabId, session)
    return { protocol: 'rdp', wsUrl, token }
  })

  handle<GuacdStatus>('remote:rdp:guacdStatus', () => RdpGatewayService.guacdStatus())

  handle<string>('remote:native:launch', async (sessionId: number) => {
    const session = sessionsRepo.get(sessionId)
    if (!session) throw new Error('Session not found')
    const secrets = sessionsRepo.getSecrets(sessionId)
    return NativeClientService.launch(session, secrets)
  })

  handle<void>('remote:close', async (tabId: string) => {
    VncBridgeService.close(tabId)
    endLog(tabId, 'closed by user')
  })
}
