import { useEffect, useState } from 'react'
import { Section, Row, ToggleSetting, SelectSetting } from './SettingControls'
import { useUiStore } from '@/store/useUiStore'
import { formatSpeed } from '@/utils/formatBytes'

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready'

/** One line of a release body: a section label, or a bullet under the label above it. */
export interface ReleaseNote {
  text: string
  heading: boolean
}

/**
 * Release bodies arrive as GitHub-rendered HTML, where a `**Section**` line is a bare <p> and
 * only bullets are <li>. Walking both in document order keeps each label with its bullets.
 */
export function parseNotes(raw: unknown): ReleaseNote[] {
  const html = Array.isArray(raw)
    ? raw.map((n: any) => n?.note ?? '').join('\n')
    : typeof raw === 'string' ? raw : ''
  if (!html.trim()) return []
  const body = new DOMParser().parseFromString(html, 'text/html').body
  const notes = [...body.querySelectorAll('li, p, h1, h2, h3, h4')]
    // A <p> inside an <li> is that bullet's own text (loose lists), else it lands twice.
    .filter((el) => el.tagName === 'LI' || !el.closest('li'))
    .map((el) => ({
      text: (el.textContent ?? '').replace(/^[-*•]\s*/, '').trim(),
      heading: el.tagName !== 'LI'
    }))
    .filter((n) => n.text)
  if (notes.some((n) => !n.heading)) return notes
  // Nothing list-shaped in there: fall back to plain lines, as before.
  return (body.textContent ?? '')
    .split('\n')
    .map((l) => ({ text: l.replace(/^[-*•]\s*/, '').trim(), heading: false }))
    .filter((n) => n.text)
}

export function UpdateSettings() {
  const [version, setVersion] = useState('')
  const [state, setState] = useState<UpdateState>('idle')
  const [newVersion, setNewVersion] = useState<string>('')
  const [notes, setNotes] = useState<ReleaseNote[]>([])
  const [progress, setProgress] = useState({ percent: 0, speed: 0 })
  const notify = useUiStore((s) => s.notify)

  useEffect(() => {
    window.ternix.system.version().then(setVersion)

    const unsub = window.ternix.updates.onStatus((s) => {
      if (s.event === 'available') {
        setNewVersion(s.info.version)
        setNotes(parseNotes(s.info.releaseNotes))
        setState('available')
      } else if (s.event === 'none') {
        setNotes([])
        setState('idle')
      } else if (s.event === 'error') {
        setState('idle')
        notify(`Update error: ${s.info.message}`, 'error')
      } else if (s.event === 'progress') {
        setState('downloading')
        setProgress({ percent: s.info.percent, speed: s.info.bytesPerSecond })
      } else if (s.event === 'downloaded') {
        setState('ready')
      }
    })
    return unsub
  }, [notify])

  const checkNow = async () => {
    setState('checking')
    try {
      const res = await window.ternix.updates.check()
      if (!res.available) {
        notify('You are up to date', 'success')
        setState('idle')
      }
    } catch (e: any) {
      notify(e.message, 'error')
      setState('idle')
    }
  }

  const download = async () => {
    setState('downloading')
    await window.ternix.updates.download()
  }

  const install = () => {
    window.ternix.updates.install()
  }

  return (
    <div>
      <Section title="Updates">
        <Row label="Check for updates automatically"><ToggleSetting k="updates.autoCheck" /></Row>
        <Row label="Update channel">
          <SelectSetting k="updates.channel" options={[{ value: 'stable', label: 'Stable' }, { value: 'beta', label: 'Beta' }]} />
        </Row>
        <Row label="Current version" hint={`Ternix ${version}`}>
          <div className="flex items-center gap-2">
            {state === 'idle' && <button className="tx-btn-primary" onClick={checkNow}>Check now</button>}
            {state === 'checking' && <button className="tx-btn-primary" disabled>Checking…</button>}
            {state === 'available' && (
              <button className="tx-btn-primary bg-accent text-bg border-transparent hover:brightness-110" onClick={download}>
                Download v{newVersion}
              </button>
            )}
            {state === 'downloading' && (
              <div className="flex flex-col items-end gap-1">
                <div className="text-[10px] text-muted">{formatSpeed(progress.speed)}</div>
                <div className="w-24 h-1.5 bg-surface rounded-full overflow-hidden">
                  <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress.percent}%` }} />
                </div>
              </div>
            )}
            {state === 'ready' && (
              <button className="tx-btn-primary bg-success text-bg border-transparent hover:brightness-110" onClick={install}>
                Restart & Install
              </button>
            )}
          </div>
        </Row>
        {notes.length > 0 && state !== 'idle' && (
          <div className="rounded-md border border-border bg-surface px-3 py-2.5">
            <div className="text-[11px] font-semibold text-text uppercase tracking-wide mb-1.5">{`What's new in v${newVersion}`}</div>
            <ul className="space-y-1 max-h-52 overflow-y-auto">
              {notes.map((n, i) =>
                n.heading ? (
                  <li key={i} className="text-[11px] font-semibold text-text pt-2 first:pt-0">
                    {n.text}
                  </li>
                ) : (
                  <li key={i} className="text-[11px] text-muted flex gap-2">
                    <span className="text-accent">•</span>
                    <span className="min-w-0">{n.text}</span>
                  </li>
                )
              )}
            </ul>
          </div>
        )}
      </Section>
    </div>
  )
}
