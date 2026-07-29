import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface SelectOption {
  value: string
  label: string
  /** Per-option styling, e.g. the font picker previewing each row in its own face. */
  style?: CSSProperties
}

/** Rows are ~30px; this is only used to guess whether the list should open upwards. */
const ROW_H = 30
const MAX_H = 256

/**
 * The app's dropdown, replacing the native <select> everywhere.
 *
 * The list renders through a portal at a fixed position rather than inside the trigger's
 * own box. A native select's popup is drawn by the OS and so escapes any container; an
 * in-flow div does not, and would be clipped by the settings panel's scroller or cut off at
 * the edge of a dialog. Portalling keeps that behaviour while letting the list look like the
 * rest of Ternix. Focus deliberately stays on the trigger, so opening one inside a modal
 * cannot disturb whatever the modal had focused.
 */
export function Select({
  value,
  onChange,
  options,
  className,
  width,
  disabled,
  placeholder = 'Select…'
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  className?: string
  width?: number
  disabled?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number; up: boolean } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null

  const place = () => {
    const el = trigger.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const wanted = Math.min(options.length * ROW_H + 8, MAX_H)
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    // Open upwards only when below genuinely cannot hold the list and above can hold more.
    const up = below < wanted && above > below
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)),
      top: up ? Math.max(8, r.top - Math.min(wanted, above) - 4) : r.bottom + 4,
      width: r.width,
      maxHeight: Math.min(MAX_H, up ? above : below),
      up
    })
  }

  useLayoutEffect(() => {
    if (open) place()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useLayoutEffect(() => {
    const el = list.current
    if (!open || !el || !pos) return
    // offsetHeight, not a client rect: the open animation scales the box, and a rect would
    // report that scaled height rather than the real one.
    const clamped = Math.max(8, Math.min(pos.top, window.innerHeight - el.offsetHeight - 8))
    if (Math.abs(clamped - pos.top) > 1) setPos({ ...pos, top: clamped })
  }, [open, pos])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (trigger.current?.contains(e.target as Node) || list.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    const onMove = (e: Event) => {
      if (e.type === 'scroll' && list.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  /**
   * Keep the highlighted row visible by scrolling the list itself.
   *
   * Not scrollIntoView: when the row is already visible it does nothing, but when it is not
   * it walks up and scrolls whatever ancestor it must — the dialog, the page — and that
   * scroll is exactly what the handler below treats as "the trigger moved, close". Hovering
   * a row could therefore shut the list. Moving our own scrollTop touches nothing else.
   */
  useLayoutEffect(() => {
    const el = list.current
    const row = el?.children[active] as HTMLElement | undefined
    if (!open || !el || !row) return
    if (row.offsetTop < el.scrollTop) el.scrollTop = row.offsetTop
    else if (row.offsetTop + row.offsetHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = row.offsetTop + row.offsetHeight - el.clientHeight
    }
  }, [open, active])

  const choose = (v: string) => {
    onChange(v)
    setOpen(false)
    trigger.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive(Math.max(0, selectedIndex))
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[active]) choose(options[active].value) }
    else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        style={width ? { width } : undefined}
        className={cn('tx-input flex items-center justify-between gap-2 text-left disabled:opacity-50', className)}
        onClick={() => {
          setActive(Math.max(0, selectedIndex))
          setOpen((v) => !v)
        }}
        onKeyDown={onKeyDown}
      >
        <span className={cn('truncate', !selected && 'text-muted')} style={selected?.style}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={13} className={cn('text-muted shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && pos &&
        createPortal(
          <div
            ref={list}
            role="listbox"
            className="tx-pop fixed z-[100] overflow-y-auto bg-surface-2 border border-border rounded-input py-1 shadow-2xl"
            style={{
              left: pos.left,
              top: pos.top,
              width: pos.width,
              maxHeight: pos.maxHeight,
              transformOrigin: pos.up ? 'bottom center' : 'top center'
            }}
            // A portal still bubbles through the React tree, so without this a click here
            // would reach the dialog backdrop's handler and close the dialog.
            onMouseDown={(e) => e.stopPropagation()}
          >
            {options.map((o, i) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] text-text transition-colors',
                  i === active && 'bg-border'
                )}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
              >
                <span className="w-3.5 shrink-0">
                  {o.value === value && <Check size={13} className="text-accent" />}
                </span>
                <span className="truncate" style={o.style}>{o.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}
