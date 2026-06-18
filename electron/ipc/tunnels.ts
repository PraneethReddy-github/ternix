import { handle } from './util'
import type { Tunnel, ActiveTunnel } from '@shared/index'
import { tunnelsRepo } from '../db/repo'
import { TunnelService } from '../services/TunnelService'

export function registerTunnelHandlers(): void {
  handle<Tunnel[]>('tunnels:listForSession', (sessionId: number) => tunnelsRepo.listForSession(sessionId))
  handle<Tunnel>('tunnels:create', (data) => tunnelsRepo.create(data))
  handle<Tunnel>('tunnels:update', (id: number, data) => tunnelsRepo.update(id, data))
  handle<void>('tunnels:delete', (id: number) => {
    TunnelService.stop(id)
    tunnelsRepo.delete(id)
  })
  handle<ActiveTunnel>('tunnels:start', (tunnelId: number, tabId: string) => TunnelService.start(tunnelId, tabId))
  handle<void>('tunnels:stop', (tunnelId: number) => TunnelService.stop(tunnelId))
  handle<ActiveTunnel[]>('tunnels:listActive', () => TunnelService.listActive())
}
