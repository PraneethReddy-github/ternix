import { Power, FolderUp, Plug, Circle, Radio, SplitSquareHorizontal, SplitSquareVertical } from 'lucide-react'
import type { Pane, Tab } from '@shared/ui'
import { useTabStore } from '@/store/useTabStore'
import { useUiStore } from '@/store/useUiStore'
import { ProtocolIcon } from '@/components/sidebar/ProtocolIcon'
import { cn } from '@/utils/cn'

export function TerminalToolbar({ tab, pane }: { tab: Tab; pane: Pane }) {
  const toggleSftp = useUiStore((s) => s.toggleSftp)
  const setView = useUiStore((s) => s.setView)
  const splitPane = useTabStore((s) => s.splitPane)
  const closePane = useTabStore((s) => s.closePane)
  const toggleBroadcast = useTabStore((s) => s.toggleBroadcast)
  const setPaneRecording = useTabStore((s) => s.setPaneRecording)
  const notify = useUiStore((s) => s.notify)

  const toggleRecord = async () => {
    try {
      if (pane.recording) {
        await window.ternix.recordings.stop(pane.id)
        setPaneRecording(pane.id, false)
      } else {
        await window.ternix.recordings.start(pane.id, pane.sessionId, pane.title)
        setPaneRecording(pane.id, true)
      }
    } catch (e: any) {
      notify(e.message, 'error')
    }
  }

  const isSsh = pane.protocol === 'ssh'

  return (
    <div className="h-8 flex items-center gap-1 px-2 bg-surface border-b border-border text-[12px] shrink-0">
      <ProtocolIcon protocol={pane.protocol} size={13} />
      <span className="text-text font-medium">{pane.title}</span>
      {pane.host && <span className="text-muted">· {pane.host}</span>}
      <div className="flex-1" />
      <ToolBtn title="Disconnect" onClick={() => closePane(tab.id, pane.id)}>
        <Power size={14} />
      </ToolBtn>
      {isSsh && (
        <ToolBtn title="Open SFTP" onClick={toggleSftp}>
          <FolderUp size={14} />
        </ToolBtn>
      )}
      {isSsh && (
        <ToolBtn title="Tunnels" onClick={() => setView('tunnels')}>
          <Plug size={14} />
        </ToolBtn>
      )}
      <ToolBtn title={pane.recording ? 'Stop recording' : 'Record session'} onClick={toggleRecord}>
        <Circle size={14} className={cn(pane.recording && 'fill-danger text-danger tx-pulse')} />
      </ToolBtn>
      <ToolBtn title="Toggle broadcast" active={tab.broadcast} onClick={() => toggleBroadcast(tab.id)}>
        <Radio size={14} />
      </ToolBtn>
      <ToolBtn title="Split right" onClick={() => splitPane(tab.id, 'h')}>
        <SplitSquareHorizontal size={14} />
      </ToolBtn>
      <ToolBtn title="Split down" onClick={() => splitPane(tab.id, 'v')}>
        <SplitSquareVertical size={14} />
      </ToolBtn>
    </div>
  )
}

function ToolBtn({ children, title, onClick, active }: { children: React.ReactNode; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn('p-1.5 rounded-input hover:bg-surface-2', active ? 'text-warning' : 'text-muted hover:text-text')}
    >
      {children}
    </button>
  )
}
