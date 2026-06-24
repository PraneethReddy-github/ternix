import { useEffect, useRef } from 'react'
import { useTabStore } from '@/store/useTabStore'
import { useStatsStore } from '@/store/useStatsStore'

const POLL_MS = 3000

/**
 * Renderless component — always mounted in RootLayout.
 * Polls stats every 3 s regardless of which sidebar view is open.
 * Resets history when the active SSH session changes.
 */
export function StatsPoller() {
  // The active connected SSH pane id, or null for local
  const sshTabId = useTabStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    return tab?.panes.find((p) => p.protocol === 'ssh' && p.state === 'connected')?.id ?? null
  })

  const fetchingRef = useRef(false)

  // Reset history whenever the session changes (tab switch, new connection, disconnect)
  useEffect(() => {
    useStatsStore.getState().resetForTab(sshTabId)
  }, [sshTabId])

  // Polling loop
  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      if (fetchingRef.current) return        // don't stack up fetches
      fetchingRef.current = true
      try {
        const s = await (window as any).ternix.stats.fetch(sshTabId)
        if (!cancelled) {
          useStatsStore.getState().setLatest(s, sshTabId)
        }
      } catch {
        // silently ignore — status bar just shows last good values
      } finally {
        fetchingRef.current = false
      }
    }

    // Fetch immediately on mount/tab change
    poll()
    const id = setInterval(poll, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [sshTabId])

  return null
}
