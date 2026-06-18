import { Section, Row, ToggleSetting, SelectSetting } from './SettingControls'

export function AdvancedSettings() {
  return (
    <div>
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
