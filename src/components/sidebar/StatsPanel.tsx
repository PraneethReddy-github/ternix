import { useTabStore } from '@/store/useTabStore'
import { useStatsStore } from '@/store/useStatsStore'
import { activePanes, isDead, statsTargetFor } from '@/utils/statsTarget'
import { Activity, Cpu, HardDrive, Network, RefreshCw, Server, Thermometer, Loader2, WifiOff } from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(2) + ' MB'
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(2) + ' KB'
  return bytes.toFixed(2) + ' B'
}

function fmtUptime(secs: number): string {
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function heat(pct: number): string {
  if (pct < 50) return '#22c55e'
  if (pct < 75) return '#eab308'
  if (pct < 90) return '#f97316'
  return '#ef4444'
}

// ── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ history, color, max = 100 }: { history: number[]; color: string; max?: number }) {
  const W = 100, H = 28
  const pts = history.slice(-30)
  if (pts.length < 2) return <div style={{ width: W, height: H }} className="shrink-0" />
  const hi = Math.max(max, ...pts, 1)
  const x = (i: number) => (i / (pts.length - 1)) * W
  const y = (v: number) => H - (v / hi) * (H - 2) - 1
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const fill = `${d} L${W},${H} L0,${H} Z`
  const id = `sg${color.replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg width={W} height={H} className="shrink-0" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts.length - 1).toFixed(1)} cy={y(pts[pts.length - 1]).toFixed(1)} r="2" fill={color} />
    </svg>
  )
}

// ── Gauge bar ────────────────────────────────────────────────────────────────

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  )
}

function Label({ icon: Icon, text }: { icon: typeof Cpu; text: string }) {
  return (
    <div className="flex items-center gap-1 mb-1.5">
      <Icon size={10} className="text-muted shrink-0" />
      <span className="text-[9px] uppercase tracking-widest text-muted font-semibold">{text}</span>
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function StatsPanel() {
  // Primitive selectors — a StatsTarget object would be a fresh reference every render.
  const kind = useTabStore((s) => statsTargetFor(activePanes(s)).kind)
  const tabId = useTabStore((s) => {
    const t = statsTargetFor(activePanes(s))
    return t.kind === 'remote' ? t.tabId : null
  })
  const host = useTabStore((s) => {
    const t = statsTargetFor(activePanes(s))
    return t.kind === 'local' ? null : t.host
  })
  const dead = useTabStore((s) => isDead(statsTargetFor(activePanes(s))))
  const deadReason = useTabStore((s) => {
    const t = statsTargetFor(activePanes(s))
    return t.kind === 'pending' ? t.message : undefined
  })

  // All data comes from the always-on StatsPoller via the store
  const stats    = useStatsStore((s) => s.latest)
  const cpuHist  = useStatsStore((s) => s.cpuHistory)
  const rxHist   = useStatsStore((s) => s.rxHistory)
  const txHist   = useStatsStore((s) => s.txHistory)

  const source   = stats?.source ?? (kind === 'local' ? 'local' : 'remote')
  const hostname = stats?.hostname ?? (kind === 'local' ? 'Local Machine' : (host ?? '…'))

  // Manual refresh. While the session is still connecting there is nothing to fetch —
  // asking for stats with a null tabId would return the local machine's.
  const refresh = async () => {
    if (kind === 'pending') return
    try {
      const s = await (window as any).ternix.stats.fetch(tabId)
      useStatsStore.getState().setLatest(s, tabId)
    } catch { /* ignore */ }
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="h-9 flex items-center gap-2 px-3 border-b border-border shrink-0">
        <Activity size={13} className="text-muted shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-muted font-semibold">Monitor</div>
          <div className="text-[10px] text-text truncate">{hostname}</div>
        </div>
        <button
          onClick={refresh}
          disabled={kind === 'pending'}
          title={kind === 'pending' ? 'Waiting for the session to connect' : 'Refresh'}
          className="text-muted hover:text-text transition-colors disabled:opacity-40 disabled:hover:text-muted"
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {/* Source badge */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border shrink-0">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide"
          style={{
            background: source === 'remote' ? 'rgba(96,165,250,0.12)' : 'rgba(34,197,94,0.12)',
            color: source === 'remote' ? '#60a5fa' : '#22c55e'
          }}>
          <Server size={8} />
          {source === 'remote' ? 'SSH Session' : 'Local Machine'}
        </span>
        {!stats && !dead && <Loader2 size={11} className="animate-spin text-muted" />}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!stats && dead ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 px-3 text-center">
            <WifiOff size={20} className="text-danger opacity-60" />
            <span className="text-[10px] text-danger leading-relaxed">{deadReason || 'Session disconnected'}</span>
            <span className="text-[10px] text-muted opacity-60">Reconnect the session to see stats.</span>
          </div>
        ) : !stats ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted">
            <Loader2 size={20} className="animate-spin opacity-40" />
            <span className="text-[10px] opacity-50">{kind === 'pending' ? 'Waiting for connection…' : 'Fetching stats…'}</span>
          </div>
        ) : (
          <div className="px-3 py-2 flex flex-col gap-3">

            {/* Uptime — pinned to the top */}
            <div className="flex justify-between text-[9px]">
              <span className="text-muted">Uptime</span>
              <span className="text-text">{fmtUptime(stats.uptimeSecs)}</span>
            </div>
            <div className="h-px bg-border" />

            {/* CPU */}
            <section>
              <Label icon={Cpu} text="CPU" />
              <div className="flex items-end justify-between mb-1">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-[20px] font-bold leading-none" style={{ color: heat(stats.cpu) }}>
                    {stats.cpu.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-muted">%</span>
                </div>
                <Sparkline history={cpuHist} color={heat(stats.cpu)} />
              </div>
              <Bar pct={stats.cpu} color={heat(stats.cpu)} />
              {stats.topProcess && (
                <div className="flex justify-between mt-2 text-[9px] text-muted">
                  <span className="truncate max-w-[130px]" title={stats.topProcess.name}>
                    Top: <span className="text-text">{stats.topProcess.name}</span>
                  </span>
                  <span className="text-text">{stats.topProcess.cpu.toFixed(2)}%</span>
                </div>
              )}
              <div className="flex justify-between mt-1 text-[9px] text-muted">
                <span>
                  {(stats.load[0] > 0 || stats.load[1] > 0 || stats.load[2] > 0)
                    ? `Load ${stats.load[0]} · ${stats.load[1]} · ${stats.load[2]}`
                    : ''}
                </span>
                {stats.procs > 0 && <span>{stats.procs} procs</span>}
              </div>
            </section>

            <div className="h-px bg-border" />

            {/* Memory */}
            <section>
              <Label icon={Activity} text="Memory" />
              <div className="flex items-baseline justify-between mb-1">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-[20px] font-bold leading-none" style={{ color: heat(stats.mem.percent) }}>
                    {stats.mem.percent.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-muted">%</span>
                </div>
                <span className="text-[10px] text-muted">{fmt(stats.mem.used)} / {fmt(stats.mem.total)}</span>
              </div>
              <Bar pct={stats.mem.percent} color={heat(stats.mem.percent)} />
              {stats.swap.total > 0 && (
                <div className="mt-2">
                  <div className="flex justify-between mb-1">
                    <span className="text-[9px] text-muted">Swap</span>
                    <span className="text-[9px] text-muted">{fmt(stats.swap.used)} / {fmt(stats.swap.total)}</span>
                  </div>
                  <Bar pct={stats.swap.percent} color={heat(stats.swap.percent)} />
                </div>
              )}
            </section>

            {stats.disk.length > 0 && (
              <>
                <div className="h-px bg-border" />
                <section>
                  <Label icon={HardDrive} text="Disk" />
                  <div className="flex flex-col gap-2">
                    {stats.disk.map((d: any) => (
                      <div key={d.path}>
                        <div className="flex justify-between mb-1">
                          <span className="text-[10px] text-text truncate max-w-[90px]" title={d.path}>{d.path}</span>
                          <span className="text-[9px] text-muted">{fmt(d.used)} / {fmt(d.total)}</span>
                        </div>
                        <Bar pct={d.percent} color={heat(d.percent)} />
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {rxHist.length > 1 && (
              <>
                <div className="h-px bg-border" />
                <section>
                  <Label icon={Network} text="Network" />
                  <div className="flex gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[9px] text-muted">↓ RX</span>
                        <span className="text-[9px] text-[#60a5fa]">{fmt(rxHist[rxHist.length-1] ?? 0)}/s</span>
                      </div>
                      <Sparkline history={rxHist} color="#60a5fa" max={Math.max(1, ...rxHist, ...txHist)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[9px] text-muted">↑ TX</span>
                        <span className="text-[9px] text-[#ef4444]">{fmt(txHist[txHist.length-1] ?? 0)}/s</span>
                      </div>
                      <Sparkline history={txHist} color="#ef4444" max={Math.max(1, ...rxHist, ...txHist)} />
                    </div>
                  </div>
                </section>
              </>
            )}

            {stats.temps.length > 0 && (
              <>
                <div className="h-px bg-border" />
                <section>
                  <Label icon={Thermometer} text="Temperature" />
                  <div className="flex flex-col gap-1">
                    {stats.temps.map((t: any) => (
                      <div key={t.label} className="flex justify-between items-center text-[11px]">
                        <span className="text-[9px] text-muted truncate max-w-[110px]">{t.label}</span>
                        <span className="text-[10px] font-semibold" style={{ color: heat(t.celsius - 30) }}>
                          {t.celsius}°C
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
