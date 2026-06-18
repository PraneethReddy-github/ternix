import { useCallback } from 'react'
import { useKeyboard } from './useKeyboard'
import { useTabStore } from '@/store/useTabStore'
import { useUiStore } from '@/store/useUiStore'
import { paneActions } from './terminalRegistry'

/** Bridges global keybindings to terminal-scoped actions on the active pane. */
export function useGlobalShortcuts() {
  const onAction = useCallback((action: string) => {
    const tabs = useTabStore.getState()
    const pane = tabs.getActivePane()
    const ui = useUiStore.getState()

    switch (action) {
      case 'terminal.find':
        paneActions(pane?.id)?.toggleSearch()
        break
      case 'terminal.clear':
        paneActions(pane?.id)?.clear()
        break
      case 'session.disconnect':
        if (pane && tabs.activeTabId) tabs.closePane(tabs.activeTabId, pane.id)
        break
      case 'terminal.record':
        if (pane) {
          if (pane.recording) {
            window.ternix.recordings.stop(pane.id).then(() => tabs.setPaneRecording(pane.id, false))
          } else {
            window.ternix.recordings
              .start(pane.id, pane.sessionId, pane.title)
              .then(() => tabs.setPaneRecording(pane.id, true))
              .catch((e) => ui.notify(e.message, 'error'))
          }
        }
        break
    }
  }, [])

  useKeyboard(onAction)
}
