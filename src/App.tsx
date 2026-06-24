import { useEffect } from 'react'
import { RootLayout } from '@/components/layout/RootLayout'
import { useSessionStore } from '@/store/useSessionStore'
import { useThemeStore } from '@/store/useThemeStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTransferStore } from '@/store/useTransferStore'
import { useTabStore } from '@/store/useTabStore'
import { useUiStore } from '@/store/useUiStore'

export default function App() {
  const loadSessions = useSessionStore((s) => s.load)
  const loadTheme = useThemeStore((s) => s.load)
  const loadSettings = useSettingsStore((s) => s.load)
  const subscribeTransfers = useTransferStore((s) => s.subscribe)

  useEffect(() => {
    (async () => {
      await loadSettings()
      await loadTheme()
      await loadSessions()
      subscribeTransfers()

      // Startup behavior.
      const behavior = useSettingsStore.getState().get('general.startupBehavior')
      if (behavior === 'blank') {
        if (useTabStore.getState().tabs.length === 0) useTabStore.getState().newTab({ protocol: 'local', title: 'Local Shell' })
      }

      // Auto update check
      if (useSettingsStore.getState().getBool('updates.autoCheck')) {
        window.ternix.updates.check().then((res) => {
          if (res.available) {
            useUiStore.getState().notify(`Update v${res.version} is available! Check Settings.`, 'info')
          }
        }).catch(() => {})
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <RootLayout />
}
