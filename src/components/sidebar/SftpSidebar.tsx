import { FolderUp, Server } from 'lucide-react'
import { useTabStore } from '@/store/useTabStore'
import { useUiStore } from '@/store/useUiStore'
import { PanelHeader } from '@/components/layout/Sidebar'
import { TransferQueue } from './TransferQueue'
import { ProtocolIcon } from './ProtocolIcon'

/** SFTP sidebar: pick an SSH connection to browse and watch the transfer queue. */
export function SftpSidebar() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const sftpOpen = useUiStore((s) => s.sftpOpen)
  const toggleSftp = useUiStore((s) => s.toggleSftp)

  const sshPanes = tabs
    .map((t) => ({ tab: t, pane: t.panes.find((p) => p.protocol === 'ssh' && p.state === 'connected') }))
    .filter((x) => x.pane)

  return (
    <div className="flex flex-col h-full min-h-0">
      <PanelHeader title="SFTP">
        <button className="text-muted hover:text-text" title="Toggle file manager" onClick={toggleSftp}>
          <FolderUp size={15} />
        </button>
      </PanelHeader>

      <div className="p-2 border-b border-border">
        <div className="text-[10px] uppercase text-muted mb-1">SSH connections</div>
        {sshPanes.length === 0 && <div className="text-[11px] text-muted py-2">No active SSH sessions.</div>}
        {sshPanes.map(({ tab }) => (
          <button
            key={tab.id}
            className={`w-full flex items-center gap-2 px-2 py-1 rounded-input text-left ${tab.id === activeTabId ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
            onClick={() => {
              setActiveTab(tab.id)
              if (!sftpOpen) toggleSftp()
            }}
          >
            <ProtocolIcon protocol="ssh" size={13} />
            <span className="text-[12px] truncate">{tab.title}</span>
          </button>
        ))}
        {!sftpOpen && sshPanes.length > 0 && (
          <button className="mt-2 w-full tx-btn-ghost border border-border justify-center" onClick={toggleSftp}>
            <Server size={13} /> Open file manager
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        <TransferQueue fill />
      </div>
    </div>
  )
}
