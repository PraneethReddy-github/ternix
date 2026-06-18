import { create } from 'zustand'

/**
 * Remembers the last-visited SFTP directory so the dual-pane manager doesn't
 * reset to the default folder when the user switches tabs and comes back.
 *
 * The local side has a single shared path. The remote side is keyed by the SSH
 * pane id (the same value used as `tabId` for SFTP IPC), so every connection
 * keeps its own working directory.
 */
interface SftpPathState {
  localPath: string | null
  remotePaths: Record<string, string>
  setLocalPath: (path: string) => void
  setRemotePath: (tabId: string, path: string) => void
  clearRemotePath: (tabId: string) => void
}

export const useSftpStore = create<SftpPathState>((set) => ({
  localPath: null,
  remotePaths: {},
  setLocalPath: (localPath) => set({ localPath }),
  setRemotePath: (tabId, path) => set((s) => ({ remotePaths: { ...s.remotePaths, [tabId]: path } })),
  clearRemotePath: (tabId) =>
    set((s) => {
      if (!(tabId in s.remotePaths)) return {}
      const remotePaths = { ...s.remotePaths }
      delete remotePaths[tabId]
      return { remotePaths }
    })
}))
