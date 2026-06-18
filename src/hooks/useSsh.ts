import { useCallback } from 'react'
import type { Session } from '@shared/index'
import { useTabStore } from '@/store/useTabStore'

/**
 * Convenience hook for opening/closing SSH (and any-protocol) sessions as tabs.
 * The actual transport lives in the main process; this only drives tab lifecycle.
 */
export function useSsh() {
  const newTab = useTabStore((s) => s.newTab)
  const closePane = useTabStore((s) => s.closePane)

  const connect = useCallback(
    (session: Session) =>
      newTab({ sessionId: session.id, protocol: session.protocol, title: session.name, host: session.host, color: session.color }),
    [newTab]
  )

  const disconnect = useCallback(
    (tabId: string, paneId: string) => closePane(tabId, paneId),
    [closePane]
  )

  return { connect, disconnect }
}
