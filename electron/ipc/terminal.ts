import { handle, handleE, on } from './util'
import type { SpawnOptions, SpawnResult } from '@shared/index'
import { ConnectionManager } from '../services/ConnectionManager'
import { SshService } from '../services/SshService'
import { SftpService } from '../services/SftpService'
import { TunnelService } from '../services/TunnelService'
import { RecordingService } from '../services/RecordingService'
import { spawnTerminal } from '../services/SpawnService'

export function registerTerminalHandlers(): void {
  handleE<SpawnResult>('terminal:spawn', (event, opts: SpawnOptions) => spawnTerminal(opts, event.sender.id))

  on('terminal:write', (tabId: string, data: string) => {
    ConnectionManager.get(tabId)?.write(data)
  })

  on('terminal:resize', (tabId: string, cols: number, rows: number) => {
    ConnectionManager.resize(tabId, cols, rows)
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
