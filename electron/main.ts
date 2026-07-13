import { app, BrowserWindow, session as electronSession, powerMonitor } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import type { TearoffPayload } from '@shared/ui'
import { DatabaseService } from './services/DatabaseService'
import { CryptoService } from './services/CryptoService'
import { ConnectionManager } from './services/ConnectionManager'
import { RecordingService } from './services/RecordingService'
import { SftpService } from './services/SftpService'
import { TunnelService } from './services/TunnelService'
import { VncBridgeService } from './services/VncBridgeService'
import { RdpGatewayService } from './services/RdpGatewayService'
import { Bus } from './services/bus'
import { settingsRepo } from './db/repo'
import { registerAllIpc } from './ipc'
import { handleE, on } from './ipc/util'

const __dirname = dirname(fileURLToPath(import.meta.url))

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
}

/** Tab payloads for freshly torn-off windows, keyed by the new window's webContents id. */
const pendingTearoffs = new Map<number, TearoffPayload>()

function createWindow(tearoff?: TearoffPayload): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    icon: join(__dirname, '../../resources/icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox: false is safe with contextIsolation: true + preload bridge.
      // sandbox: true on Windows can block IPC channels used by SFTP.
      sandbox: false,
      webviewTag: false,
      spellcheck: false
    }
  })

  const wcId = win.webContents.id
  if (tearoff) pendingTearoffs.set(wcId, tearoff)

  win.on('ready-to-show', () => win.show())
  // Maximize state is per-window, so send it to this window only (not the Bus broadcast).
  win.on('maximize', () => win.webContents.send('window:maximize-change', true))
  win.on('unmaximize', () => win.webContents.send('window:maximize-change', false))
  win.on('closed', () => {
    pendingTearoffs.delete(wcId)
    // Kill the connections this window owned — a renderer teardown never reaches
    // the per-pane kill IPC when the whole window goes away.
    for (const paneId of ConnectionManager.idsOwnedBy(wcId)) {
      RecordingService.stop(paneId)
      SftpService.close(paneId)
      TunnelService.stopForTab(paneId)
      ConnectionManager.kill(paneId)
    }
  })

  // Ctrl+Shift+I opens DevTools (handy for debugging on Windows).
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'I' && input.control && input.shift) {
      win.webContents.toggleDevTools()
    }
  })

  // Block navigation away from the app and external window opens.
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Tab tear-off: a renderer asks for a new window to adopt one of its tabs. */
function registerWindowIpc(): void {
  on('window:openTab', (payload: TearoffPayload) => createWindow(payload))
  handleE<TearoffPayload | null>('window:getTearoffTab', (e) => {
    const payload = pendingTearoffs.get(e.sender.id) ?? null
    pendingTearoffs.delete(e.sender.id)
    return payload
  })
}

function applyCsp(): void {
  const isDev = !!process.env.ELECTRON_RENDERER_URL
  const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self'"

  electronSession.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; object-src 'none'; base-uri 'none'`
        ]
      }
    })
  })
}

app.whenReady().then(async () => {
  // Initialize storage + crypto before any IPC can touch the vault. The vault key may
  // come from the OS keychain, which is async, so nothing may run before it resolves.
  DatabaseService.init()
  await CryptoService.init()
  CryptoService.setOnLocked(() => Bus.emit('vault:locked'))
  const lockTimeout = Number(settingsRepo.get('security.vaultLockTimeout') ?? '0')
  if (lockTimeout > 0) CryptoService.setLockTimeout(lockTimeout)

  // Auto-lock on system sleep.
  powerMonitor.on('suspend', () => {
    if (settingsRepo.get('security.lockOnSleep') === 'true') CryptoService.lock()
  })

  applyCsp()
  registerAllIpc()
  registerWindowIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  ConnectionManager.killAll()
  VncBridgeService.closeAll()
  RdpGatewayService.closeAll()
  DatabaseService.close()
})
