import { handle } from './util'
import type { CloudflaredStatus, MobileStatus } from '@shared/index'
import { MobileService } from '../services/MobileService'
import { CloudflaredService } from '../services/CloudflaredService'
import { settingsRepo } from '../db/repo'

export const DEFAULT_MOBILE_PORT = 7717

export function mobilePort(): number {
  return Number(settingsRepo.get('mobile.port')) || DEFAULT_MOBILE_PORT
}

export function registerMobileHandlers(): void {
  handle<MobileStatus>('mobile:status', () => MobileService.status())
  handle<MobileStatus>('mobile:start', (port?: number) => MobileService.start(port || mobilePort()))
  handle<MobileStatus>('mobile:stop', async () => {
    await MobileService.stop()
    return MobileService.status()
  })
  handle<{ secret: string; expiresAt: number }>('mobile:pairing', () => MobileService.newPairing())
  handle<void>('mobile:clearPairing', () => MobileService.clearPairing())
  handle<MobileStatus>('mobile:revokeDevice', (id: string) => {
    MobileService.revoke(id)
    return MobileService.status()
  })
  handle<MobileStatus>('mobile:startTunnel', () => MobileService.startTunnel())
  handle<MobileStatus>('mobile:stopTunnel', () => {
    MobileService.stopTunnel()
    return MobileService.status()
  })

  handle<CloudflaredStatus>('mobile:cloudflaredStatus', () => CloudflaredService.status())
  handle<CloudflaredStatus>('mobile:installCloudflared', async () => {
    await CloudflaredService.install()
    return CloudflaredService.status()
  })
  handle<CloudflaredStatus>('mobile:uninstallCloudflared', async () => {
    await CloudflaredService.uninstall()
    return CloudflaredService.status()
  })
}
