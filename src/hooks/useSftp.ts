import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [retryCount, setRetryCount] = useState(0)
  const cancelRef = useRef(false)

  // Returns true if the directory listed successfully, so callers can fall back.
  const list = useCallback(
    async (p: string): Promise<boolean> => {
      if (side === 'remote' && !tabId) return false
      setLoading(true)
      setError(null)
      try {
        const items =
          side === 'local'
            ? await window.ternix.localfs.listDir(p)
            : await window.ternix.sftp.listDir(tabId!, p)
        items.sort((a, b) =>
          a.type === 'directory' && b.type !== 'directory'
            ? -1
            : a.type !== 'directory' && b.type === 'directory'
              ? 1
              : a.name.localeCompare(b.name)
        )
        setEntries(items)
        setPath(p)
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
  // Reruns when tabId changes OR user hits Retry (retryCount bumps).
  useEffect(() => {
    cancelRef.current = false

    ;(async () => {
      if (side === 'local') {
        const stored = useSftpStore.getState().localPath
        const home = await window.ternix.localfs.home()
        if (cancelRef.current) return
        if (!stored || !(await list(stored))) await list(home)
      } else if (tabId) {
        setLoading(true)
        setError(null)
        try {
          // Open the remote SFTP subsystem.
          // On some systems/Windows this can take a moment — we give it 12 s.
          await window.ternix.sftp.open(tabId)
          if (cancelRef.current) return

          // Resolve the remote home dir — retry a couple of times with a short
          // delay in case the subsystem channel isn't ready immediately.
          let home: string | null = null
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              home = await window.ternix.sftp.realpath(tabId, '.')
              break
            } catch {
              if (attempt < 2) await new Promise((r) => setTimeout(r, 400))
            }
          }
          if (cancelRef.current) return

          if (home == null) {
            setError('Could not resolve remote home directory.\nThe server may not support SFTP.')
            setLoading(false)
            return
          }

          const stored = useSftpStore.getState().remotePaths[tabId]
          if (!stored || !(await list(stored))) await list(home)
        } catch (e: any) {
          if (!cancelRef.current) {
            setError(`SFTP: ${e.message}`)
            setLoading(false)
          }
        }
      }
    })()

    return () => {
      cancelRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, tabId, retryCount])

  const visible = showHidden ? entries : entries.filter((e) => !e.name.startsWith('.'))
  const refresh = () => list(path)
  const retry = () => {
    setError(null)
    setEntries([])
    setPath('')
    setRetryCount((n) => n + 1)
  }

  const up = () => {
    if (side === 'remote') {
      // Remote paths are always POSIX (Linux server)
      const parent = path.replace(/\/[^/]+\/?$/, '') || '/'
      list(parent)
    } else {
      // Local paths: handle Windows backslash AND POSIX forward slash
      const isWin = path.includes('\\')
      if (isWin) {
        const trimmed = path.replace(/[/\\]+$/, '')
        const lastSep = trimmed.lastIndexOf('\\')
        // Don't go above drive root (e.g. C:\)
        if (lastSep <= 2) {
          list(trimmed.slice(0, 3) || path)
        } else {
          list(trimmed.slice(0, lastSep))
        }
      } else {
        const parent = path.replace(/\/[^/]+\/?$/, '') || '/'
        list(parent)
      }
    }
  }

  return { path, entries: visible, loading, error, showHidden, setShowHidden, list, refresh, up, retry }
}
