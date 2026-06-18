import { Section, Row, ToggleSetting, SelectSetting, NumberSetting } from './SettingControls'
import { useSettingsStore } from '@/store/useSettingsStore'

export function FileTransferSettings() {
  const set = useSettingsStore((s) => s.set)
  const dir = useSettingsStore((s) => s.get('transfer.downloadDir'))

  const pickDir = async () => {
    const d = await window.ternix.system.selectDirectory()
    if (d) set('transfer.downloadDir', d)
  }

  return (
    <div>
      <Section title="File Transfers">
        <Row label="Default download directory">
          <button className="tx-input text-left" style={{ width: 280 }} onClick={pickDir}>
            {dir || 'Choose folder…'}
          </button>
        </Row>
        <Row label="Conflict resolution">
          <SelectSetting
            k="transfer.conflict"
            options={[
              { value: 'prompt', label: 'Prompt' },
              { value: 'overwrite', label: 'Overwrite' },
              { value: 'skip', label: 'Skip' },
              { value: 'rename', label: 'Rename' }
            ]}
          />
        </Row>
        <Row label="Max concurrent transfers"><NumberSetting k="transfer.maxConcurrent" min={1} max={10} /></Row>
        <Row label="Preserve timestamps"><ToggleSetting k="transfer.preserveTimestamps" /></Row>
      </Section>
      <Section title="Recording">
        <Row label="Auto-record all sessions"><ToggleSetting k="recording.autoRecord" /></Row>
        <Row label="Max recording storage (MB)" hint="0 = unlimited"><NumberSetting k="recording.maxStorageMb" min={0} max={100000} /></Row>
      </Section>
    </div>
  )
}
