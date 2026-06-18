import { Section, Row, ToggleSetting, SelectSetting, TextSetting, NumberSetting } from './SettingControls'

export function TerminalSettings() {
  return (
    <div>
      <Section title="Terminal">
        <Row label="Scrollback lines"><NumberSetting k="terminal.scrollback" min={100} max={1000000} /></Row>
        <Row label="Bell">
          <SelectSetting k="terminal.bell" options={[{ value: 'none', label: 'None' }, { value: 'visual', label: 'Visual' }, { value: 'audio', label: 'Audio' }]} />
        </Row>
        <Row label="Word separators" hint="For double-click selection"><TextSetting k="terminal.wordSeparators" width={200} /></Row>
      </Section>
      <Section title="Clipboard">
        <Row label="Copy on select"><ToggleSetting k="terminal.copyOnSelect" /></Row>
        <Row label="Paste on middle-click"><ToggleSetting k="terminal.pasteOnMiddleClick" /></Row>
        <Row label="Confirm multi-line paste"><ToggleSetting k="terminal.pasteConfirmMultiline" /></Row>
        <Row label="Trim trailing whitespace on paste"><ToggleSetting k="terminal.trimPasteWhitespace" /></Row>
        <Row label="Right-click behavior">
          <SelectSetting k="terminal.rightClick" options={[{ value: 'menu', label: 'Context menu' }, { value: 'paste', label: 'Paste' }]} />
        </Row>
      </Section>
    </div>
  )
}
