import { ReactNode, useEffect, useRef, useState } from 'react'

export interface MenuItem {
  label?: string
  icon?: ReactNode
  onClick?: () => void
  danger?: boolean
  separator?: boolean
  disabled?: boolean
}

interface ContextMenuState {
  x: number
  y: number
  items: MenuItem[]
}

/** Hook returning an onContextMenu handler + the menu element to render. */
export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  const open = (e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  const element = menu ? <ContextMenuView {...menu} onClose={() => setMenu(null)} /> : null
  return { open, element, close: () => setMenu(null) }
}

function ContextMenuView({ x, y, items, onClose }: ContextMenuState & { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.min(x, window.innerWidth - r.width - 8),
      y: Math.min(y, window.innerHeight - r.height - 8)
    })
  }, [x, y])

  return (
    <div
      ref={ref}
      className="fixed z-[60] min-w-[180px] bg-surface-2 border border-border rounded-input py-1 shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="my-1 border-t border-border" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] disabled:opacity-40 hover:bg-accent/15 ${
              item.danger ? 'text-danger' : 'text-text'
            }`}
            onClick={() => {
              item.onClick?.()
              onClose()
            }}
          >
            {item.icon && <span className="w-4 flex items-center">{item.icon}</span>}
            {item.label}
          </button>
        )
      )}
    </div>
  )
}
