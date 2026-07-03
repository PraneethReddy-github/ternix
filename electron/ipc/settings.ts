import { handle } from './util'
import type { VaultStatus, TerminalTheme } from '@shared/index'
import { settingsRepo, themesRepo } from '../db/repo'
import { CryptoService } from '../services/CryptoService'

export function registerSettingsHandlers(): void {
  // Settings KV
  handle<string | null>('settings:get', (key: string) => settingsRepo.get(key))
  handle<void>('settings:set', (key: string, value: string) => {
    settingsRepo.set(key, value)
    if (key === 'security.vaultLockTimeout') CryptoService.setLockTimeout(Number(value) || 0)
  })
  handle<Record<string, string>>('settings:getAll', () => settingsRepo.getAll())

  // Vault
  handle<VaultStatus>('vault:status', () => ({
    locked: CryptoService.isLocked(),
    hasMasterPassword: CryptoService.hasMasterPassword(),
    usingKeychain: CryptoService.isUsingKeychain()
  }))
  handle<void>('vault:setMasterPassword', (oldPw: string | null, newPw: string) => CryptoService.setMasterPassword(oldPw, newPw))
  handle<boolean>('vault:unlock', (password: string) => CryptoService.unlock(password))
  handle<void>('vault:lock', () => CryptoService.lock())
  handle<void>('vault:removeMasterPassword', (currentPw: string) => CryptoService.removeMasterPassword(currentPw))
  // User activity → reset the idle auto-lock timer (no-op in keychain mode).
  handle<void>('vault:activity', () => CryptoService.touch())

  // Custom themes
  handle<TerminalTheme[]>('themes:listCustom', () => themesRepo.list())
  handle<void>('themes:saveCustom', (theme: TerminalTheme) => themesRepo.save(theme.id, theme))
  handle<void>('themes:deleteCustom', (id: string) => themesRepo.delete(id))
}
