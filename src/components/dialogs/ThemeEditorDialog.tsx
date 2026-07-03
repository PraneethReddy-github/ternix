import { useState } from 'react'
import type { TerminalTheme } from '@shared/index'
import { Modal, Field } from '@/components/ui/Modal'
import { useThemeStore } from '@/store/useThemeStore'
import { useUiStore } from '@/store/useUiStore'
import { themeById } from '@/themes'

const ANSI_KEYS: (keyof TerminalTheme)[] = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite']
const CORE_KEYS: (keyof TerminalTheme)[] = ['background', 'foreground', 'cursor', 'selectionBackground']

export function ThemeEditorDialog({ baseId, onClose }: { baseId?: string; onClose: () => void }) {
  const custom = useThemeStore((s) => s.custom)
  const saveCustom = useThemeStore((s) => s.saveCustom)
  const notify = useUiStore((s) => s.notify)
  const base = themeById(baseId ?? useThemeStore.getState().activeId, custom)
  const [theme, setTheme] = useState<TerminalTheme>({ ...base, id: `custom-${Date.now()}`, name: `${base.name} (custom)` })

  const setColor = (key: keyof TerminalTheme, value: string) => setTheme((t) => ({ ...t, [key]: value }))
  const setUi = (key: keyof TerminalTheme['ui'], value: string) => setTheme((t) => ({ ...t, ui: { ...t.ui, [key]: value } }))

  const save = async () => {
    if (!theme.name.trim()) return notify('Theme name required', 'error')
    await saveCustom(theme)
    await useThemeStore.getState().setActive(theme.id)
    notify('Theme saved', 'success')
    onClose()
  }

  const importJson = async () => {
    const path = await window.ternix.system.selectFile([{ name: 'JSON', extensions: ['json'] }])
    if (!path) return
    try {
      const parsed = JSON.parse(await window.ternix.system.readFile(path)) as Partial<TerminalTheme>
      if (!parsed || typeof parsed !== 'object' || !parsed.background || !parsed.foreground || !parsed.ui) {
        return notify('Not a valid Ternix theme file', 'error')
      }
      // Give it a fresh id so importing never overwrites an existing theme.
      setTheme({ ...base, ...parsed, id: `custom-${Date.now()}`, name: parsed.name ?? `${base.name} (imported)` })
      notify('Theme imported — review and Save', 'success')
    } catch (e: any) {
      notify(`Import failed: ${e.message}`, 'error')
    }
  }

  const exportJson = async () => {
    const path = await window.ternix.system.saveFile(`${theme.id}.json`, JSON.stringify(theme, null, 2))
    if (path) notify('Theme exported', 'success')
  }

  return (
    <Modal
      title="Theme builder"
      width={680}
      onClose={onClose}
      footer={
        <>
          <button className="tx-btn-ghost border border-border" onClick={importJson}>Import</button>
          <button className="tx-btn-ghost border border-border" onClick={exportJson}>Export</button>
          <button className="tx-btn-primary" onClick={save}>Save theme</button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Field label="Theme name"><input className="tx-input" value={theme.name} onChange={(e) => setTheme({ ...theme, name: e.target.value })} /></Field>
          <Field label="Type">
            <select className="tx-input" value={theme.type} onChange={(e) => setTheme({ ...theme, type: e.target.value as any })}>
              <option value="dark">Dark</option><option value="light">Light</option>
            </select>
          </Field>
          <div className="text-[11px] uppercase text-muted mb-1 mt-2">Core</div>
          {CORE_KEYS.map((k) => (
            <ColorRow key={k} label={k} value={theme[k] as string} onChange={(v) => setColor(k, v)} />
          ))}
          <div className="text-[11px] uppercase text-muted mb-1 mt-3">UI accent</div>
          <ColorRow label="accent" value={theme.ui.accent} onChange={(v) => setUi('accent', v)} />
          <ColorRow label="surface" value={theme.ui.surface} onChange={(v) => setUi('surface', v)} />
          <ColorRow label="border" value={theme.ui.border} onChange={(v) => setUi('border', v)} />
        </div>
        <div>
          <div className="text-[11px] uppercase text-muted mb-1">ANSI palette</div>
          <div className="grid grid-cols-2 gap-x-2">
            {ANSI_KEYS.map((k) => (
              <ColorRow key={k} label={k} value={theme[k] as string} onChange={(v) => setColor(k, v)} />
            ))}
          </div>
          <div className="mt-3 rounded-input border border-border p-3 font-mono text-[12px]" style={{ background: theme.background, color: theme.foreground }}>
            <div>$ ternix --preview</div>
            <div className="flex gap-1 my-1">
              {ANSI_KEYS.slice(0, 8).map((k) => <span key={k} style={{ color: theme[k] as string }}>██</span>)}
            </div>
            <div style={{ color: theme.green }}>✓ build succeeded</div>
            <div style={{ color: theme.red }}>✗ 2 errors</div>
            <div><span style={{ color: theme.blue }}>~/code</span> <span style={{ color: theme.cursor }}>▋</span></div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-6 h-6 rounded border border-border bg-transparent cursor-pointer" />
      <span className="text-[11px] text-muted flex-1 truncate">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-20 bg-bg border border-border rounded px-1 text-[11px] font-mono" />
    </div>
  )
}
