import { useEffect, useState } from 'react'
import { Section, Row, ToggleSetting, SelectSetting } from './SettingControls'
import { useUiStore } from '@/store/useUiStore'
import { formatSpeed } from '@/utils/formatBytes'

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready'

export function UpdateSettings() {
  const [version, setVersion] = useState('')
  const [state, setState] = useState<UpdateState>('idle')
  const [newVersion, setNewVersion] = useState<string>('')
  const [progress, setProgress] = useState({ percent: 0, speed: 0 })
  const notify = useUiStore((s) => s.notify)

  useEffect(() => {
    window.ternix.system.version().then(setVersion)

    const unsub = window.ternix.updates.onStatus((s) => {
      if (s.event === 'available') {
        setNewVersion(s.info.version)
        setState('available')
      } else if (s.event === 'none') {
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
  }, [])

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
      </Section>
    </div>
  )
}
