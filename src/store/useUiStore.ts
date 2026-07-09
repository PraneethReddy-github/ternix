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

/** A queued dialog plus a stable id, so chained dialogs get fresh component state. */
export type OpenDialog = DialogKind & { _id: number }

/** Mirrors the SECTIONS list in SettingsPanel; kept here so the store can address a section. */
export type SettingsSection =
  | 'general' | 'terminal' | 'appearance' | 'ssh' | 'security'
  | 'keyboard' | 'transfers' | 'updates' | 'advanced'

interface UiState {
  activeView: ActivityView
  settingsSection: SettingsSection
  sidebarCollapsed: boolean
  paletteOpen: boolean
  sftpOpen: boolean
  dialogs: OpenDialog[]
  toast: { id: number; message: string; type: 'info' | 'error' | 'success'; action?: { label: string; onClick: () => void } } | null

  setView: (v: ActivityView) => void
  openSettings: (section: SettingsSection) => void
  toggleSidebar: () => void
  setPaletteOpen: (open: boolean) => void
  toggleSftp: () => void
  openDialog: (d: DialogKind) => void
  closeDialog: () => void
  notify: (message: string, type?: 'info' | 'error' | 'success', action?: { label: string; onClick: () => void }) => void
  dismissToast: () => void
}

let toastId = 0
let dialogId = 0

export const useUiStore = create<UiState>((set) => ({
  activeView: 'sessions',
  settingsSection: 'general',
  sidebarCollapsed: false,
  paletteOpen: false,
  sftpOpen: false,
  dialogs: [],
  toast: null,

  setView: (activeView) => set({ activeView, sidebarCollapsed: false }),
  openSettings: (settingsSection) => set({ activeView: 'settings', settingsSection, sidebarCollapsed: false }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  toggleSftp: () => set((s) => ({ sftpOpen: !s.sftpOpen })),
  openDialog: (dialog) => set((s) => ({ dialogs: [...s.dialogs, { ...dialog, _id: ++dialogId }] })),
  closeDialog: () => set((s) => ({ dialogs: s.dialogs.slice(0, -1) })),
  // The 4s dismissal lives in <Toast>, which pauses it while the pointer is over the toast.
  notify: (message, type = 'info', action) => set({ toast: { id: ++toastId, message, type, action } }),
  dismissToast: () => set({ toast: null })
}))
