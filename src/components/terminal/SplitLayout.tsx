import { useRef } from 'react'
import type { Tab } from '@shared/ui'
import { useTabStore } from '@/store/useTabStore'
import { TerminalPane } from './TerminalPane'
import { RemoteDesktopPane } from './RemoteDesktopPane'

/** Gap (px) drawn between panes — the container's border color shows through. */
const GAP = 1
/** A pane can never be dragged below this fraction of the tab, so it can't be closed by resizing. */
const MIN_FR = 0.15

/** Equal shares when the tab has no stored (or a stale-length) size array. */
const shares = (fr: number[] | undefined, n: number) =>
  fr && fr.length === n ? fr : Array.from({ length: n }, () => 1 / n)

/** Running start offsets for a list of fractions. */
const offsets = (fr: number[]) => fr.map((_, i) => fr.slice(0, i).reduce((a, b) => a + b, 0))

/**
 * Tiles a tab's panes from its rows-of-columns `layout`: rows stack top-to-bottom,
 * and within each row columns sit left-to-right. Sizes come from the tab's `rowFr` /
 * `colFr` fractions (equal shares until the user drags a divider), so a "split down"
 * after a "split right" puts the new pane across the full width below the existing pair.
 *
 * Every pane is rendered as a flat, absolutely-positioned, id-keyed sibling — not
 * nested per-row — so changing the layout never moves a pane to a new spot in the
 * React tree. That keeps each TerminalPane mounted (its PTY lives and dies with the
 * component), instead of unmounting and killing the shell on every re-tile.
 */
export function SplitLayout({ tab }: { tab: Tab }) {
  const { panes, layout, activePaneId } = tab
  const setPaneFr = useTabStore((s) => s.setPaneFr)
  const boxRef = useRef<HTMLDivElement>(null)

  const rows = layout.length ? layout : [panes.map((p) => p.id)]
  const rowFr = shares(tab.rowFr, rows.length)
  const colFr = rows.map((row, r) => shares(tab.colFr?.[r], row.length))
  const rowAt = offsets(rowFr)

  // Map each pane id → its fractional rectangle in the [0,1] coordinate space.
  const rects = new Map<string, { x: number; y: number; w: number; h: number }>()
  rows.forEach((row, r) => {
    const colAt = offsets(colFr[r])
    row.forEach((id, c) => {
      rects.set(id, { x: colAt[c], y: rowAt[r], w: colFr[r][c], h: rowFr[r] })
    })
  })

  const gap = panes.length > 1 ? GAP : 0

  /**
   * Drag a divider: the two neighbouring fractions trade size, each clamped to MIN_FR
   * so neither pane can be squeezed away. `i` is the index of the pane after the divider.
   */
  const startDrag = (axis: 'x' | 'y', fr: number[], i: number, commit: (next: number[]) => void) => (e: React.MouseEvent) => {
    e.preventDefault()
    const box = boxRef.current?.getBoundingClientRect()
    if (!box) return
    const span = axis === 'x' ? box.width : box.height
    const start = axis === 'x' ? e.clientX : e.clientY
    const a = fr[i - 1]
    const b = fr[i]
    const total = a + b

    const onMove = (ev: MouseEvent) => {
      const delta = ((axis === 'x' ? ev.clientX : ev.clientY) - start) / span
      const next = [...fr]
      next[i - 1] = Math.min(total - MIN_FR, Math.max(MIN_FR, a + delta))
      next[i] = total - next[i - 1]
      commit(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const setRows = (next: number[]) => setPaneFr(tab.id, { rowFr: next })
  const setCols = (r: number) => (next: number[]) => setPaneFr(tab.id, { colFr: colFr.map((row, i) => (i === r ? next : row)) })

  return (
    <div ref={boxRef} className={panes.length > 1 ? 'relative w-full h-full overflow-hidden bg-border' : 'relative w-full h-full'}>
      {panes.map((pane) => {
        const rect = rects.get(pane.id)
        if (!rect) return null
        // Half-gap inset on each edge → uniform GAP-px spacing between panes.
        const style: React.CSSProperties = {
          position: 'absolute',
          left: `calc(${rect.x * 100}% + ${gap / 2}px)`,
          top: `calc(${rect.y * 100}% + ${gap / 2}px)`,
          width: `calc(${rect.w * 100}% - ${gap}px)`,
          height: `calc(${rect.h * 100}% - ${gap}px)`
        }
        const isRemoteDesktop = pane.protocol === 'rdp' || pane.protocol === 'vnc'
        return (
          <div key={pane.id} className="min-w-0 min-h-0 bg-bg" style={style}>
            {isRemoteDesktop ? (
              <RemoteDesktopPane tab={tab} pane={pane} active={pane.id === activePaneId} />
            ) : (
              <TerminalPane tab={tab} pane={pane} active={pane.id === activePaneId} />
            )}
          </div>
        )
      })}

      {/* Row dividers (drag to resize vertically). */}
      {rows.map((_, r) =>
        r === 0 ? null : (
          <div
            key={`r${r}`}
            className="absolute left-0 right-0 h-[5px] -mt-[2px] z-10 cursor-row-resize hover:bg-accent/50 transition-colors"
            style={{ top: `${rowAt[r] * 100}%` }}
            onMouseDown={startDrag('y', rowFr, r, setRows)}
          />
        )
      )}

      {/* Column dividers, one set per row (drag to resize horizontally). */}
      {rows.map((row, r) =>
        offsets(colFr[r]).map((x, c) =>
          c === 0 ? null : (
            <div
              key={`c${r}-${c}`}
              className="absolute w-[5px] -ml-[2px] z-10 cursor-col-resize hover:bg-accent/50 transition-colors"
              style={{ left: `${x * 100}%`, top: `${rowAt[r] * 100}%`, height: `${rowFr[r] * 100}%` }}
              onMouseDown={startDrag('x', colFr[r], c, setCols(r))}
            />
          )
        )
      )}
    </div>
  )
}
