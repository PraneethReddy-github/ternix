import { create } from 'zustand'
import type { TransferProgress } from '@shared/index'

interface TransferState {
  transfers: Record<string, TransferProgress>
  subscribed: boolean
  speed: number
  subscribe: () => void
  upsert: (p: TransferProgress) => void
  clearCompleted: () => void
  active: () => TransferProgress[]
  totalSpeed: () => number
}

/**
 * Aggregate throughput is measured from the total bytes moved, not by adding up the per-file
 * rates. Those samples overlap (maxConcurrent files share one SSH channel, so each one's
 * bursts read as near-link-speed) and a file that finishes inside a single sample window
 * never reports a rate of its own — summing them over-reported by roughly maxConcurrent×.
 */
const SAMPLE_MS = 500
let sampledAt = Date.now()
let sampledBytes = 0

const bytesMoved = (transfers: Record<string, TransferProgress>): number =>
  Object.values(transfers).reduce((n, t) => n + t.transferred, 0)

export const useTransferStore = create<TransferState>((set, get) => ({
  transfers: {},
  subscribed: false,
  speed: 0,

  subscribe: () => {
    if (get().subscribed) return
    window.ternix.sftp.onProgress((p) => get().upsert(p))
    set({ subscribed: true })
  },

  upsert: (p) =>
    set((s) => {
      const transfers = { ...s.transfers, [p.transferId]: p }
      const now = Date.now()
      const window = now - sampledAt
      if (window < SAMPLE_MS) return { transfers }
      const bytes = bytesMoved(transfers)
      // A long gap means the queue sat idle between batches; fewer bytes than last time means
      // clearCompleted dropped finished rows. Either way, start a fresh window rather than
      // folding the idle time (or a negative delta) into the rate.
      const stale = window > 4 * SAMPLE_MS || bytes < sampledBytes
      const speed = stale ? 0 : Math.round(((bytes - sampledBytes) * 1000) / window)
      sampledAt = now
      sampledBytes = bytes
      return { transfers, speed }
    }),

  clearCompleted: () =>
    set((s) => ({
      transfers: Object.fromEntries(
        Object.entries(s.transfers).filter(([, t]) => !['done', 'cancelled', 'error'].includes(t.status))
      )
    })),

  active: () => Object.values(get().transfers),
  // Nothing moving means no progress events arrive, so nothing would re-sample the rate and
  // the last measurement would sit in the status bar forever.
  totalSpeed: () => (Object.values(get().transfers).some((t) => t.status === 'active') ? get().speed : 0)
}))
