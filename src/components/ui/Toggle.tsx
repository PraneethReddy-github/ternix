import { cn } from '@/utils/cn'

/**
 * The on/off switch, in one place.
 *
 * The knob is positioned against the track's padding box, so anything that changes that box
 * between states — a border on one side of the condition, say — moves the knob with it. The
 * off state is drawn with an inset ring rather than a border for exactly that reason: a ring
 * is a shadow, so it paints the outline without taking part in layout.
 */
export function Toggle({
  checked,
  onChange,
  disabled
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'w-9 h-5 rounded-full relative transition-colors disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-surface-2 ring-1 ring-inset ring-border'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
          checked ? 'left-[18px]' : 'left-0.5'
        )}
      />
    </button>
  )
}
