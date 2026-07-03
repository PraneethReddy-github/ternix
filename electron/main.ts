import { app, BrowserWindow, session as electronSession, powerMonitor } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { DatabaseService } from './services/DatabaseService'
import { CryptoService } from './services/CryptoService'
import { ConnectionManager } from './services/ConnectionManager'
import { VncBridgeService } from './services/VncBridgeService'
import { RdpGatewayService } from './services/RdpGatewayService'
import { Bus } from './services/bus'
import { settingsRepo } from './db/repo'
import { registerAllIpc } from './ipc'

const __dirname = dirname(fileURLToPath(import.meta.url))

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
}

let mainWindow: BrowserWindow | null = null
const getWindow = () => mainWindow

function createWindow(): void {
  mainWindow = new BrowserWindow({
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

  Bus.setWindow(mainWindow)

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('maximize', () => Bus.emit('window:maximize-change', true))
  mainWindow.on('unmaximize', () => Bus.emit('window:maximize-change', false))
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Ctrl+Shift+I opens DevTools (handy for debugging on Windows).
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'I' && input.control && input.shift) {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  // Block navigation away from the app and external window opens.
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
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

app.whenReady().then(() => {
  // Initialize storage + crypto before any IPC can touch the vault.
  DatabaseService.init()
  CryptoService.init()
  CryptoService.setOnLocked(() => Bus.emit('vault:locked'))
  const lockTimeout = Number(settingsRepo.get('security.vaultLockTimeout') ?? '0')
  if (lockTimeout > 0) CryptoService.setLockTimeout(lockTimeout)

  // Auto-lock on system sleep.
  powerMonitor.on('suspend', () => {
    if (settingsRepo.get('security.lockOnSleep') === 'true') CryptoService.lock()
  })

  applyCsp()
  registerAllIpc(getWindow)
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
