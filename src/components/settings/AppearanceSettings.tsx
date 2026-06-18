import { Plus, Trash2, Check } from 'lucide-react'
import { Section, Row, ToggleSetting, SelectSetting, TextSetting, NumberSetting } from './SettingControls'
import { useThemeStore } from '@/store/useThemeStore'
import { useUiStore } from '@/store/useUiStore'
import { BUILTIN_THEMES } from '@/themes'
import { cn } from '@/utils/cn'

export function AppearanceSettings() {
  const activeId = useThemeStore((s) => s.activeId)
  const setActive = useThemeStore((s) => s.setActive)
  const custom = useThemeStore((s) => s.custom)
  const deleteCustom = useThemeStore((s) => s.deleteCustom)
  const openDialog = useUiStore((s) => s.openDialog)

  return (
    <div>
      <Section title="Theme">
        <div className="grid grid-cols-2 gap-2">
          {[...BUILTIN_THEMES, ...custom].map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={cn('flex items-center gap-2 rounded-input border p-2 text-left', activeId === t.id ? 'border-accent' : 'border-border hover:border-muted')}
            >
              <div className="flex gap-0.5">
                {[t.background, t.red, t.green, t.blue, t.foreground].map((c, i) => (
                  <span key={i} className="w-3 h-6 rounded-sm" style={{ background: c }} />
                ))}
              </div>
              <span className="text-[12px] text-text flex-1 truncate">{t.name}</span>
              {activeId === t.id && <Check size={14} className="text-accent" />}
              {custom.some((c) => c.id === t.id) && (
                <span
                  onClick={(e) => { e.stopPropagation(); deleteCustom(t.id) }}
                  className="text-muted hover:text-danger"
                >
                  <Trash2 size={13} />
                </span>
              )}
            </button>
          ))}
        </div>
        <button className="tx-btn-ghost border border-border mt-2" onClick={() => openDialog({ kind: 'themeEditor', baseId: activeId })}>
          <Plus size={14} /> New custom theme
        </button>
      </Section>

      <Section title="Font">
        <Row label="Font family"><TextSetting k="appearance.fontFamily" width={280} /></Row>
        <Row label="Font size"><NumberSetting k="appearance.fontSize" min={8} max={32} /></Row>
        <Row label="Ligatures"><ToggleSetting k="appearance.ligatures" /></Row>
        <Row label="Line height"><TextSetting k="appearance.lineHeight" width={80} /></Row>
        <Row label="Letter spacing"><NumberSetting k="appearance.letterSpacing" /></Row>
      </Section>

      <Section title="Cursor & window">
        <Row label="Cursor style">
          <SelectSetting k="appearance.cursorStyle" options={[{ value: 'block', label: 'Block' }, { value: 'underline', label: 'Underline' }, { value: 'bar', label: 'Bar' }]} />
        </Row>
        <Row label="Cursor blink"><ToggleSetting k="appearance.cursorBlink" /></Row>
        <Row label="Window transparency" hint="0–100% (macOS/Windows)"><NumberSetting k="appearance.transparency" min={0} max={100} /></Row>
        <Row label="Compact mode" hint="Smaller tab bar, hide per-pane toolbar"><ToggleSetting k="appearance.compactMode" /></Row>
        <Row label="Show clock in status bar"><ToggleSetting k="appearance.showClock" /></Row>
      </Section>

      <Section title="Advanced">
        <Row label="Custom CSS" hint="Injected into the app chrome"><TextSetting k="appearance.customCss" width={280} /></Row>
      </Section>
    </div>
  )
}
