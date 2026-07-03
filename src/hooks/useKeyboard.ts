import { useEffect } from 'react'
import { useTabStore } from '@/store/useTabStore'
import { useUiStore } from '@/store/useUiStore'
import { useSettingsStore } from '@/store/useSettingsStore'

export interface KeyBinding {
  action: string
  label: string
  combo: string // normalized: "ctrl+shift+n"
}

/** Default keybindings (see terminal.md §18). Stored overrides live in settings['keybindings']. */
export const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  { action: 'tab.newLocal', label: 'New tab (local shell)', combo: 'ctrl+t' },
  { action: 'tab.newSsh', label: 'New SSH session', combo: 'ctrl+shift+n' },
  { action: 'tab.close', label: 'Close tab', combo: 'ctrl+w' },
  { action: 'tab.next', label: 'Next tab', combo: 'ctrl+tab' },
  { action: 'tab.prev', label: 'Previous tab', combo: 'ctrl+shift+tab' },
  { action: 'pane.splitRight', label: 'Split right', combo: 'ctrl+shift+d' },
  { action: 'pane.splitDown', label: 'Split down', combo: 'ctrl+shift+e' },
  { action: 'ui.toggleSidebar', label: 'Toggle sidebar', combo: 'ctrl+b' },
  { action: 'ui.commandPalette', label: 'Command palette', combo: 'ctrl+p' },
  { action: 'terminal.find', label: 'Find in terminal', combo: 'ctrl+f' },
  { action: 'ui.toggleSftp', label: 'Toggle SFTP panel', combo: 'ctrl+shift+f' },
  { action: 'terminal.broadcast', label: 'Toggle broadcast', combo: 'ctrl+shift+b' },
  { action: 'font.increase', label: 'Increase font size', combo: 'ctrl+=' },
  { action: 'font.decrease', label: 'Decrease font size', combo: 'ctrl+-' },
  { action: 'font.reset', label: 'Reset font size', combo: 'ctrl+0' },
  { action: 'terminal.clear', label: 'Clear terminal', combo: 'ctrl+l' },
  { action: 'session.disconnect', label: 'Disconnect', combo: 'ctrl+shift+q' },
  { action: 'terminal.record', label: 'Toggle recording', combo: 'ctrl+shift+r' },
  { action: 'ui.keyVault', label: 'Open key vault', combo: 'ctrl+shift+k' },
  { action: 'ui.settings', label: 'Open settings', combo: 'ctrl+,' },
  { action: 'ui.fullscreen', label: 'Full screen', combo: 'f11' }
]

function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  let key = e.key.toLowerCase()
  if (key === ' ') key = 'space'
  parts.push(key)
  return parts.join('+')
}

import { paneActions } from './terminalRegistry'

export function loadKeybindings(): KeyBinding[] {
  const raw = useSettingsStore.getState().get('keybindings')
  if (!raw) return DEFAULT_KEYBINDINGS
  try {
    const overrides = JSON.parse(raw) as Record<string, string>
    return DEFAULT_KEYBINDINGS.map((b) => (overrides[b.action] ? { ...b, combo: overrides[b.action] } : b))
  } catch {
    return DEFAULT_KEYBINDINGS
  }
}

/** Registers the global hotkey handler. `onAction` lets the host run terminal-scoped actions. */
export function useKeyboard(onAction: (action: string) => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs (except the palette/global combos handled below).
      // xterm's hidden textarea (.xterm-helper-textarea) is NOT a real text field —
      // treating it as "typing" suppressed nearly every shortcut while the terminal
      // was focused (i.e. almost always). Exclude it so terminal-scoped shortcuts work.
      const target = e.target as HTMLElement
      const inTerminal = target?.classList?.contains('xterm-helper-textarea')
      const typing = !inTerminal && (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA')
      const combo = comboFromEvent(e)
      const bindings = loadKeybindings()

      // Auto-focus terminal if typing while focus is lost (e.g. on body)
      if (!typing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const activePaneId = useTabStore.getState().getActivePane()?.id
        if (activePaneId) {
          paneActions(activePaneId)?.focus()
        }
      }

      // Ctrl+1..9 → go to tab N.
      if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
        e.preventDefault()
        useTabStore.getState().goToTab(parseInt(e.key, 10) - 1)
        return
      }

      const binding = bindings.find((b) => b.combo === combo)
      if (!binding) return
      // Allow palette + sidebar toggles even while typing; block terminal actions.
      if (typing && !['ui.commandPalette', 'ui.toggleSidebar', 'ui.settings'].includes(binding.action)) return

      e.preventDefault()
      dispatch(binding.action, onAction)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onAction])
}

function dispatch(action: string, onAction: (action: string) => void) {
  const tabs = useTabStore.getState()
  const ui = useUiStore.getState()
  const settings = useSettingsStore.getState()

  switch (action) {
    case 'tab.newLocal':
      tabs.newTab({ protocol: 'local', title: 'Local Shell' })
      break
    case 'tab.newSsh':
      ui.openDialog({ kind: 'newSession' })
      break
    case 'tab.close':
      if (tabs.activeTabId) tabs.closeTab(tabs.activeTabId)
      break
    case 'tab.next':
      tabs.nextTab()
      break
    case 'tab.prev':
      tabs.prevTab()
      break
    case 'pane.splitRight':
      if (tabs.activeTabId) tabs.splitPane(tabs.activeTabId, 'h')
      break
    case 'pane.splitDown':
      if (tabs.activeTabId) tabs.splitPane(tabs.activeTabId, 'v')
      break
    case 'ui.toggleSidebar':
      ui.toggleSidebar()
      break
    case 'ui.commandPalette':
      ui.setPaletteOpen(true)
      break
    case 'ui.toggleSftp':
      ui.toggleSftp()
      break
    case 'ui.keyVault':
      ui.openDialog({ kind: 'keyVault' })
      break
    case 'ui.settings':
      ui.setView('settings')
      break
    case 'ui.fullscreen':
      window.ternix.window.toggleFullscreen()
      break
    case 'terminal.broadcast':
      if (tabs.activeTabId) tabs.toggleBroadcast(tabs.activeTabId)
      break
    case 'font.increase':
      settings.set('appearance.fontSize', String(Math.min(32, settings.getNum('appearance.fontSize') + 1)))
      break
    case 'font.decrease':
      settings.set('appearance.fontSize', String(Math.max(8, settings.getNum('appearance.fontSize') - 1)))
      break
    case 'font.reset':
      settings.set('appearance.fontSize', '14')
      break
    default:
      onAction(action) // terminal-scoped: find, clear, record, disconnect
  }
}
