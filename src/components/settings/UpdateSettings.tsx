import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Section, Row, ToggleSetting, SelectSetting } from './SettingControls'
import { cn } from '@/utils/cn'
import { formatSpeed } from '@/utils/formatBytes'
import type { ReleaseNotes } from '@shared/index'

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready'

/**
 * `**bold**`, `` `code` `` and `[text](url)` inside one line. Anything else stays literal —
 * a release body is prose, not a document format, and unmatched syntax reading as plain
 * text is the right failure mode.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  let n = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1]) {
      out.push(<strong key={`${key}b${n}`} className="text-text font-semibold">{m[1]}</strong>)
    } else if (m[2]) {
      out.push(<code key={`${key}c${n}`} className="px-1 py-0.5 rounded bg-surface-2 text-text">{m[2]}</code>)
    } else {
      const [label, href] = [m[3], m[4]]
      out.push(
        <a
          key={`${key}a${n}`}
          className="text-accent hover:underline cursor-pointer"
          onClick={() => window.ternix.system.openPath(href)}
        >
          {label}
        </a>
      )
    }
    last = re.lastIndex
    n++
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/**
 * The subset of markdown a GitHub release body actually uses: headings, bullets, numbered
 * items, fenced code and paragraphs. Renders to React elements, so a release body can never
 * inject markup — which a full markdown dependency plus sanitiser would have to earn back.
 */
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let fenced = false
  // RELEASE_NOTES.md opens with an HTML comment holding instructions for whoever writes it.
  // GitHub hides those when it renders the release; raw markdown would print them.
  text = text.replace(/<!--[\s\S]*?-->/g, '')
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    if (/^\s*```/.test(line)) {
      fenced = !fenced
      return
    }
    if (fenced) {
      blocks.push(
        <div key={i} className="text-[10.5px] text-text font-mono bg-surface-2 px-2 py-0.5 whitespace-pre-wrap break-all">
          {raw}
        </div>
      )
      return
    }
    if (!line.trim()) return
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push(
        <div key={i} className="text-[11px] font-semibold text-text mt-2.5 first:mt-0">
          {inline(heading[2], `h${i}`)}
        </div>
      )
      return
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line) ?? /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (bullet) {
      blocks.push(
        <div key={i} className="flex gap-2 text-[11px] text-muted">
          <span className="text-accent shrink-0">•</span>
          <span className="min-w-0">{inline(bullet[1], `l${i}`)}</span>
        </div>
      )
      return
    }
    blocks.push(
      <div key={i} className="text-[11px] text-muted">
        {inline(line, `p${i}`)}
      </div>
    )
  })
  return <div className="space-y-1">{blocks}</div>
}

export function UpdateSettings() {
  const [version, setVersion] = useState('')
  const [state, setState] = useState<UpdateState>('idle')
  const [newVersion, setNewVersion] = useState('')
  const [notes, setNotes] = useState<ReleaseNotes | null>(null)
  const [notesOpen, setNotesOpen] = useState(true)
  const [notesError, setNotesError] = useState('')
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState({ percent: 0, speed: 0 })

  /**
   * Show the notes for whichever version is being talked about: the installed one while
   * up to date, the pending one once a check finds something newer.
   */
  const showNotes = useCallback(async (v: string) => {
    setNotesError('')
    const res = await window.ternix.updates.notes(v).catch(() => null)
    if (res) setNotes(res)
    else setNotesError("Couldn't reach GitHub for the release notes.")
  }, [])

  useEffect(() => {
    window.ternix.system.version().then((v) => {
      setVersion(v)
      showNotes(v)
    })

    const unsub = window.ternix.updates.onStatus((s) => {
      if (s.event === 'available') {
        setNewVersion(s.info.version)
        setStatus(`Version ${s.info.version} is available.`)
        setState('available')
        showNotes(s.info.version)
      } else if (s.event === 'none') {
        setState('idle')
      } else if (s.event === 'error') {
        setState('idle')
        setStatus(String(s.info?.message ?? 'Update check failed.'))
      } else if (s.event === 'progress') {
        setState('downloading')
        setProgress({ percent: s.info.percent, speed: s.info.bytesPerSecond })
      } else if (s.event === 'downloaded') {
        setState('ready')
        setStatus('Update downloaded — restart to install it.')
      }
    })
    return unsub
  }, [showNotes])

  const checkNow = async () => {
    setState('checking')
    setStatus('')
    try {
      const res = await window.ternix.updates.check()
      if (res.available && res.version) {
        // The pushed 'available' event usually lands first; doing it twice is harmless.
        setNewVersion(res.version)
        setStatus(`Version ${res.version} is available.`)
        setState('available')
        showNotes(res.version)
      } else {
        // Up to date still shows what changed — in the release you're actually running.
        setStatus(res.error || "You're on the latest version.")
        setState('idle')
        if (!res.error) showNotes(version)
      }
    } catch (e: any) {
      setStatus(e.message)
      setState('idle')
    }
  }

  const download = async () => {
    setState('downloading')
    try {
      await window.ternix.updates.download()
    } catch (e: any) {
      setState('available')
      setStatus(e.message)
    }
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
              <button
                className="tx-btn-primary bg-success text-bg border-transparent hover:brightness-110"
                onClick={() => window.ternix.updates.install()}
              >
                Restart & Install
              </button>
            )}
          </div>
        </Row>

        {/* Inline, not a toast: the result of a check is something you read, not dismiss. */}
        {status && <div className="text-[11px] text-muted -mt-1">{status}</div>}

        {notes ? (
          <div className="pt-3.5 mt-3.5 border-t border-border">
            <button
              className="w-full flex items-baseline gap-2 text-left"
              onClick={() => setNotesOpen((o) => !o)}
            >
              <ChevronDown
                size={13}
                className={cn('text-muted shrink-0 self-center transition-transform', !notesOpen && '-rotate-90')}
              />
              <div className="text-[11px] font-semibold text-text uppercase tracking-wide">
                {`What's new in v${notes.version}`}
                {notes.version !== version && <span className="ml-1.5 normal-case text-accent">(not installed yet)</span>}
              </div>
              {notes.publishedAt && (
                <div className="ml-auto text-[10px] text-muted shrink-0">{new Date(notes.publishedAt).toLocaleDateString()}</div>
              )}
            </button>
            {notesOpen &&
              (notes.body.trim() ? (
                <div className="mt-1.5 pl-[21px]"><Markdown text={notes.body} /></div>
              ) : (
                <div className="mt-1.5 pl-[21px] text-[11px] text-muted">This release was published without notes.</div>
              ))}
          </div>
        ) : (
          notesError && <div className="pt-3.5 mt-3.5 border-t border-border text-[11px] text-muted">{notesError}</div>
        )}
      </Section>
    </div>
  )
}
