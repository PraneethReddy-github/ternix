import type { BrowserWindow } from 'electron'

/**
 * Thin event bridge from the main process to the renderer. main.ts registers the active
 * BrowserWindow; services call `emit(channel, payload)` to push terminal data, transfer
 * progress, host-key prompts, etc. to the UI.
 */
class BusImpl {
  private win: BrowserWindow | null = null

  setWindow(win: BrowserWindow): void {
    this.win = win
  }

  emit(channel: string, ...args: any[]): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, ...args)
    }
  }
}

export const Bus = new BusImpl()
