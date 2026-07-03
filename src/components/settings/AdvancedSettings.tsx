import { Section, Row, ToggleSetting, SelectSetting, TextSetting, NumberSetting } from './SettingControls'

export function AdvancedSettings() {
  return (
    <div>
      <Section title="Remote desktop (RDP)">
        <Row
          label="guacd host"
          hint="Optional: an Apache Guacamole daemon for in-pane RDP (Linux). On Windows, RDP opens in the native client."
        >
          <TextSetting k="rdp.guacdHost" placeholder="127.0.0.1" width={160} />
        </Row>
        <Row label="guacd port">
          <NumberSetting k="rdp.guacdPort" min={1} max={65535} />
        </Row>
      </Section>
      <Section title="Rendering">
        <Row label="Hardware acceleration" hint="GPU rendering for xterm.js"><ToggleSetting k="advanced.hardwareAcceleration" /></Row>
        <Row label="Renderer type">
          <SelectSetting k="advanced.rendererType" options={[{ value: 'webgl', label: 'WebGL' }, { value: 'canvas', label: 'Canvas / DOM' }]} />
        </Row>
      </Section>
      <Section title="Diagnostics">
        <Row label="Debug log level">
          <SelectSetting
            k="advanced.debugLogLevel"
            options={[
              { value: 'error', label: 'Error' },
              { value: 'warn', label: 'Warn' },
              { value: 'info', label: 'Info' },
              { value: 'debug', label: 'Debug' }
            ]}
          />
        </Row>
        <Row label="Open log file location">
          <button className="tx-btn-ghost border border-border" onClick={() => window.ternix.system.openPath('.')}>Open folder</button>
        </Row>
      </Section>
    </div>
  )
}
