import { useCallback, useEffect, useState } from 'react'
import type { SftpEntry } from '@shared/index'

type Side = 'local' | 'remote'

/** Drives one side (local or remote) of the SFTP dual-pane manager. */
export function usePane(side: Side, tabId: string | null) {
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)

  const list = useCallback(
    async (p: string) => {
      if (side === 'remote' && !tabId) return
      setLoading(true)
      setError(null)
      try {
        const items = side === 'local' ? await window.ternix.localfs.listDir(p) : await window.ternix.sftp.listDir(tabId!, p)
        items.sort((a, b) => (a.type === 'directory' && b.type !== 'directory' ? -1 : a.type !== 'directory' && b.type === 'directory' ? 1 : a.name.localeCompare(b.name)))
        setEntries(items)
        setPath(p)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    },
    [side, tabId]
  )

  // Initial path.
  useEffect(() => {
    (async () => {
      if (side === 'local') {
        const home = await window.ternix.localfs.home()
        list(home)
      } else if (tabId) {
        try {
          await window.ternix.sftp.open(tabId)
          const home = await window.ternix.sftp.realpath(tabId, '.')
          list(home)
        } catch (e: any) {
          setError(e.message)
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, tabId])

  const visible = showHidden ? entries : entries.filter((e) => !e.name.startsWith('.'))
  const refresh = () => list(path)
  const up = () => {
    const parent = path.replace(/\/[^/]+\/?$/, '') || '/'
    list(parent)
  }

  return { path, entries: visible, loading, error, showHidden, setShowHidden, list, refresh, up }
}
