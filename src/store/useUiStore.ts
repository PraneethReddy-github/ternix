import { create } from 'zustand'
import type { ActivityView } from '@shared/ui'
import type { Session } from '@shared/index'

export type DialogKind =
  | { kind: 'newSession'; session?: Session; groupId?: number | null; duplicate?: boolean }
  | { kind: 'keyVault' }
  | { kind: 'tunnels'; sessionId: number }
  | { kind: 'snippet'; id?: number }
  | { kind: 'themeEditor'; baseId?: string }
  | { kind: 'exportImport' }
  | { kind: 'connectionLog'; sessionId?: number }
  | { kind: 'confirm'; title: string; message: string; danger?: boolean; onConfirm: () => void; onCancel?: () => void }
  | { kind: 'prompt'; title: string; label?: string; defaultValue?: string; password?: boolean; onSubmit: (val: string) => void }

interface UiState {
  activeView: ActivityView
  sidebarCollapsed: boolean
  paletteOpen: boolean
  sftpOpen: boolean
  dialogs: DialogKind[]
  toast: { id: number; message: string; type: 'info' | 'error' | 'success' } | null

  setView: (v: ActivityView) => void
  toggleSidebar: () => void
  setPaletteOpen: (open: boolean) => void
  toggleSftp: () => void
  openDialog: (d: DialogKind) => void
  closeDialog: () => void
  notify: (message: string, type?: 'info' | 'error' | 'success') => void
}

let toastId = 0

export const useUiStore = create<UiState>((set) => ({
  activeView: 'sessions',
  sidebarCollapsed: false,
  paletteOpen: false,
  sftpOpen: false,
  dialogs: [],
  toast: null,

  setView: (activeView) => set({ activeView, sidebarCollapsed: false }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  toggleSftp: () => set((s) => ({ sftpOpen: !s.sftpOpen })),
  openDialog: (dialog) => set((s) => ({ dialogs: [...s.dialogs, dialog] })),
  closeDialog: () => set((s) => ({ dialogs: s.dialogs.slice(0, -1) })),
  notify: (message, type = 'info') => {
    const id = ++toastId
    set({ toast: { id, message, type } })
    setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : {})), 4000)
  }
}))
