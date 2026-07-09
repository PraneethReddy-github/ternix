import { useEffect, useRef } from 'react'
import { useTabStore } from '@/store/useTabStore'
import { useStatsStore } from '@/store/useStatsStore'
import { activePanes, statsTargetFor } from '@/utils/statsTarget'

const POLL_MS = 3000

/**
 * Renderless component — always mounted in RootLayout.
 * Polls stats every 3 s regardless of which sidebar view is open.
 * Resets history when the active session changes.
 */
export function StatsPoller() {
  // Both selectors return primitives so they stay referentially stable across renders.
  const kind = useTabStore((s) => statsTargetFor(activePanes(s)).kind)
  const tabId = useTabStore((s) => {
    const t = statsTargetFor(activePanes(s))
    return t.kind === 'remote' ? t.tabId : null
  })

  const fetchingRef = useRef(false)

  // Reset history whenever the session changes (tab switch, new connection, disconnect)
  useEffect(() => {
    useStatsStore.getState().resetForTab(tabId)
  }, [kind, tabId])

  // Polling loop
  useEffect(() => {
    // The session hasn't connected yet. Polling here would fetch the local machine and
    // pass it off as the server's, so we poll nothing and let the panel show its spinner.
    if (kind === 'pending') return

    let cancelled = false

    const poll = async () => {
      if (fetchingRef.current) return        // don't stack up fetches
      fetchingRef.current = true
      try {
        const s = await (window as any).ternix.stats.fetch(tabId)
        if (!cancelled) {
          useStatsStore.getState().setLatest(s, tabId)
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
  }, [kind, tabId])

  return null
}
