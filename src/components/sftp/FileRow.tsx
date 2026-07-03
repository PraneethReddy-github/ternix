import { Folder, File, FileCode, FileArchive, FileImage, FileText, Link } from 'lucide-react'
import type { SftpEntry } from '@shared/index'
import { formatBytes } from '@/utils/formatBytes'
import { cn } from '@/utils/cn'

function iconFor(entry: SftpEntry) {
  if (entry.type === 'directory') return <Folder size={14} className="text-accent" />
  if (entry.type === 'symlink') return <Link size={14} className="text-cyan-400" />
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) return <FileImage size={14} className="text-magenta-400" />
  if (['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar'].includes(ext)) return <FileArchive size={14} className="text-warning" />
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'c', 'cpp', 'sh', 'json', 'yml', 'yaml', 'html', 'css'].includes(ext)) return <FileCode size={14} className="text-green-400" />
  if (['txt', 'md', 'log', 'conf', 'cfg', 'ini'].includes(ext)) return <FileText size={14} className="text-muted" />
  return <File size={14} className="text-muted" />
}

export function FileRow({
  entry,
  selected,
  onOpen,
  onSelect,
  onContext,
  onDragStart
}: {
  entry: SftpEntry
  selected: boolean
  onOpen: () => void
  onSelect: (e: React.MouseEvent) => void
  onContext: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
}) {
  return (
    <tr
      draggable
      onDragStart={onDragStart}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onContextMenu={onContext}
      className={cn('cursor-pointer select-none', selected ? 'bg-accent/20' : 'hover:bg-surface-2')}
    >
      <td className="py-1 pl-2 flex items-center gap-2 truncate">
        {iconFor(entry)}
        <span className="text-[12px] text-text truncate">{entry.name}</span>
      </td>
      <td className="py-1 text-[11px] text-muted text-right pr-3 tabular-nums whitespace-nowrap">{entry.type === 'directory' ? '' : formatBytes(entry.size)}</td>
      <td className="py-1 text-[11px] text-muted font-mono whitespace-nowrap">{entry.permissions}</td>
      <td className="py-1 text-[11px] text-muted pr-2 truncate whitespace-nowrap">
        {entry.modified
          ? new Date(entry.modified).toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
          : ''}
      </td>
    </tr>
  )
}
