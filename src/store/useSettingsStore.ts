import { create } from 'zustand'
import type { SettingsMap } from '@shared/ui'

/** Sensible defaults applied when a key is absent from the DB. */
export const SETTING_DEFAULTS: SettingsMap = {
  'general.defaultShell': '',
  'general.startupBehavior': 'blank',
  'general.newTabProtocol': 'local',
  'general.confirmCloseActive': 'true',
  'general.autoReconnect': 'false',
  'general.autoReconnectRetries': '3',
  'general.autoReconnectDelay': '3',
  'terminal.scrollback': '5000',
  'terminal.bell': 'none',
  'terminal.wordSeparators': ' ()[]{}\'"`',
  'terminal.copyOnSelect': 'false',
  'terminal.pasteOnMiddleClick': 'true',
  'terminal.pasteConfirmMultiline': 'true',
  'terminal.trimPasteWhitespace': 'false',
  'terminal.rightClick': 'menu',
  'appearance.theme': 'dark-default',
  'appearance.fontFamily': "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
  'appearance.fontSize': '14',
  'appearance.ligatures': 'true',
  'appearance.lineHeight': '1.2',
  'appearance.letterSpacing': '0',
  'appearance.cursorStyle': 'block',
  'appearance.cursorBlink': 'true',
  'appearance.transparency': '0',
  'appearance.compactMode': 'false',
  'appearance.showClock': 'false',
  'appearance.customCss': '',
  'ssh.defaultPort': '22',
  'ssh.defaultUsername': '',
  'ssh.agentSock': '',
  'ssh.hostKeyStrictness': 'prompt',
  'ssh.connectTimeout': '20000',
  'ssh.showBanner': 'true',
  'security.vaultLockTimeout': '0',
  'security.lockOnSleep': 'false',
  'security.clearClipboard': '0',
  'transfer.downloadDir': '',
  'transfer.conflict': 'prompt',
  'transfer.maxConcurrent': '3',
  'transfer.preserveTimestamps': 'true',
  'updates.autoCheck': 'true',
  'updates.channel': 'stable',
  'advanced.hardwareAcceleration': 'true',
  'advanced.rendererType': 'webgl',
  'advanced.debugLogLevel': 'info',
  'rdp.guacdHost': '127.0.0.1',
  'rdp.guacdPort': '4822',
  'recording.autoRecord': 'false',
  'recording.maxStorageMb': '0'
}

interface SettingsState {
  values: SettingsMap
  load: () => Promise<void>
  get: (key: string) => string
  getBool: (key: string) => boolean
  getNum: (key: string) => number
  set: (key: string, value: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  values: { ...SETTING_DEFAULTS },

  load: async () => {
    const stored = await window.ternix.settings.getAll()
    set({ values: { ...SETTING_DEFAULTS, ...stored } })
  },

  get: (key) => get().values[key] ?? SETTING_DEFAULTS[key] ?? '',
  getBool: (key) => get().get(key) === 'true',
  getNum: (key) => Number(get().get(key)) || 0,

  set: async (key, value) => {
    set((s) => ({ values: { ...s.values, [key]: value } }))
    await window.ternix.settings.set(key, value)
  }
}))
