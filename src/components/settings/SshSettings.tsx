import { Section, Row, ToggleSetting, SelectSetting, TextSetting, NumberSetting } from './SettingControls'

export function SshSettings() {
  return (
    <div>
      <Section title="SSH">
        <Row label="Default port"><NumberSetting k="ssh.defaultPort" min={1} max={65535} /></Row>
        <Row label="Default username"><TextSetting k="ssh.defaultUsername" width={200} /></Row>
        <Row label="SSH agent socket path" hint="Blank = $SSH_AUTH_SOCK"><TextSetting k="ssh.agentSock" width={280} /></Row>
        <Row label="Host key verification">
          <SelectSetting
            k="ssh.hostKeyStrictness"
            options={[
              { value: 'strict', label: 'Strict (reject unknown)' },
              { value: 'prompt', label: 'Prompt (recommended)' },
              { value: 'auto-accept', label: 'Auto-accept (insecure)' }
            ]}
          />
        </Row>
        <Row label="Connection timeout (ms)"><NumberSetting k="ssh.connectTimeout" min={1000} max={120000} width={120} /></Row>
        <Row label="Show server banner"><ToggleSetting k="ssh.showBanner" /></Row>
      </Section>
    </div>
  )
}
