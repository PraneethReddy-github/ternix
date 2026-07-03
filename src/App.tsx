import { useEffect } from 'react'
import { RootLayout } from '@/components/layout/RootLayout'
import { useSessionStore } from '@/store/useSessionStore'
import { useThemeStore } from '@/store/useThemeStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTransferStore } from '@/store/useTransferStore'
import { useTabStore } from '@/store/useTabStore'
import { useUiStore } from '@/store/useUiStore'
import { connectSession } from '@/components/sidebar/SessionCard'

export default function App() {
  const loadSessions = useSessionStore((s) => s.load)
  const loadTheme = useThemeStore((s) => s.load)
  const loadSettings = useSettingsStore((s) => s.load)
  const subscribeTransfers = useTransferStore((s) => s.subscribe)
  const customCss = useSettingsStore((s) => s.get('appearance.customCss'))

  // Inject user Custom CSS into the app chrome (CSP allows inline styles).
  useEffect(() => {
    let el = document.getElementById('tx-custom-css') as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = 'tx-custom-css'
      document.head.appendChild(el)
    }
    el.textContent = customCss
  }, [customCss])

  // Keep the vault's idle auto-lock a true idle timer: reset it on user activity
  // (throttled). No-op in keychain mode / when auto-lock is off.
  useEffect(() => {
    let lastPing = 0
    const ping = () => {
      const now = Date.now()
      if (now - lastPing < 30_000) return
      lastPing = now
      window.ternix.vault.activity()
    }
    window.addEventListener('mousedown', ping)
    window.addEventListener('keydown', ping)
    return () => {
      window.removeEventListener('mousedown', ping)
      window.removeEventListener('keydown', ping)
    }
  }, [])

  // Persist open tabs so "Reopen last sessions" startup can restore them.
  useEffect(() => {
    let last = ''
    return useTabStore.subscribe((state) => {
      const snap = JSON.stringify(
        state.tabs.map((t) => {
          const p = t.panes.find((x) => x.id === t.activePaneId) ?? t.panes[0]
          return { sessionId: p?.sessionId ?? null, protocol: p?.protocol ?? 'local', title: t.title }
        })
      )
      if (snap === last) return
      last = snap
      window.ternix.settings.set('general.lastTabs', snap)
    })
  }, [])

  useEffect(() => {
    (async () => {
      await loadSettings()
      await loadTheme()
      await loadSessions()
      subscribeTransfers()

      // Startup behavior.
      const openBlank = () => {
        if (useTabStore.getState().tabs.length === 0) useTabStore.getState().newTab({ protocol: 'local', title: 'Local Shell' })
      }
      const behavior = useSettingsStore.getState().get('general.startupBehavior')
      if (behavior === 'reopen') {
        let opened = 0
        try {
          const saved = JSON.parse(useSettingsStore.getState().get('general.lastTabs') || '[]') as { sessionId: number | null; protocol: string; title: string }[]
          const sessions = useSessionStore.getState().sessions
          for (const t of saved) {
            if (t.sessionId != null) {
              const s = sessions.find((x) => x.id === t.sessionId)
              if (s) { connectSession(s, useTabStore); opened++ }
            } else if (t.protocol === 'local') {
              useTabStore.getState().newTab({ protocol: 'local', title: t.title || 'Local Shell' }); opened++
            }
          }
        } catch { /* corrupt snapshot → fall through to blank */ }
        if (opened === 0) openBlank()
      } else if (behavior === 'picker') {
        useUiStore.getState().setPaletteOpen(true) // command palette lists saved sessions
      } else {
        openBlank()
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
