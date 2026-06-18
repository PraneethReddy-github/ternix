import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { Recording } from '@shared/index'
import { Modal } from '@/components/ui/Modal'
import { useThemeStore } from '@/store/useThemeStore'
import { toXtermTheme } from '@/themes'
import { formatDuration } from '@/utils/formatDuration'

interface CastEvent {
  time: number
  data: string
}

export function RecordingPlayer({ recording, onClose }: { recording: Recording; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const eventsRef = useRef<CastEvent[]>([])
  const timerRef = useRef<number | null>(null)
  const idxRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let term: Terminal | null = null
    ;(async () => {
      try {
        const content = await window.ternix.recordings.read(recording.id)
        const lines = content.split('\n').filter(Boolean)
        const header = JSON.parse(lines[0])
        const events: CastEvent[] = []
        for (let i = 1; i < lines.length; i++) {
          const [time, type, data] = JSON.parse(lines[i])
          if (type === 'o') events.push({ time, data })
        }
        eventsRef.current = events
        setDuration(events.length ? events[events.length - 1].time : 0)

        term = new Terminal({
          fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace",
          cols: header.width || 80,
          rows: header.height || 24,
          theme: toXtermTheme(useThemeStore.getState().active()),
          disableStdin: true
        })
        const fit = new FitAddon()
        term.loadAddon(fit)
        if (containerRef.current) {
          term.open(containerRef.current)
          fit.fit()
        }
        termRef.current = term
        play()
      } catch (e: any) {
        setError(e.message)
      }
    })()
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      term?.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording.id])

  const schedule = () => {
    const events = eventsRef.current
    if (idxRef.current >= events.length) {
      setPlaying(false)
      return
    }
    const ev = events[idxRef.current]
    const prevTime = idxRef.current > 0 ? events[idxRef.current - 1].time : 0
    const delay = Math.max(0, (ev.time - prevTime) * 1000)
    timerRef.current = window.setTimeout(() => {
      termRef.current?.write(ev.data)
      setPosition(ev.time)
      idxRef.current++
      schedule()
    }, Math.min(delay, 2000))
  }

  const play = () => {
    setPlaying(true)
    schedule()
  }
  const pause = () => {
    setPlaying(false)
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }
  const restart = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    termRef.current?.reset()
    idxRef.current = 0
    setPosition(0)
    play()
  }
  const seek = (t: number) => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    const term = termRef.current
    if (!term) return
    term.reset()
    const events = eventsRef.current
    let i = 0
    for (; i < events.length && events[i].time <= t; i++) term.write(events[i].data)
    idxRef.current = i
    setPosition(t)
    if (playing) schedule()
  }

  return (
    <Modal title={`Playback · ${recording.session_name}`} width={760} onClose={onClose}>
      {error ? (
        <div className="text-danger text-[13px] py-6 text-center">{error}</div>
      ) : (
        <>
          <div ref={containerRef} className="h-[360px] bg-black rounded-input overflow-hidden" />
          <div className="flex items-center gap-3 mt-3">
            <button className="text-text" onClick={playing ? pause : play}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
            <button className="text-muted hover:text-text" onClick={restart}><RotateCcw size={16} /></button>
            <input type="range" min={0} max={duration} step={0.1} value={position} onChange={(e) => seek(Number(e.target.value))} className="flex-1 accent-accent" />
            <span className="text-[11px] text-muted tabular-nums">{formatDuration(position)} / {formatDuration(duration)}</span>
          </div>
        </>
      )}
    </Modal>
  )
}
