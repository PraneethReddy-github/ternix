import { app, shell, dialog, clipboard, BrowserWindow } from 'electron'
import { writeFileSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { handle, on } from './util'
import { SerialService } from '../services/SerialService'
import { ConnectionManager } from '../services/ConnectionManager'
import { Bus } from '../services/bus'
import { settingsRepo } from '../db/repo'

const nodeRequire = createRequire(import.meta.url)

// Auto-clear the clipboard N seconds after a copy (security.clearClipboard).
// Only clears if the clipboard still holds what we wrote, so we never clobber
// something the user copied elsewhere in the meantime.
let clipboardClearTimer: NodeJS.Timeout | null = null
function scheduleClipboardClear(copied: string): void {
  if (clipboardClearTimer) clearTimeout(clipboardClearTimer)
  const secs = Number(settingsRepo.get('security.clearClipboard') ?? '0') || 0
  if (secs <= 0) return
  clipboardClearTimer = setTimeout(() => {
    if (clipboard.readText() === copied) clipboard.clear()
  }, secs * 1000)
}

export function registerSystemHandlers(getWindow: () => BrowserWindow | null): void {
  // System
  handle('system:listSerialPorts', () => SerialService.listPorts())
  handle<void>('system:openPath', async (path: string) => {
    await shell.openPath(path)
  })
  handle<void>('system:showItemInFolder', (path: string) => shell.showItemInFolder(path))
  handle<string | null>('system:selectDirectory', async () => {
    const win = getWindow()
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })
  handle<string | null>('system:selectFile', async (filters?: { name: string; extensions: string[] }[]) => {
    const win = getWindow()
    const res = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters })
    return res.canceled ? null : res.filePaths[0]
  })
  handle<string>('system:readFile', (path: string) => readFileSync(path, 'utf8'))
  handle<string | null>('system:saveFile', async (defaultName: string, content: string) => {
    const win = getWindow()
    const res = await dialog.showSaveDialog(win!, { defaultPath: defaultName })
    if (res.canceled || !res.filePath) return null
    writeFileSync(res.filePath, content, 'utf8')
    return res.filePath
  })
  handle<string>('system:readClipboard', () => clipboard.readText())
  handle<void>('system:writeClipboard', (text: string) => {
    clipboard.writeText(text)
    scheduleClipboardClear(text)
  })
  handle<void>('system:writeClipboardHtml', (html: string, text: string) => {
    clipboard.write({ html, text })
    scheduleClipboardClear(text)
  })
  handle<NodeJS.Platform>('system:platform', () => process.platform)
  handle<string>('system:version', () => app.getVersion())

  // Window controls (frameless titlebar)
  on('window:minimize', () => getWindow()?.minimize())
  on('window:maximize', () => {
    const win = getWindow()
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  on('window:close', () => getWindow()?.close())
  on('window:toggleFullscreen', () => {
    const win = getWindow()
    if (win) win.setFullScreen(!win.isFullScreen())
  })
  handle<boolean>('window:isMaximized', () => getWindow()?.isMaximized() ?? false)

  // Broadcast: send keystrokes to multiple tabs at once
  on('broadcast:write', (tabIds: string[], data: string) => {
    for (const id of tabIds) ConnectionManager.get(id)?.write(data)
  })

  // Updates (electron-updater is optional)
  let autoUpdater: any = null
  const getUpdater = () => {
    if (!autoUpdater) {
      try {
        autoUpdater = nodeRequire('electron-updater').autoUpdater
        autoUpdater.autoDownload = false
        autoUpdater.on('update-available', (info: any) => Bus.emit('updates:status', { event: 'available', info }))
        autoUpdater.on('update-not-available', () => Bus.emit('updates:status', { event: 'none' }))
        autoUpdater.on('error', (err: any) => Bus.emit('updates:status', { event: 'error', info: { message: String(err) } }))
        autoUpdater.on('download-progress', (p: any) => Bus.emit('updates:status', { event: 'progress', info: p }))
        autoUpdater.on('update-downloaded', (info: any) => Bus.emit('updates:status', { event: 'downloaded', info }))
      } catch {
        return null
      }
    }
    return autoUpdater
  }

  handle<{ available: boolean; version?: string }>('updates:check', async () => {
    try {
      const up = getUpdater()
      if (!up) return { available: false }
      const result = await up.checkForUpdates()
      const latestVersion = result?.updateInfo?.version
      const isAvailable = latestVersion && latestVersion !== app.getVersion()
      return { available: !!isAvailable, version: latestVersion }
    } catch {
      return { available: false }
    }
  })

  handle<void>('updates:download', async () => {
    const up = getUpdater()
    if (up) await up.downloadUpdate()
  })

  on('updates:install', () => {
    const up = getUpdater()
    if (up) up.quitAndInstall()
  })
}
