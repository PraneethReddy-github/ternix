import { create } from 'zustand'
// @ts-expect-error electron/ipc is outside of src/ root
import type { RemoteStats } from '../../../electron/ipc/stats'

interface StatsState {
  latest: RemoteStats | null
  /** tabId that produced `latest` — used to detect session switches */
  sourceTabId: string | null
  cpuHistory: number[]
  rxHistory: number[]
  txHistory: number[]
  prevNet: { rx: number; tx: number } | null
  pollInterval: number   // ms, passed from poller

  setLatest: (s: RemoteStats, tabId: string | null) => void
  resetForTab: (tabId: string | null) => void
}

export const useStatsStore = create<StatsState>((set, get) => ({
  latest: null,
  sourceTabId: undefined as any,
  cpuHistory: [],
  rxHistory: [],
  txHistory: [],
  prevNet: null,
  pollInterval: 3000,

  setLatest(s, tabId) {
    const st = get()

    // Update CPU sparkline
    const cpuHistory = [...st.cpuHistory.slice(-29), s.cpu]

    // Update net sparkline (delta bytes/s)
    const totalRx = s.net.reduce((a: number, n: any) => a + n.rxBytes, 0)
    const totalTx = s.net.reduce((a: number, n: any) => a + n.txBytes, 0)
    let rxHistory = st.rxHistory
    let txHistory = st.txHistory
    let prevNet = st.prevNet

    if (prevNet && totalRx >= prevNet.rx) {
      const dt = st.pollInterval / 1000
      rxHistory = [...rxHistory.slice(-29), Math.max(0, (totalRx - prevNet.rx) / dt)]
      txHistory = [...txHistory.slice(-29), Math.max(0, (totalTx - prevNet.tx) / dt)]
    }
    prevNet = { rx: totalRx, tx: totalTx }

    set({ latest: s, sourceTabId: tabId, cpuHistory, rxHistory, txHistory, prevNet })
  },

  resetForTab(tabId) {
    set({
      latest: null,
      sourceTabId: tabId,
      cpuHistory: [],
      rxHistory: [],
      txHistory: [],
      prevNet: null
    })
  }
}))
