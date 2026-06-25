import type { Tab } from '@shared/ui'
import { TerminalPane } from './TerminalPane'
import { RemoteDesktopPane } from './RemoteDesktopPane'

/** Gap (px) drawn between panes — the container's border color shows through. */
const GAP = 1

/**
 * Tiles a tab's panes from its rows-of-columns `layout`: rows stack top-to-bottom
 * sharing height equally, and within each row columns share width equally. So a
 * "split down" after a "split right" puts the new pane across the full width
 * below the existing pair, and a further split halves whichever pane is active.
 *
 * Every pane is rendered as a flat, absolutely-positioned, id-keyed sibling — not
 * nested per-row — so changing the layout never moves a pane to a new spot in the
 * React tree. That keeps each TerminalPane mounted (its PTY lives and dies with the
 * component), instead of unmounting and killing the shell on every re-tile.
 */
export function SplitLayout({ tab }: { tab: Tab }) {
  const { panes, layout, activePaneId } = tab

  // Map each pane id → its fractional rectangle in the [0,1] coordinate space.
  const rows = layout.length ? layout : [panes.map((p) => p.id)]
  const rects = new Map<string, { x: number; y: number; w: number; h: number }>()
  rows.forEach((row, r) => {
    row.forEach((id, c) => {
      rects.set(id, { x: c / row.length, y: r / rows.length, w: 1 / row.length, h: 1 / rows.length })
    })
  })

  const gap = panes.length > 1 ? GAP : 0

  return (
    <div className={panes.length > 1 ? 'relative w-full h-full overflow-hidden bg-border' : 'relative w-full h-full'}>
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
    </div>
  )
}
