import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Trash2, RefreshCw, Plus, Download, CheckCircle2, ShieldCheck, Info, X, Eye, EyeOff } from 'lucide-react'
import type { CloudflaredStatus, MobileQuickCommand, MobileStatus } from '@shared/index'
import { useSettingsStore } from '@/store/useSettingsStore'
import { Section, Row, NumberSetting } from './SettingControls'
import { cn } from '@/utils/cn'

type ConnectMode = 'local' | 'tunnel'

function relative(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00'
  const sec = Math.ceil(ms / 1000)
  return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`
}

const PAIR_TTL_MS = 120_000

export function PhoneSettings() {
  const [status, setStatus] = useState<MobileStatus | null>(null)
  const [cf, setCf] = useState<CloudflaredStatus | null>(null)
  const [pair, setPair] = useState<{ secret: string; expiresAt: number } | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [justLinked, setJustLinked] = useState(false)
  /** The QR stays blurred until asked for — it is a live key, and screens get shoulder-surfed. */
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [mode, setMode] = useState<ConnectMode>('local')
  const prevDeviceCount = useRef<number | null>(null)
  /** Guards against two overlapping mints; a second code would invalidate the first. */
  const minting = useRef(false)
  const setSetting = useSettingsStore((s) => s.set)
  const port = useSettingsStore((s) => s.getNum('mobile.port'))

  const localUrl = status?.lanUrls[0] ?? null
  const tunnelUrl = status?.tunnelUrl ?? null
  const activeUrl = mode === 'tunnel' ? tunnelUrl : localUrl

  useEffect(() => {
    window.ternix.mobile.status().then(setStatus).catch(() => {})
    window.ternix.mobile.cloudflaredStatus().then(setCf).catch(() => {})
    const offStatus = window.ternix.mobile.onStatus(setStatus)
    const offCf = window.ternix.mobile.onCloudflared(setCf)
    return () => {
      offStatus()
      offCf()
    }
  }, [])

  // Auto-switch to the tunnel tab when a tunnel URL appears.
  useEffect(() => {
    if (tunnelUrl && mode === 'local') setMode('tunnel')
  }, [tunnelUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Mint a pairing code. Deliberately independent of the `busy` flag that the tunnel and
   * server buttons share: tying the two together meant a status push arriving mid-toggle
   * could leave the auto-mint effect permanently satisfied, so the code never appeared
   * until the panel was remounted.
   */
  const generateCode = useCallback(async () => {
    if (minting.current) return
    minting.current = true
    setError(null)
    try {
      setPair(await window.ternix.mobile.pairing())
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      minting.current = false
    }
  }, [])

  // Live countdown — tick every second.
  useEffect(() => {
    if (!pair) {
      setRemaining(0)
      return
    }
    const tick = () => setRemaining(Math.max(0, pair.expiresAt - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [pair])

  // Auto-refresh on expiry.
  useEffect(() => {
    if (!pair) return
    const ms = pair.expiresAt - Date.now()
    if (ms <= 0) {
      generateCode()
      return
    }
    const t = setTimeout(generateCode, ms)
    return () => clearTimeout(t)
  }, [pair, generateCode])

  // Auto-generate a new code once a device links.
  useEffect(() => {
    if (!status) return
    const count = status.devices.length
    if (prevDeviceCount.current !== null && count > prevDeviceCount.current && pair) {
      setJustLinked(true)
      setPair(null)
      setQr(null)
      setTimeout(() => setJustLinked(false), 1200)
    }
    prevDeviceCount.current = count
  }, [status?.devices.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Draw the QR for whichever address the selected tab shows. The secret rides in the URL
  // fragment, which browsers never send to a server — so scanning is what carries the key
  // to the phone, and nothing equivalent ever goes over the network.
  useEffect(() => {
    if (!pair || !activeUrl) {
      setQr(null)
      return
    }
    let live = true
    QRCode.toDataURL(`${activeUrl}/#p=${pair.secret}`, { width: 220, margin: 1 })
      .then((d) => live && setQr(d))
      .catch(() => live && setQr(null))
    return () => {
      live = false
    }
  }, [activeUrl, pair])

  // A new secret means a new QR, so re-hide it — a reveal must never outlive the code it
  // was for, least of all across the two-minute auto-refresh.
  useEffect(() => setRevealed(false), [pair])

  // Keep a live pairing whenever the server is up.
  useEffect(() => {
    if (status?.running && !pair && !justLinked) generateCode()
    if (!status?.running && pair) setPair(null)
  }, [status?.running, pair, justLinked, generateCode])

  const run = useCallback(async (fn: () => Promise<MobileStatus | CloudflaredStatus | void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }, [])

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1200)
  }

  const toggleServer = () =>
    run(async () => {
      if (status?.running) {
        setPair(null)
        setQr(null)
        await setSetting('mobile.enabled', 'false')
        setStatus(await window.ternix.mobile.stop())
        return
      }
      await setSetting('mobile.enabled', 'true')
      setStatus(await window.ternix.mobile.start(port))
    })

  const running = !!status?.running
  const tunnelStarting = !!status?.tunnelStarting

  return (
    <div>
      <Section title="Phone Access">
        <p className="text-[12px] text-muted -mt-1 mb-1">
          Runs a small web terminal your phone can open in its browser. Linking is by QR scan, the
          connection is end-to-end encrypted, and any phone can be unlinked at any time.
        </p>
        <Row label="Enable phone access" hint={running ? `Listening on port ${status?.port}` : 'Off — no network port is open'}>
          <button
            onClick={toggleServer}
            disabled={busy}
            className={cn('w-9 h-5 rounded-full relative transition-colors', running ? 'bg-accent' : 'bg-surface-2 border border-border')}
          >
            <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', running ? 'left-[18px]' : 'left-0.5')} />
          </button>
        </Row>
        <Row label="Port" hint="Restart phone access after changing">
          <NumberSetting k="mobile.port" min={1024} max={65535} />
        </Row>
      </Section>

      {running && (
        <Section title="Link a Phone">
          <div className="flex items-center gap-4 mb-4 border-b border-border">
            {([['local', 'Local'], ['tunnel', 'Tunnel']] as [ConnectMode, string][]).map(([m, label]) => (
              <button
                key={m}
                className={cn(
                  'pb-2 text-[12px] font-medium transition-colors border-b-2 -mb-[1px]',
                  mode === m ? 'text-accent border-accent' : 'text-muted border-transparent hover:text-text'
                )}
                onClick={() => setMode(m)}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'tunnel' && !tunnelUrl && (
            <TunnelSetup cf={cf} status={status} busy={busy} run={run} setCf={setCf} />
          )}

          {mode === 'tunnel' && tunnelUrl && (
            <Row label="Tunnel active" hint="Stop when you no longer need remote access">
              <button
                className="tx-btn"
                disabled={busy}
                onClick={() => {
                  setMode('local')
                  run(async () => setStatus(await window.ternix.mobile.stopTunnel()))
                }}
              >
                Stop tunnel
              </button>
            </Row>
          )}

          {activeUrl && (
            <>
              <Row label="Address" hint={mode === 'tunnel' ? 'Works from any network' : 'Same Wi-Fi only'}>
                <div className="flex items-center gap-2">
                  <code className="text-[12px] text-accent select-all break-all">{activeUrl}</code>
                  <button className="tx-btn-ghost text-[11px]" onClick={() => copy(activeUrl, 'addr')}>
                    {copied === 'addr' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </Row>

              <div className="flex items-center gap-1.5 -mt-1 mb-1">
                <ShieldCheck size={13} className="text-green-400 shrink-0" />
                <span className="text-[12px] text-text">End-to-end encrypted</span>
                <SecurityInfo mode={mode} />
              </div>

              {justLinked ? (
                <div className="text-[12px] text-green-400">✓ Phone linked — generating a new code…</div>
              ) : pair ? (
                <div className="flex items-start gap-4 pt-1">
                  {qr && (
                    <button
                      type="button"
                      onClick={() => setRevealed((v) => !v)}
                      title={revealed ? 'Hide QR code' : 'Show QR code'}
                      aria-label={revealed ? 'Hide QR code' : 'Show QR code'}
                      className="group relative w-32 h-32 shrink-0 rounded bg-white p-1.5 overflow-hidden"
                    >
                      <img
                        src={qr}
                        alt="Pairing QR code"
                        className={cn('w-full h-full transition-[filter] duration-300', revealed && 'blur-0')}
                      />
                      {revealed ? (
                        <span className="absolute top-1 right-1 rounded bg-black/60 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <EyeOff size={12} />
                        </span>
                      ) : (
                        <>
                          <span className="absolute inset-0 backdrop-blur-[4px] bg-black/25" />
                          <span className="absolute inset-0 flex items-center justify-center">
                            <Eye size={20} className="text-white drop-shadow-lg transition-transform duration-300 ease-out group-hover:-translate-y-3" />
                          </span>
                          <span className="absolute inset-0 flex items-center justify-center pt-8 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 ease-out">
                            <span className="text-[10px] font-medium text-white/90">Show QR</span>
                          </span>
                        </>
                      )}
                    </button>
                  )}
                  <div className="min-w-0">
                    <div className="text-[13px] text-text font-medium">Scan with your phone&apos;s camera</div>
                    <div className="text-[12px] text-muted mt-0.5">
                      Open the link it offers. Scanning is what hands your phone its encryption key, so
                      the key is never sent over the network.
                    </div>
                    <div className="flex items-center gap-3 mt-2.5">
                      <div className={cn('text-[11px] tabular-nums', remaining < 15000 ? 'text-red-400' : 'text-muted')}>
                        {formatCountdown(remaining)} remaining
                      </div>
                      <div className="w-20 h-1 bg-surface rounded-full overflow-hidden">
                        <div
                          className={cn('h-full transition-all duration-1000 ease-linear rounded-full', remaining < 15000 ? 'bg-red-400' : 'bg-accent')}
                          style={{ width: `${Math.max(0, (remaining / PAIR_TTL_MS) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-[10px] text-muted mt-1">Single use · auto-refreshes on expiry</div>
                    <button className="tx-btn-ghost text-[11px] mt-1.5 -ml-2" onClick={generateCode}>
                      <RefreshCw size={11} /> New code
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-[12px] text-muted">Generating code…</div>
              )}
            </>
          )}

          {!activeUrl && mode === 'local' && (
            <p className="text-[12px] text-muted">No reachable network address found.</p>
          )}
          {!activeUrl && mode === 'tunnel' && tunnelStarting && (
            <p className="text-[12px] text-muted">The QR code appears here once the tunnel is up.</p>
          )}
        </Section>
      )}

      <QuickCommands />

      <Section title={`Linked Phones${status?.devices.length ? ` (${status.devices.length})` : ''}`}>
        {status?.devices.length ? (
          status.devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-border last:border-0">
              <div className="min-w-0">
                <div className="text-[13px] text-text">{d.name}</div>
                <div className="text-[11px] text-muted">Linked {relative(d.createdAt)} · last used {relative(d.lastSeen)}</div>
              </div>
              <button
                className="tx-btn text-red-400"
                onClick={() => run(async () => setStatus(await window.ternix.mobile.revokeDevice(d.id)))}
                title="Unlink this phone"
              >
                <Trash2 size={13} /> Unlink
              </button>
            </div>
          ))
        ) : (
          <p className="text-[12px] text-muted">No phones linked yet.</p>
        )}
      </Section>

      {error && <div className="text-[12px] text-red-400">{error}</div>}
    </div>
  )
}

/**
 * The tunnel needs Cloudflare's `cloudflared` binary. Rather than make that the user's
 * problem, Ternix downloads the right build for this machine on demand — so the tab shows
 * either a one-tap install, live download progress, or a plain Start button.
 */
function TunnelSetup({
  cf,
  status,
  busy,
  run,
  setCf
}: {
  cf: CloudflaredStatus | null
  status: MobileStatus | null
  busy: boolean
  run: (fn: () => Promise<MobileStatus | CloudflaredStatus | void>) => Promise<void>
  setCf: (s: CloudflaredStatus) => void
}) {
  const starting = !!status?.tunnelStarting
  const installing = !!cf?.installing

  return (
    <div className="space-y-2 mb-3">
      <p className="text-[12px] text-muted">
        A Cloudflare tunnel publishes phone access over HTTPS, so your phone can connect from mobile
        data or any other network — not just the same Wi-Fi.
      </p>

      {cf && !cf.supported && (
        <div className="text-[12px] text-red-400">
          Cloudflare publishes no cloudflared build for this platform. Tunnels are unavailable here.
        </div>
      )}

      {cf?.supported && !cf.installed && !installing && (
        <div className="rounded border border-border bg-surface-2 p-3 space-y-2">
          <div className="text-[12px] text-text">
            One-time setup: Ternix needs to download <code>cloudflared</code> (~40 MB). It is stored with
            Ternix&apos;s own data, needs no admin rights, and survives app updates.
          </div>
          <button
            className="tx-btn-primary"
            disabled={busy}
            onClick={() => run(async () => setCf(await window.ternix.mobile.installCloudflared()))}
          >
            <Download size={13} /> Set up tunnelling
          </button>
        </div>
      )}

      {installing && (
        <div className="space-y-1">
          <div className="text-[12px] text-muted">Downloading cloudflared… {cf?.progress ?? 0}%</div>
          <div className="h-1 bg-surface rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${cf?.progress ?? 0}%` }} />
          </div>
        </div>
      )}

      {cf?.installed && !installing && (
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <CheckCircle2 size={12} className="text-green-400" />
          cloudflared ready{cf.managed ? ' (installed by Ternix)' : ' (found on this system)'}
          {cf.managed && (
            <button
              className="tx-btn-ghost text-[11px]"
              disabled={busy}
              onClick={() => run(async () => setCf(await window.ternix.mobile.uninstallCloudflared()))}
            >
              Remove
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          className="tx-btn-primary"
          disabled={busy || starting || installing || cf?.supported === false}
          onClick={() => run(async () => window.ternix.mobile.startTunnel())}
        >
          {starting ? 'Starting…' : 'Start tunnel'}
        </button>
        {starting && <span className="text-[11px] text-muted">Connecting to Cloudflare…</span>}
      </div>

      {status?.tunnelError && <div className="text-[12px] text-red-400">{status.tunnelError}</div>}
    </div>
  )
}

/**
 * The straight answer about what the phone link does and does not protect, one tap away.
 *
 * Both modes encrypt identically — the honest difference is who is even in a position to
 * interfere, so the panel names that rather than implying the tunnel has better crypto.
 */
function SecurityInfo({ mode }: { mode: ConnectMode }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const tunnel = mode === 'tunnel'

  return (
    <>
      <button
        className="text-muted hover:text-text transition-colors"
        title="What this protects"
        aria-label="What this protects"
        onClick={() => setOpen(true)}
      >
        <Info size={13} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md max-h-full overflow-y-auto rounded-lg border border-border bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border sticky top-0 bg-surface">
              <ShieldCheck size={15} className="text-green-400 shrink-0" />
              <div className="text-[13px] font-medium text-text flex-1">
                {tunnel ? 'Tunnel connection' : 'Local network connection'}
              </div>
              <button className="text-muted hover:text-text" onClick={() => setOpen(false)} aria-label="Close">
                <X size={15} />
              </button>
            </div>

            <div className="px-4 py-3 space-y-3.5 text-[12px] leading-relaxed">
              <p className="text-muted">
                Everything between this computer and your phone is encrypted with a key the two of them
                share. Your phone gets that key by scanning the QR code — it is never sent over the
                network, so there is nothing to intercept.
              </p>

              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted mb-1.5">Protected</div>
                <ul className="space-y-1 text-text">
                  {[
                    'Everything you type, on the phone or on this computer',
                    'All terminal output, including scrollback history',
                    'Your saved session names, hostnames and snippets',
                    tunnel ? 'Readable by Cloudflare? No — they only relay it sealed' : 'Anyone else on this Wi-Fi sees only scrambled data'
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <CheckCircle2 size={13} className="text-green-400 shrink-0 mt-0.5" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted mb-1.5">Not protected</div>
                <ul className="space-y-1 text-text">
                  <li className="flex gap-2">
                    <span className="text-warning shrink-0">•</span>
                    <span>
                      {tunnel
                        ? 'Cloudflare delivers the phone page, so in principle they could alter it. You are trusting them the same way you trust any website you visit.'
                        : 'Someone who can actively rewrite traffic on this network — not merely watch it — could tamper with the phone page as it loads. Watching alone gets them nothing.'}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-warning shrink-0">•</span>
                    <span>The fact that a connection exists, and roughly how busy it is, is always visible.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-warning shrink-0">•</span>
                    <span>
                      Anyone who photographs the QR code while it is on screen can link their own phone, so it
                      stays hidden until you reveal it.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="rounded border border-border bg-surface-2 px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Recommended</div>
                <p className="text-text">
                  {tunnel
                    ? 'Safe to use from any network, including public Wi-Fi. Stop the tunnel when you no longer need remote access.'
                    : 'Best on a network you trust — home or office. On public or shared Wi-Fi, use Tunnel mode instead: it narrows who could interfere down to Cloudflare alone.'}
                </p>
              </div>

              <p className="text-muted">
                Every linked phone is listed below and can be unlinked instantly. Unlinking takes effect
                straight away, even mid-session.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * One-tap commands the phone shows above its keyboard. Separate from terminal snippets on
 * purpose: these are the two or three things you actually reach for from a phone, and the
 * phone offers both lists side by side.
 */
function QuickCommands() {
  const raw = useSettingsStore((s) => s.get('mobile.quickCommands'))
  const setSetting = useSettingsStore((s) => s.set)

  let list: MobileQuickCommand[] = []
  try {
    const parsed = JSON.parse(raw || '[]')
    if (Array.isArray(parsed)) list = parsed
  } catch {
    /* a corrupt value reads as empty and is overwritten on the next edit */
  }

  const save = (next: MobileQuickCommand[]) => setSetting('mobile.quickCommands', JSON.stringify(next))
  const patch = (i: number, p: Partial<MobileQuickCommand>) => save(list.map((q, n) => (n === i ? { ...q, ...p } : q)))

  return (
    <Section title="Quick Commands">
      <p className="text-[12px] text-muted -mt-1">
        Shown on the phone under the ⌘ button, next to your terminal snippets. Handy for the commands
        you would rather not type on a touchscreen.
      </p>

      {list.map((q, i) => (
        <div key={i} className="flex items-center gap-2">
          {/* tx-input is w-full, so both need an explicit basis or the label eats the row. */}
          <input
            className="tx-input shrink-0 !w-[130px]"
            placeholder="Label"
            value={q.label}
            onChange={(e) => patch(i, { label: e.target.value })}
          />
          <input
            className="tx-input flex-1 min-w-0 font-mono text-[12px]"
            placeholder="docker ps -a"
            value={q.command}
            onChange={(e) => patch(i, { command: e.target.value })}
          />
          <button className="tx-btn text-red-400 shrink-0" onClick={() => save(list.filter((_, n) => n !== i))}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      <button className="tx-btn" onClick={() => save([...list, { label: '', command: '' }])}>
        <Plus size={13} /> Add command
      </button>
    </Section>
  )
}
