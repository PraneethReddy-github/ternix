import { useEffect, useState } from 'react'
import { Section, Row, ToggleSetting, SelectSetting } from './SettingControls'
import { useUiStore } from '@/store/useUiStore'

export function UpdateSettings() {
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const notify = useUiStore((s) => s.notify)

  useEffect(() => {
    window.ternix.system.version().then(setVersion)
  }, [])

  const checkNow = async () => {
    setChecking(true)
    try {
      const res = await window.ternix.updates.check()
      notify(res.available ? `Update available: ${res.version}` : 'You are up to date', res.available ? 'info' : 'success')
    } catch (e: any) {
      notify(e.message, 'error')
    } finally {
      setChecking(false)
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
          <button className="tx-btn-primary" disabled={checking} onClick={checkNow}>{checking ? 'Checking…' : 'Check now'}</button>
        </Row>
      </Section>
    </div>
  )
}
