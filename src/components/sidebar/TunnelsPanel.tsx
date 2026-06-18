import { useEffect, useState } from 'react'
import { Plug, Square, RotateCw, Copy } from 'lucide-react'
import type { ActiveTunnel } from '@shared/index'
import { useUiStore } from '@/store/useUiStore'
import { useContextMenu } from '@/components/ui/ContextMenu'
import { PanelHeader } from '@/components/layout/Sidebar'
import { formatBytes } from '@/utils/formatBytes'
import { cn } from '@/utils/cn'

const TYPE_LABEL: Record<string, string> = { local: '-L', remote: '-R', dynamic: '-D' }

export function TunnelsPanel() {
  const [tunnels, setTunnels] = useState<ActiveTunnel[]>([])
  const notify = useUiStore((s) => s.notify)
  const { open, element } = useContextMenu()

  useEffect(() => {
    window.ternix.tunnels.listActive().then(setTunnels)
    return window.ternix.tunnels.onUpdate(setTunnels)
  }, [])

  return (
    <div className="flex flex-col h-full min-h-0">
      <PanelHeader title="Active Tunnels" />
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {tunnels.map((t) => (
          <div
            key={t.id}
            onContextMenu={(e) =>
              open(e, [
                t.tunnel_type === 'dynamic'
                  ? { label: 'Copy SOCKS address', icon: <Copy size={13} />, onClick: () => { window.ternix.system.writeClipboard(`socks5://${t.local_host}:${t.local_port}`); notify('Copied', 'success') } }
                  : { label: 'Copy local address', icon: <Copy size={13} />, onClick: () => { window.ternix.system.writeClipboard(`${t.local_host}:${t.local_port}`); notify('Copied', 'success') } },
                { label: 'Stop', icon: <Square size={13} />, onClick: () => window.ternix.tunnels.stop(t.id) },
                { label: 'Restart', icon: <RotateCw size={13} />, onClick: () => t.tabId && window.ternix.tunnels.start(t.id, t.tabId) }
              ])
            }
            className="rounded-input border border-border p-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-1 rounded bg-surface-2 text-accent font-mono">{TYPE_LABEL[t.tunnel_type]}</span>
              <span className="text-[12px] text-text">{t.local_host}:{t.local_port}</span>
              {t.tunnel_type !== 'dynamic' && <span className="text-[11px] text-muted">→ {t.remote_host}:{t.remote_port}</span>}
              <div className="flex-1" />
              <span className={cn('w-2 h-2 rounded-full', t.status === 'active' ? 'bg-success' : t.status === 'pending' ? 'bg-warning' : 'bg-danger')} title={t.status} />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-muted">{formatBytes(t.bytesTransferred)}</span>
              {t.error && <span className="text-[10px] text-danger truncate">{t.error}</span>}
              <button className="text-muted hover:text-danger" onClick={() => window.ternix.tunnels.stop(t.id)}>
                <Square size={12} />
              </button>
            </div>
          </div>
        ))}
        {tunnels.length === 0 && (
          <div className="text-center text-[12px] text-muted mt-8 px-4">
            <Plug size={28} className="mx-auto mb-2 text-border" />
            No active tunnels. Add port-forwards in a session&apos;s Tunnels tab.
          </div>
        )}
      </div>
      {element}
    </div>
  )
}
