import { app, shell, dialog, clipboard, BrowserWindow, type WebContents } from 'electron'
import { writeFileSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { handle, handleE, on, onE } from './util'
import { isUrl } from './openTarget'
import { SerialService } from '../services/SerialService'
import { ShellService } from '../services/ShellService'
import type { ReleaseNotes } from '@shared/index'
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

export function registerSystemHandlers(): void {
  // Multi-window: every window-scoped action targets the window that sent the IPC.
  const senderWindow = (wc: WebContents): BrowserWindow | null => BrowserWindow.fromWebContents(wc)

  // System
  handle('system:listSerialPorts', () => SerialService.listPorts())
  handle('system:listShells', () => ShellService.list())
  handle<void>('system:openPath', async (path: string) => {
    // Doubles as the terminal's link handler. shell.openPath only opens filesystem
    // paths — a URL (e.g. a link in terminal output, or Tailscale SSH's "visit this
    // URL to authenticate" prompt) must go through openExternal, which is the correct
    // API for URLs on every platform (Linux/macOS/Windows).
    if (isUrl(path)) await shell.openExternal(path)
    else await shell.openPath(path)
  })
  handle<void>('system:showItemInFolder', (path: string) => shell.showItemInFolder(path))
  handleE<string | null>('system:selectDirectory', async (e) => {
    const res = await dialog.showOpenDialog(senderWindow(e.sender)!, { properties: ['openDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })
  handleE<string | null>('system:selectFile', async (e, filters?: { name: string; extensions: string[] }[]) => {
    const res = await dialog.showOpenDialog(senderWindow(e.sender)!, { properties: ['openFile'], filters })
    return res.canceled ? null : res.filePaths[0]
  })
  handle<string>('system:readFile', (path: string) => readFileSync(path, 'utf8'))
  handleE<string | null>('system:saveFile', async (e, defaultName: string, content: string) => {
    const res = await dialog.showSaveDialog(senderWindow(e.sender)!, { defaultPath: defaultName })
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
  onE('window:minimize', (e) => senderWindow(e.sender)?.minimize())
  onE('window:maximize', (e) => {
    const win = senderWindow(e.sender)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  onE('window:close', (e) => senderWindow(e.sender)?.close())
  onE('window:toggleFullscreen', (e) => {
    const win = senderWindow(e.sender)
    if (win) win.setFullScreen(!win.isFullScreen())
  })
  handleE<boolean>('window:isMaximized', (e) => senderWindow(e.sender)?.isMaximized() ?? false)

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

  /**
   * Apply the user's channel choice. The GitHub provider publishes a single `latest.yml`,
   * so a separate `beta` channel file would 404 — `allowPrerelease` is what actually
   * surfaces pre-releases. Read on every call so switching channels needs no restart.
   */
  const applyChannel = (up: any) => {
    up.allowPrerelease = (settingsRepo.get('updates.channel') ?? 'stable') === 'beta'
  }

  // A failed check used to be indistinguishable from "up to date" — the renderer told
  // people they were current when the request had actually died. Report the reason.
  handle<{ available: boolean; version?: string; error?: string }>('updates:check', async () => {
    if (!app.isPackaged) return { available: false, error: 'Update checks are disabled in development builds' }
    const up = getUpdater()
    if (!up) return { available: false, error: 'This build was packaged without the updater' }
    try {
      applyChannel(up)
      const result = await up.checkForUpdates()
      const latestVersion = result?.updateInfo?.version
      const isAvailable = latestVersion && latestVersion !== app.getVersion()
      return { available: !!isAvailable, version: latestVersion }
    } catch (e: any) {
      return { available: false, error: String(e?.message ?? e) }
    }
  })

  const RELEASES_API = 'https://api.github.com/repos/PraneethReddy-github/ternix/releases/tags'
  const notesCache = new Map<string, ReleaseNotes>()

  handle<ReleaseNotes | null>('updates:notes', async (version?: string) => {
    const v = (version || app.getVersion()).replace(/^v/, '')
    const hit = notesCache.get(v)
    if (hit) return hit
    // Releases are tagged v1.2.0 here, but accept a bare tag too so a retag doesn't break this.
    for (const tag of [`v${v}`, v]) {
      try {
        const res = await fetch(`${RELEASES_API}/${tag}`, {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Ternix' }
        })
        if (!res.ok) continue
        const r: any = await res.json()
        if (r && r.body && r.body.trim()) {
          const notes: ReleaseNotes = {
            version: v,
            name: r.name || tag,
            body: r.body,
            publishedAt: r.published_at ?? null,
            url: r.html_url ?? ''
          }
          notesCache.set(v, notes)
          return notes
        }
      } catch {
        /* offline or rate-limited — fall through, and don't cache the failure */
      }
    }

    // Fallback to local RELEASE_NOTES.md if GitHub API body is empty, offline, or rate-limited
    try {
      const fs = await import('fs')
      const path = await import('path')
      const localPath = path.join(app.getAppPath(), 'RELEASE_NOTES.md')
      if (fs.existsSync(localPath)) {
        const body = fs.readFileSync(localPath, 'utf8')
        const notes: ReleaseNotes = {
          version: v,
          name: `v${v}`,
          body,
          publishedAt: null,
          url: `https://github.com/PraneethReddy-github/ternix/releases/tag/v${v}`
        }
        return notes
      }
    } catch {
      /* ignore */
    }

    return null
  })

  handle<void>('updates:download', async () => {
    const up = getUpdater()
    if (!up) return
    applyChannel(up)
    await up.downloadUpdate()
  })

  on('updates:install', () => {
    const up = getUpdater()
    if (up) up.quitAndInstall()
  })
}
