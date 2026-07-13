import { BrowserWindow } from 'electron'

/**
 * Thin event bridge from the main process to the renderer(s). Services call
 * `emit(channel, payload)` to push terminal data, transfer progress, host-key
 * prompts, etc. Events broadcast to every open window — terminal channels are
 * pane-id-scoped (`terminal:data:<paneId>`), so only the window that owns the
 * pane has a listener. Per-window events (e.g. maximize state) are sent directly
 * via that window's webContents instead of the Bus.
 */
class BusImpl {
  emit(channel: string, ...args: any[]): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, ...args)
    }
  }
}

export const Bus = new BusImpl()
