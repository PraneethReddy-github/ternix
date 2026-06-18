import { useRef, useState } from 'react'
import { TitleBar } from './TitleBar'
import { ActivityBar } from './ActivityBar'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { StatusBar } from './StatusBar'
import { CommandPalette } from './CommandPalette'
import { TerminalArea } from '@/components/terminal/TerminalArea'
import { BroadcastBar } from '@/components/terminal/BroadcastBar'
import { DialogHost } from '@/components/dialogs/DialogHost'
import { GlobalPrompts } from '@/components/terminal/GlobalPrompts'
import { Toast } from './Toast'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { useUiStore } from '@/store/useUiStore'
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts'

export function RootLayout() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const activeView = useUiStore((s) => s.activeView)
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const dragging = useRef(false)

  useGlobalShortcuts()

  const onDragStart = () => {
    dragging.current = true
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setSidebarWidth(Math.min(520, Math.max(180, e.clientX - 48)))
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="h-full flex flex-col bg-bg text-text">
      <TitleBar />
      <div className="flex-1 flex min-h-0">
        <ActivityBar />
        {activeView === 'settings' ? (
          <SettingsPanel />
        ) : (
          <Content collapsed={collapsed} sidebarWidth={sidebarWidth} onDragStart={onDragStart} />
        )}
      </div>
      <StatusBar />
      <BroadcastBar />
      <CommandPalette />
      <DialogHost />
      <GlobalPrompts />
      <Toast />
    </div>
  )
}

function Content({
  collapsed,
  sidebarWidth,
  onDragStart
}: {
  collapsed: boolean
  sidebarWidth: number
  onDragStart: () => void
}) {
  return (
    <>
      {!collapsed && (
        <>
          <div style={{ width: sidebarWidth }} className="shrink-0 min-w-0">
            <Sidebar />
          </div>
          <div className="w-1 cursor-col-resize hover:bg-accent/50 bg-border/40" onMouseDown={onDragStart} />
        </>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <TabBar />
        <div className="flex-1 min-h-0">
          <TerminalArea />
        </div>
      </div>
    </>
  )
}
