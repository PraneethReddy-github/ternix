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
    const toRemote = payload.side === 'local' // upload; else download
    // Names already in the destination — reused across the batch for conflict checks.
    const existing = new Set(
      (toRemote ? await window.ternix.sftp.listDir(tabId, targetDir) : await window.ternix.localfs.listDir(targetDir)).map((e) => e.name)
    )
    for (const entry of payload.entries) {
      try {
        const finalName = await resolveName(existing, entry.name)
        if (!finalName) {
          notify(`Skipped ${entry.name}`, 'info')
          continue
        }
        existing.add(finalName)
        if (toRemote) {
          notify(`Uploading ${entry.name}…`, 'info')
          await window.ternix.sftp.upload(tabId, entry.path, posixJoin(targetDir, finalName))
        } else {
          notify(`Downloading ${entry.name}…`, 'info')
          await window.ternix.sftp.download(tabId, entry.path, localJoin(targetDir, finalName))
        }
      } catch (e: any) {
        notify(e.message, 'error')
      }
    }
    ;(toRemote ? remote : local).refresh()
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

  const contextItems = (entries: SftpEntry[], side: 'local' | 'remote'): MenuItem[] => {
    const pane = side === 'local' ? local : remote
    const single = entries.length === 1 ? entries[0] : null
    const many = entries.length
    const items: MenuItem[] = []
    if (side === 'remote') {
      items.push({ label: single ? 'Download' : `Download ${many} items`, onClick: () => transfer({ side: 'remote', entries }, useSettingsStore.getState().get('transfer.downloadDir') || local.path) })
      if (single) items.push({ label: 'Edit permissions (chmod)', onClick: () => setChmodTarget(single) })
    } else {
      items.push({ label: single ? 'Upload' : `Upload ${many} items`, onClick: () => transfer({ side: 'local', entries }, remote.path) })
      if (single) items.push({ label: 'Open', onClick: () => window.ternix.system.openPath(single.path) })
    }
    if (single) {
      items.push({ label: 'Copy path', onClick: () => { window.ternix.system.writeClipboard(single.path); notify('Path copied', 'success') } })
      items.push({
        label: 'Rename',
        onClick: () => {
          useUiStore.getState().openDialog({
            kind: 'prompt',
            title: 'Rename',
            label: 'New name',
            defaultValue: single.name,
            onSubmit: async (name) => {
              if (!name) return
              const dir = side === 'local' ? single.path.slice(0, single.path.length - single.name.length) : single.path.replace(/[^/]+$/, '')
              const next = side === 'local' ? localJoin(dir, name) : posixJoin(dir.replace(/\/$/, ''), name)
              try {
                if (side === 'local') await window.ternix.localfs.rename(single.path, next)
                else await window.ternix.sftp.rename(tabId, single.path, next)
                pane.refresh()
              } catch (e: any) {
                notify(e.message, 'error')
              }
            }
          })
        }
      })
    }
    items.push({ separator: true })
    items.push({
      label: single ? 'Delete' : `Delete ${many} items`,
      danger: true,
      onClick: () =>
        useUiStore.getState().openDialog({
          kind: 'confirm',
          title: 'Delete',
          message: single ? `Delete "${single.name}"?` : `Delete ${many} items?`,
          danger: true,
          onConfirm: async () => {
            for (const entry of entries) {
              try {
                if (side === 'local') await window.ternix.localfs.delete(entry.path, entry.type === 'directory')
                else await window.ternix.sftp.delete(tabId, entry.path, entry.type === 'directory')
              } catch (e: any) {
                notify(e.message, 'error')
              }
            }
            pane.refresh()
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
