import { useEffect, useState } from 'react'
import { Radio, ArrowDownUp, Lock, Cpu, MemoryStick, Network } from 'lucide-react'
import { useTabStore } from '@/store/useTabStore'
import { useTransferStore } from '@/store/useTransferStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUiStore } from '@/store/useUiStore'
import { useStatsStore } from '@/store/useStatsStore'
import { ProtocolIcon } from '@/components/sidebar/ProtocolIcon'
import { formatSpeed } from '@/utils/formatBytes'
import { cn } from '@/utils/cn'

function fmtBytes(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(2) + ' MB'
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(2) + ' KB'
  return bytes.toFixed(2) + ' B'
}



export function StatusBar() {
  const pane = useTabStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    return tab?.panes.find((p) => p.id === tab.activePaneId) ?? null
  })
  const broadcastTab = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.broadcast)
  const speed = useTransferStore((s) => s.totalSpeed())
  const activeTransfers = useTransferStore((s) => s.active().filter((t) => t.status === 'active').length)
  const showClock = useSettingsStore((s) => s.getBool('appearance.showClock'))

  // Stats from global store (fed by always-on StatsPoller)
  const stats   = useStatsStore((s) => s.latest)
  const rxHist  = useStatsStore((s) => s.rxHistory)
  const txHist  = useStatsStore((s) => s.txHistory)

  const rxRate = rxHist.length > 0 ? (rxHist[rxHist.length - 1] ?? 0) : 0
  const txRate = txHist.length > 0 ? (txHist[txHist.length - 1] ?? 0) : 0
  // Show network row once we have at least 2 readings (needed for a delta).
  // Never hide it based on traffic level — that causes layout shifts.
  const hasNet = rxHist.length >= 2

  const [dims, setDims] = useState('')
  const [latency, setLatency] = useState<number | null>(null)
  const [clock, setClock] = useState('')

  useEffect(() => {
    if (showClock) {
      const tick = () => setClock(new Date().toLocaleTimeString())
      tick()
      const id = setInterval(tick, 1000)
      return () => clearInterval(id)
    }
  }, [showClock])

  useEffect(() => {
    if (!pane || pane.state !== 'connected') { setLatency(null); return }
    let mounted = true
    const sample = () => window.ternix.terminal.latency(pane.id).then((ms) => mounted && setLatency(ms)).catch(() => {})
    sample()
    const id = setInterval(sample, 30000)
    return () => { mounted = false; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane?.id, pane?.state])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.paneId === pane?.id) setDims(`${detail.cols}×${detail.rows}`)
    }
    window.addEventListener('tx:resize', handler as EventListener)
    return () => window.removeEventListener('tx:resize', handler as EventListener)
  }, [pane?.id])

  const stateColor =
    pane?.state === 'connected' ? 'bg-success'
    : pane?.state === 'connecting' ? 'bg-warning'
    : 'bg-danger'

  return (
    <div className="h-6 flex items-center justify-between px-3 bg-surface border-t border-border text-[11px] text-muted select-none">

      {/* Left: session info + inline live stats */}
      <div className="flex items-center gap-3">
        {pane ? (
          <>
            <span className={cn('w-2 h-2 rounded-full', stateColor)} />
            <span className="flex items-center gap-1">
              <ProtocolIcon protocol={pane.protocol} size={11} />
              {pane.host ?? pane.title}
            </span>
            {latency != null && <span>{latency} ms</span>}
            {pane.state !== 'connected' && <span className="capitalize">{pane.state}</span>}
          </>
        ) : (
          <span>No active session</span>
        )}

        {/* Live stats — only shown when there is an active pane AND we have data */}
        {pane && stats && (
          <>
            <span className="opacity-30">·</span>
            <span className="flex items-center gap-0.5" title={`CPU ${stats.cpu.toFixed(2)}%`}>
              <Cpu size={13} className="opacity-50" />
              <span>{stats.cpu.toFixed(2)}%</span>
            </span>
            <span className="flex items-center gap-0.5" title={`Memory ${stats.mem.percent.toFixed(2)}%`}>
              <MemoryStick size={13} className="opacity-50" />
              <span>{stats.mem.percent.toFixed(2)}%</span>
            </span>
            {hasNet && (
              <span className="flex items-center gap-0.5" title="Network RX / TX">
                <Network size={13} className="opacity-50" />
                <span>↓{fmtBytes(rxRate)}/s</span>
                <span className="ml-0.5">↑{fmtBytes(txRate)}/s</span>
              </span>
            )}
          </>
        )}
      </div>

      {/* Right: transfers, dims, clock, lock */}
      <div className="flex items-center gap-3">
        {broadcastTab && (
          <span className="flex items-center gap-1 text-warning">
            <Radio size={11} /> Broadcast
          </span>
        )}
        {activeTransfers > 0 && (
          <button
            className="flex items-center gap-1 text-accent hover:opacity-80"
            onClick={() => useUiStore.getState().setView('sftp')}
            title="Open transfer queue"
          >
            <ArrowDownUp size={11} /> {formatSpeed(speed)}
          </button>
        )}
        {dims && <span>{dims}</span>}
        <span>UTF-8</span>
        {showClock && <span>{clock}</span>}
        <Lock size={11} className="opacity-40" />
      </div>
    </div>
  )
}
