import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Section } from './SettingControls'
import { DEFAULT_KEYBINDINGS, loadKeybindings } from '@/hooks/useKeyboard'
import { useSettingsStore } from '@/store/useSettingsStore'

export function KeyboardSettings() {
  const set = useSettingsStore((s) => s.set)
  const [bindings, setBindings] = useState(() => loadKeybindings())
  const [capturing, setCapturing] = useState<string | null>(null)

  const persist = (next: typeof bindings) => {
    setBindings(next)
    const overrides: Record<string, string> = {}
    for (const b of next) {
      const def = DEFAULT_KEYBINDINGS.find((d) => d.action === b.action)
      if (def && def.combo !== b.combo) overrides[b.action] = b.combo
    }
    set('keybindings', JSON.stringify(overrides))
  }

  const capture = (action: string, e: React.KeyboardEvent) => {
    e.preventDefault()
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('ctrl')
    if (e.shiftKey) parts.push('shift')
    if (e.altKey) parts.push('alt')
    const key = e.key.toLowerCase()
    if (['control', 'shift', 'alt', 'meta'].includes(key)) return
    parts.push(key === ' ' ? 'space' : key)
    persist(bindings.map((b) => (b.action === action ? { ...b, combo: parts.join('+') } : b)))
    setCapturing(null)
  }

  const reset = () => {
    set('keybindings', '')
    setBindings([...DEFAULT_KEYBINDINGS])
  }

  return (
    <div>
      <Section title="Keyboard Shortcuts">
        <div className="flex justify-end mb-2">
          <button className="tx-btn-ghost border border-border" onClick={reset}><RotateCcw size={13} /> Reset to defaults</button>
        </div>
        <div className="rounded-input border border-border divide-y divide-border">
          {bindings.map((b) => (
            <div key={b.action} className="flex items-center justify-between px-3 py-2">
              <span className="text-[13px] text-text">{b.label}</span>
              <button
                tabIndex={0}
                onClick={() => setCapturing(b.action)}
                onKeyDown={(e) => capturing === b.action && capture(b.action, e)}
                className={`min-w-[120px] text-center px-2 py-1 rounded-input border text-[12px] font-mono ${
                  capturing === b.action ? 'border-accent text-accent' : 'border-border text-muted hover:text-text'
                }`}
              >
                {capturing === b.action ? 'Press keys…' : b.combo}
              </button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
