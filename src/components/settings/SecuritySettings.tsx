import { useEffect, useState } from 'react'
import { ShieldCheck, Lock } from 'lucide-react'
import type { VaultStatus } from '@shared/index'
import { Section, Row, ToggleSetting, NumberSetting } from './SettingControls'
import { useUiStore } from '@/store/useUiStore'


export function SecuritySettings() {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const notify = useUiStore((s) => s.notify)

  const refresh = () => window.ternix.vault.status().then(setStatus)
  useEffect(() => {
    refresh()
  }, [])

  const setMaster = async () => {
    const oldPw = status?.hasMasterPassword ? window.prompt('Current master password:') : null
    if (status?.hasMasterPassword && oldPw === null) return
    const newPw = window.prompt('New master password:')
    if (!newPw) return
    const confirm = window.prompt('Confirm new master password:')
    if (newPw !== confirm) return notify('Passwords do not match', 'error')
    try {
      await window.ternix.vault.setMasterPassword(oldPw, newPw)
      notify('Master password set — all secrets re-encrypted', 'success')
      refresh()
    } catch (e: any) {
      notify(e.message, 'error')
    }
  }

  const removeMaster = async () => {
    const pw = window.prompt('Current master password to remove it:')
    if (!pw) return
    try {
      await window.ternix.vault.removeMasterPassword(pw)
      notify('Master password removed — using OS keychain', 'success')
      refresh()
    } catch (e: any) {
      notify(e.message, 'error')
    }
  }

  return (
    <div>
      <Section title="Vault">
        <div className="flex items-center gap-2 text-[13px] text-text mb-2">
          {status?.hasMasterPassword ? <ShieldCheck size={16} className="text-success" /> : <Lock size={16} className="text-muted" />}
          {status?.hasMasterPassword ? 'Protected by a master password' : 'Using OS keychain (no master password)'}
        </div>
        <div className="flex gap-2">
          <button className="tx-btn-primary" onClick={setMaster}>{status?.hasMasterPassword ? 'Change master password' : 'Set master password'}</button>
          {status?.hasMasterPassword && <button className="tx-btn-ghost border border-border" onClick={removeMaster}>Remove</button>}
          <button className="tx-btn-ghost border border-border" onClick={() => window.ternix.vault.lock()}>Lock now</button>
        </div>
      </Section>
      <Section title="Auto-lock">
        <Row label="Lock after idle (minutes)" hint="0 = never">
          <NumberSetting k="security.vaultLockTimeout" min={0} max={1440} />
        </Row>
        <Row label="Lock on system sleep"><ToggleSetting k="security.lockOnSleep" /></Row>
        <Row label="Clear clipboard after (seconds)" hint="0 = never">
          <NumberSetting k="security.clearClipboard" min={0} max={600} />
        </Row>
      </Section>
    </div>
  )
}
