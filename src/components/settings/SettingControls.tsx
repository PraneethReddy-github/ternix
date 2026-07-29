import { useSettingsStore } from '@/store/useSettingsStore'
import { Toggle } from '@/components/ui/Toggle'
import { Select } from '@/components/ui/Select'

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="text-[13px] font-semibold text-text mb-3 uppercase tracking-wide">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] text-text">{label}</div>
        {hint && <div className="text-[11px] text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function ToggleSetting({ k }: { k: string }) {
  const value = useSettingsStore((s) => s.getBool(k))
  const set = useSettingsStore((s) => s.set)
  return <Toggle checked={value} onChange={(next) => set(k, String(next))} />
}

export function TextSetting({ k, placeholder, width = 240 }: { k: string; placeholder?: string; width?: number }) {
  const value = useSettingsStore((s) => s.get(k))
  const set = useSettingsStore((s) => s.set)
  return <input className="tx-input" style={{ width }} value={value} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />
}

export function NumberSetting({ k, min, max, width = 100 }: { k: string; min?: number; max?: number; width?: number }) {
  const value = useSettingsStore((s) => s.get(k))
  const set = useSettingsStore((s) => s.set)
  return <input type="number" className="tx-input" style={{ width }} min={min} max={max} value={value} onChange={(e) => set(k, e.target.value)} />
}

export function SelectSetting({ k, options, width = 200 }: { k: string; options: { value: string; label: string }[]; width?: number }) {
  const value = useSettingsStore((s) => s.get(k))
  const set = useSettingsStore((s) => s.set)
  return <Select value={value} onChange={(v) => set(k, v)} options={options} width={width} />
}
