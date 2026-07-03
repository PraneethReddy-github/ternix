import { useState } from 'react'
import { X, ServerOff } from 'lucide-react'
import type { SftpEntry } from '@shared/index'
import type { MenuItem } from '@/components/ui/ContextMenu'
import { useTabStore } from '@/store/useTabStore'
import { useUiStore } from '@/store/useUiStore'
import { useSettingsStore } from '@/store/useSettingsStore'
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

  // Apply transfer.conflict when the destination already contains `name`.
  // Returns the name to write as, or null to skip the file.
  const resolveName = async (existing: Set<string>, name: string): Promise<string | null> => {
    if (!existing.has(name)) return name
    const policy = useSettingsStore.getState().get('transfer.conflict')
    if (policy === 'overwrite') return name
    if (policy === 'skip') return null
    if (policy === 'rename') {
      const dot = name.lastIndexOf('.')
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      let i = 1
      while (existing.has(`${stem} (${i})${ext}`)) i++
      return `${stem} (${i})${ext}`
    }
    // prompt
    return new Promise((res) => {
      useUiStore.getState().openDialog({
        kind: 'confirm',
        title: 'File already exists',
        message: `"${name}" already exists in the destination. Overwrite it?`,
        onConfirm: () => res(name),
        onCancel: () => res(null)
      })
    })
  }

  const transfer = async (payload: DragPayload, targetDir: string) => {
    try {
      if (payload.side === 'local') {
        // local → remote (upload)
        const existing = new Set((await window.ternix.sftp.listDir(tabId, targetDir)).map((e) => e.name))
        const finalName = await resolveName(existing, payload.entry.name)
        if (!finalName) return notify(`Skipped ${payload.entry.name}`, 'info')
        notify(`Uploading ${payload.entry.name}…`, 'info')
        await window.ternix.sftp.upload(tabId, payload.entry.path, posixJoin(targetDir, finalName))
        remote.refresh()
      } else {
        // remote → local (download)
        const existing = new Set((await window.ternix.localfs.listDir(targetDir)).map((e) => e.name))
        const finalName = await resolveName(existing, payload.entry.name)
        if (!finalName) return notify(`Skipped ${payload.entry.name}`, 'info')
        notify(`Downloading ${payload.entry.name}…`, 'info')
        await window.ternix.sftp.download(tabId, payload.entry.path, localJoin(targetDir, finalName))
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

  const mkdir = (side: 'local' | 'remote') => () => {
    useUiStore.getState().openDialog({
      kind: 'prompt',
      title: 'New folder',
      label: 'Folder name',
      onSubmit: async (name) => {
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
    })
  }

  const contextItems = (entry: SftpEntry, side: 'local' | 'remote'): MenuItem[] => {
    const pane = side === 'local' ? local : remote
    const items: MenuItem[] = []
    if (side === 'remote') {
      items.push({ label: 'Download', onClick: () => transfer({ side: 'remote', entry }, useSettingsStore.getState().get('transfer.downloadDir') || local.path) })
      items.push({ label: 'Edit permissions (chmod)', onClick: () => setChmodTarget(entry) })
    } else {
      items.push({ label: 'Upload', onClick: () => transfer({ side: 'local', entry }, remote.path) })
      items.push({ label: 'Open', onClick: () => window.ternix.system.openPath(entry.path) })
    }
    items.push({ label: 'Copy path', onClick: () => { window.ternix.system.writeClipboard(entry.path); notify('Path copied', 'success') } })
    items.push({
      label: 'Rename',
      onClick: () => {
        useUiStore.getState().openDialog({
          kind: 'prompt',
          title: 'Rename',
          label: 'New name',
          defaultValue: entry.name,
          onSubmit: async (name) => {
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
    <div className="h-full bg-surface flex flex-col min-h-0 overflow-hidden">
      <Header onClose={toggleSftp} />
      {/* Vertical stack: LOCAL on top, REMOTE below, each with its own scroller */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <FileList title="Local" side="local" pane={local} onOpenEntry={openEntry('local')} onMkdir={mkdir('local')} onDropTransfer={transfer} contextItems={contextItems} />
        <div className="h-px bg-border shrink-0" />
        <FileList title="Remote" side="remote" pane={remote} onOpenEntry={openEntry('remote')} onMkdir={mkdir('remote')} onDropTransfer={transfer} contextItems={contextItems} />
      </div>
      <div className="border-t border-border shrink-0">
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
