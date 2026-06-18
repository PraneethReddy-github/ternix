import type { Tab } from '@shared/ui'
import { TerminalPane } from './TerminalPane'
import { cn } from '@/utils/cn'

/** Arranges a tab's 1–4 panes in single / horizontal / vertical / 2×2-grid layouts. */
export function SplitLayout({ tab }: { tab: Tab }) {
  const { panes, layout, activePaneId } = tab

  if (panes.length === 1) {
    return <TerminalPane tab={tab} pane={panes[0]} active />
  }

  const containerClass =
    layout === 'h'
      ? 'grid grid-cols-2 gap-px bg-border'
      : layout === 'v'
        ? 'grid grid-rows-2 gap-px bg-border'
        : 'grid grid-cols-2 grid-rows-2 gap-px bg-border'

  return (
    <div className={cn('w-full h-full', containerClass)}>
      {panes.map((pane) => (
        <div key={pane.id} className="min-w-0 min-h-0 bg-bg">
          <TerminalPane tab={tab} pane={pane} active={pane.id === activePaneId} />
        </div>
      ))}
    </div>
  )
}
