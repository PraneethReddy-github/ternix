import { useState } from 'react'
import { X, ServerOff } from 'lucide-react'
import type { SftpEntry } from '@shared/index'
import type { MenuItem } from '@/components/ui/ContextMenu'
import { useTabStore } from '@/store/useTabStore'
import { useUiStore } from '@/store/useUiStore'
import { usePane } from '@/hooks/useSftp'
import { FileList, type DragPayload } from './FileList'
import { PermissionsEditor } from './PermissionsEditor'
import { TransferQueue } from '@/components/sidebar/TransferQueue'
import { posixJoin, localJoin } from '@/utils/path'

export function SftpPanel() {
  const toggleSftp = useUiStore((s) => s.toggleSftp)
  const notify = useUiStore((s) => s.notify)
  const tabId = useTabStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    const pane = tab?.panes.find((p) => p.protocol === 'ssh' && p.state === 'connected')
    return pane?.id ?? null
  })

  const local = usePane('local', null)
  const remote = usePane('remote', tabId)
  const [chmodTarget, setChmodTarget] = useState<SftpEntry | null>(null)

  if (!tabId) {
    return (
      <div className="h-full bg-surface flex flex-col">
        <Header onClose={toggleSftp} />
        <div className="flex-1 flex flex-col items-center justify-center text-muted gap-2">
          <ServerOff size={32} className="text-border" />
          <div className="text-[13px]">Connect to an SSH session to browse files.</div>
        </div>
      </div>
    )
  }

  const transfer = async (payload: DragPayload, targetDir: string) => {
    try {
      if (payload.side === 'local') {
        // local → remote (upload)
        const dest = posixJoin(targetDir, payload.entry.name)
        notify(`Uploading ${payload.entry.name}…`, 'info')
        await window.ternix.sftp.upload(tabId, payload.entry.path, dest)
        remote.refresh()
      } else {
        // remote → local (download)
        const dest = localJoin(targetDir, payload.entry.name)
        notify(`Downloading ${payload.entry.name}…`, 'info')
        await window.ternix.sftp.download(tabId, payload.entry.path, dest)
        local.refresh()
      }
    } catch (e: any) {
      notify(e.message, 'error')
    }
  }

  const openEntry = (side: 'local' | 'remote') => (entry: SftpEntry) => {
    if (entry.type === 'directory') (side === 'local' ? local : remote).list(entry.path)
    else if (side === 'local') window.ternix.system.openPath(entry.path)
    else downloadAndOpen(entry)
  }

  const downloadAndOpen = async (entry: SftpEntry) => {
    const tmp = localJoin(local.path, entry.name)
    try {
      await window.ternix.sftp.download(tabId, entry.path, tmp)
      window.ternix.system.openPath(tmp)
    } catch (e: any) {
      notify(e.message, 'error')
    }
  }

  const mkdir = (side: 'local' | 'remote') => async () => {
    const name = window.prompt('New folder name')
    if (!name) return
    const pane = side === 'local' ? local : remote
    const target = side === 'local' ? localJoin(pane.path, name) : posixJoin(pane.path, name)
    try {
      if (side === 'local') await window.ternix.localfs.mkdir(target)
      else await window.ternix.sftp.mkdir(tabId, target)
      pane.refresh()
    } catch (e: any) {
      notify(e.message, 'error')
    }
  }

  const contextItems = (entry: SftpEntry, side: 'local' | 'remote'): MenuItem[] => {
    const pane = side === 'local' ? local : remote
    const items: MenuItem[] = []
    if (side === 'remote') {
      items.push({ label: 'Download', onClick: () => transfer({ side: 'remote', entry }, local.path) })
      items.push({ label: 'Edit permissions (chmod)', onClick: () => setChmodTarget(entry) })
    } else {
      items.push({ label: 'Upload', onClick: () => transfer({ side: 'local', entry }, remote.path) })
      items.push({ label: 'Open', onClick: () => window.ternix.system.openPath(entry.path) })
    }
    items.push({ label: 'Copy path', onClick: () => { window.ternix.system.writeClipboard(entry.path); notify('Path copied', 'success') } })
    items.push({
      label: 'Rename',
      onClick: async () => {
        const name = window.prompt('Rename to', entry.name)
        if (!name) return
        const dir = side === 'local' ? entry.path.slice(0, entry.path.length - entry.name.length) : entry.path.replace(/[^/]+$/, '')
        const next = side === 'local' ? localJoin(dir, name) : posixJoin(dir.replace(/\/$/, ''), name)
        try {
          if (side === 'local') await window.ternix.localfs.rename(entry.path, next)
          else await window.ternix.sftp.rename(tabId, entry.path, next)
          pane.refresh()
        } catch (e: any) {
          notify(e.message, 'error')
        }
      }
    })
    items.push({ separator: true })
    items.push({
      label: 'Delete',
      danger: true,
      onClick: () =>
        useUiStore.getState().openDialog({
          kind: 'confirm',
          title: 'Delete',
          message: `Delete "${entry.name}"?`,
          danger: true,
          onConfirm: async () => {
            try {
              if (side === 'local') await window.ternix.localfs.delete(entry.path, entry.type === 'directory')
              else await window.ternix.sftp.delete(tabId, entry.path, entry.type === 'directory')
              pane.refresh()
            } catch (e: any) {
              notify(e.message, 'error')
            }
          }
        })
    })
    return items
  }

  return (
    <div className="h-full bg-surface flex flex-col min-h-0">
      <Header onClose={toggleSftp} />
      <div className="flex-1 flex min-h-0">
        <FileList title="Local" side="local" pane={local} onOpenEntry={openEntry('local')} onMkdir={mkdir('local')} onDropTransfer={transfer} contextItems={contextItems} />
        <FileList title="Remote" side="remote" pane={remote} onOpenEntry={openEntry('remote')} onMkdir={mkdir('remote')} onDropTransfer={transfer} contextItems={contextItems} />
      </div>
      <div className="border-t border-border max-h-56 overflow-hidden">
        <TransferQueue />
      </div>
      {chmodTarget && (
        <PermissionsEditor
          initialMode={chmodTarget.mode}
          name={chmodTarget.name}
          onClose={() => setChmodTarget(null)}
          onApply={async (mode) => {
            try {
              await window.ternix.sftp.chmod(tabId, chmodTarget.path, mode)
              remote.refresh()
              notify('Permissions updated', 'success')
            } catch (e: any) {
              notify(e.message, 'error')
            }
          }}
        />
      )}
    </div>
  )
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="h-8 flex items-center justify-between px-3 border-b border-border bg-bg shrink-0">
      <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">SFTP File Manager</span>
      <button className="text-muted hover:text-text" onClick={onClose}><X size={14} /></button>
    </div>
  )
}
