import { useSettingsStore } from '@/store/useSettingsStore'
import { Select } from '@/components/ui/Select'

/**
 * The terminal font, as a dropdown built from the app's own menu styling rather than a
 * native <select> — which lets every entry preview itself in its own face, the one thing
 * that actually helps when picking a font.
 *
 * Order follows the old default stack — JetBrains Mono, Fira Code, Cascadia Code, Consolas —
 * so the fonts Ternix has always leaned on are the ones at the top. The first three of those
 * now ship with the app (see the @font-face imports in index.css) and so exist everywhere;
 * Consolas and everything below it come from the machine, and their values keep a monospace
 * fallback so a font this computer lacks renders as system monospace rather than nothing.
 */
const FONTS: { label: string; value: string }[] = [
  // Bundled with Ternix — always available.
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { label: 'Fira Code', value: "'Fira Code', monospace" },
  { label: 'Cascadia Code', value: "'Cascadia Code', monospace" },
  { label: 'IBM Plex Mono', value: "'IBM Plex Mono', monospace" },
  // From the machine.
  { label: 'Consolas', value: 'Consolas, monospace' },
  { label: 'Cascadia Mono', value: "'Cascadia Mono', monospace" },
  { label: 'SF Mono', value: "'SF Mono', monospace" },
  { label: 'Menlo', value: 'Menlo, monospace' },
  { label: 'Monaco', value: 'Monaco, monospace' },
  { label: 'Source Code Pro', value: "'Source Code Pro', monospace" },
  { label: 'Roboto Mono', value: "'Roboto Mono', monospace" },
  { label: 'Ubuntu Mono', value: "'Ubuntu Mono', monospace" },
  { label: 'DejaVu Sans Mono', value: "'DejaVu Sans Mono', monospace" },
  { label: 'Liberation Mono', value: "'Liberation Mono', monospace" },
  { label: 'Courier New', value: "'Courier New', monospace" },
  { label: 'System monospace', value: 'monospace' }
]

/** The family name inside a stack — used to name a value that came from an older version. */
function firstFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '')
}

export function FontPicker() {
  const value = useSettingsStore((s) => s.get('appearance.fontFamily'))
  const set = useSettingsStore((s) => s.set)

  // A stack saved before this was a dropdown stays in the list, or the control would look
  // like it had reset the setting on its own.
  const known = FONTS.some((f) => f.value === value)
  const options = (known ? FONTS : [{ label: `${firstFamily(value) || 'Custom'} (custom)`, value }, ...FONTS])
    // Every row wears its own font: the sample is the whole point of this control.
    .map((o) => ({ ...o, style: { fontFamily: o.value } }))

  return <Select value={value} onChange={(v) => set('appearance.fontFamily', v)} options={options} width={280} />
}
