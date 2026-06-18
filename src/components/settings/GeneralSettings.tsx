import { Section, Row, ToggleSetting, SelectSetting, TextSetting, NumberSetting } from './SettingControls'

export function GeneralSettings() {
  return (
    <div>
      <Section title="General">
        <Row label="Default shell" hint="For new local tabs (blank = system default)">
          <TextSetting k="general.defaultShell" placeholder="/bin/zsh, powershell.exe…" />
        </Row>
        <Row label="Startup behavior">
          <SelectSetting
            k="general.startupBehavior"
            options={[
              { value: 'blank', label: 'Open blank' },
              { value: 'reopen', label: 'Reopen last sessions' },
              { value: 'picker', label: 'Show session picker' }
            ]}
          />
        </Row>
        <Row label="Default protocol for New Tab">
          <SelectSetting k="general.newTabProtocol" options={[{ value: 'local', label: 'Local shell' }, { value: 'ssh', label: 'SSH (launcher)' }]} />
        </Row>
        <Row label="Confirm before closing with active sessions">
          <ToggleSetting k="general.confirmCloseActive" />
        </Row>
      </Section>
      <Section title="Reconnect">
        <Row label="Auto-reconnect on disconnect">
          <ToggleSetting k="general.autoReconnect" />
        </Row>
        <Row label="Retry count">
          <NumberSetting k="general.autoReconnectRetries" min={0} max={20} />
        </Row>
        <Row label="Retry delay (seconds)">
          <NumberSetting k="general.autoReconnectDelay" min={1} max={60} />
        </Row>
      </Section>
    </div>
  )
}
