import { useUiStore } from '@/store/useUiStore'
import { SessionTree } from '@/components/sidebar/SessionTree'
import { SnippetsPanel } from '@/components/sidebar/SnippetsPanel'
import { TunnelsPanel } from '@/components/sidebar/TunnelsPanel'
import { RecordingsPanel } from '@/components/sidebar/RecordingsPanel'
import { SearchPanel } from '@/components/sidebar/SearchPanel'
import { SftpSidebar } from '@/components/sidebar/SftpSidebar'

export function Sidebar() {
  const view = useUiStore((s) => s.activeView)

  return (
    <div className="h-full bg-surface border-r border-border flex flex-col min-h-0">
      {view === 'sessions' && <SessionTree />}
      {view === 'sftp' && <SftpSidebar />}
      {view === 'snippets' && <SnippetsPanel />}
      {view === 'tunnels' && <TunnelsPanel />}
      {view === 'recordings' && <RecordingsPanel />}
      {view === 'search' && <SearchPanel />}
    </div>
  )
}

export function PanelHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="h-9 flex items-center justify-between px-3 border-b border-border shrink-0">
      <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">{title}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  )
}
