import { ipcMain } from 'electron'
import type { IpcResult } from '@shared/index'
import { CryptoService } from '../services/CryptoService'

/**
 * Registers an invoke handler that never throws across the IPC boundary. The result is
 * wrapped in an { ok, data } / { ok, error } envelope which preload unwraps. Every call
 * also pings the vault idle-lock timer.
 */
export function handle<T>(channel: string, fn: (...args: any[]) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
    try {
      CryptoService.touch()
      const data = await fn(...args)
      return { ok: true, data }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
}

/** For fire-and-forget channels (`ipcRenderer.send`). */
export function on(channel: string, fn: (...args: any[]) => void): void {
  ipcMain.on(channel, (_event, ...args) => {
    try {
      CryptoService.touch()
      fn(...args)
    } catch {
      /* swallow — send() has no return path */
    }
  })
}
