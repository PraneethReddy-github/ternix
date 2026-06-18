import { create } from 'zustand'
import type { TransferProgress } from '@shared/index'

interface TransferState {
  transfers: Record<string, TransferProgress>
  subscribed: boolean
  subscribe: () => void
  upsert: (p: TransferProgress) => void
  clearCompleted: () => void
  active: () => TransferProgress[]
  totalSpeed: () => number
}

export const useTransferStore = create<TransferState>((set, get) => ({
  transfers: {},
  subscribed: false,

  subscribe: () => {
    if (get().subscribed) return
    window.ternix.sftp.onProgress((p) => get().upsert(p))
    set({ subscribed: true })
  },

  upsert: (p) => set((s) => ({ transfers: { ...s.transfers, [p.transferId]: p } })),

  clearCompleted: () =>
    set((s) => ({
      transfers: Object.fromEntries(
        Object.entries(s.transfers).filter(([, t]) => !['done', 'cancelled', 'error'].includes(t.status))
      )
    })),

  active: () => Object.values(get().transfers),
  totalSpeed: () =>
    Object.values(get().transfers)
      .filter((t) => t.status === 'active')
      .reduce((sum, t) => sum + t.bytesPerSecond, 0)
}))
