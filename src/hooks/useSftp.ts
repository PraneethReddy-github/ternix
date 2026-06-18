import { useCallback, useEffect, useState } from 'react'
import type { SftpEntry } from '@shared/index'
import { useSftpStore } from '@/store/useSftpStore'

type Side = 'local' | 'remote'

/** Drives one side (local or remote) of the SFTP dual-pane manager. */
export function usePane(side: Side, tabId: string | null) {
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)

  // Returns true if the directory listed successfully, so callers can fall back.
  const list = useCallback(
    async (p: string): Promise<boolean> => {
      if (side === 'remote' && !tabId) return false
      setLoading(true)
      setError(null)
      try {
        const items = side === 'local' ? await window.ternix.localfs.listDir(p) : await window.ternix.sftp.listDir(tabId!, p)
        items.sort((a, b) => (a.type === 'directory' && b.type !== 'directory' ? -1 : a.type !== 'directory' && b.type === 'directory' ? 1 : a.name.localeCompare(b.name)))
        setEntries(items)
        setPath(p)
        // Remember where we are so switching tabs and returning restores it.
        if (side === 'local') useSftpStore.getState().setLocalPath(p)
        else if (tabId) useSftpStore.getState().setRemotePath(tabId, p)
        return true
      } catch (e: any) {
        setError(e.message)
        return false
      } finally {
        setLoading(false)
      }
    },
    [side, tabId]
  )

  // Initial path — restore the last-visited folder, falling back to home.
  useEffect(() => {
    (async () => {
      if (side === 'local') {
        const stored = useSftpStore.getState().localPath
        const home = await window.ternix.localfs.home()
        if (!stored || !(await list(stored))) await list(home)
      } else if (tabId) {
        try {
          await window.ternix.sftp.open(tabId)
          const stored = useSftpStore.getState().remotePaths[tabId]
          if (!stored || !(await list(stored))) {
            const home = await window.ternix.sftp.realpath(tabId, '.')
            await list(home)
          }
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
