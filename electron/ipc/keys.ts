import { handle } from './util'
import type { SshKey, KeyGenerateOptions } from '@shared/index'
import { KeyService } from '../services/KeyService'
import { keysRepo } from '../db/repo'
import { CryptoService } from '../services/CryptoService'

export function registerKeyHandlers(): void {
  handle<SshKey[]>('keys:list', () => keysRepo.list())
  handle<SshKey>('keys:generate', (opts: KeyGenerateOptions) => KeyService.generate(opts))
  handle<SshKey>('keys:import', (pem: string, name: string, passphrase?: string) => KeyService.import(pem, name, passphrase))
  handle<SshKey[]>('keys:importFromDir', () => KeyService.importFromDir())
  handle<void>('keys:delete', (id: number) => keysRepo.delete(id))
  handle<string>('keys:getPublic', (id: number) => KeyService.getPublic(id))
  handle<string>('keys:exportPrivate', (id: number, masterPassword: string) => {
    // Require master password confirmation when one is set.
    if (CryptoService.hasMasterPassword() && !CryptoService.unlock(masterPassword)) {
      throw new Error('Master password is incorrect')
    }
    const pem = keysRepo.getPrivate(id)
    if (!pem) throw new Error('Private key not found')
    return pem
  })
  handle<void>('keys:deploy', (keyId: number, sessionId: number) => KeyService.deploy(keyId, sessionId))
}
