import { useSettingsStore } from '@/store/useSettingsStore'
import { cn } from '@/utils/cn'

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
  return (
    <button onClick={() => set(k, String(!value))} className={cn('w-9 h-5 rounded-full relative transition-colors', value ? 'bg-accent' : 'bg-surface-2 border border-border')}>
      <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', value ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
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
  return (
    <select className="tx-input" style={{ width }} value={value} onChange={(e) => set(k, e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
