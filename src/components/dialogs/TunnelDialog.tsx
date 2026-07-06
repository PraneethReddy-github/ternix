import { useEffect, useState } from 'react'
import { Plus, Trash2, Plug, Play } from 'lucide-react'
import type { Tunnel, TunnelType } from '@shared/index'
import { Modal, Field } from '@/components/ui/Modal'
import { useUiStore } from '@/store/useUiStore'
import { useTabStore } from '@/store/useTabStore'

export function TunnelDialog({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [adding, setAdding] = useState(false)
  const notify = useUiStore((s) => s.notify)

  const [draft, setDraft] = useState<Partial<Tunnel>>({ tunnel_type: 'local', local_host: '127.0.0.1', local_port: 8080, remote_host: 'localhost', remote_port: 80, auto_start: false })

  const load = () => window.ternix.tunnels.listForSession(sessionId).then(setTunnels)
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const add = async () => {
    if (!draft.local_port) return notify('Local port required', 'error')
    await window.ternix.tunnels.create({ session_id: sessionId, tunnel_type: draft.tunnel_type as TunnelType, local_port: draft.local_port!, local_host: draft.local_host, remote_host: draft.remote_host, remote_port: draft.remote_port, name: draft.name, auto_start: draft.auto_start })
    setAdding(false)
    load()
  }

  const remove = async (id: number) => {
    await window.ternix.tunnels.delete(id)
    load()
  }

  const toggleAuto = async (t: Tunnel) => {
    await window.ternix.tunnels.update(t.id, { auto_start: !t.auto_start })
    load()
  }

  const start = async (t: Tunnel) => {
    const pane = useTabStore.getState().tabs.flatMap((tab) => tab.panes).find((p) => p.sessionId === sessionId && p.state === 'connected')
    if (!pane) return notify('Connect this session first', 'error')
    const active = await window.ternix.tunnels.start(t.id, pane.id)
    notify(active.status === 'failed' ? active.error || 'Tunnel failed to start' : 'Tunnel started', active.status === 'failed' ? 'error' : 'success')
  }

  return (
    <Modal
      title="Port forwarding"
      width={560}
      onClose={onClose}
      footer={adding ? (
        <>
          <button className="tx-btn-ghost border border-border" onClick={() => setAdding(false)}>Cancel</button>
          <button className="tx-btn-primary" onClick={add}>Add tunnel</button>
        </>
      ) : (
        <button className="tx-btn-primary" onClick={() => setAdding(true)}><Plus size={14} /> Add tunnel</button>
      )}
    >
      {!adding ? (
        <div className="space-y-1">
          {tunnels.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-input border border-border p-2.5">
              <span className="text-[10px] px-1 rounded bg-surface-2 text-accent font-mono uppercase">{t.tunnel_type}</span>
              <div className="text-[12px] text-text flex-1">
                {t.local_host}:{t.local_port}
                {t.tunnel_type !== 'dynamic' && <span className="text-muted"> → {t.remote_host}:{t.remote_port}</span>}
              </div>
              <label className="flex items-center gap-1 text-[11px] text-muted cursor-pointer">
                <input type="checkbox" checked={t.auto_start} onChange={() => toggleAuto(t)} /> auto-start
              </label>
              <button className="text-muted hover:text-accent" title="Start now" onClick={() => start(t)}><Play size={14} /></button>
              <button className="text-muted hover:text-danger" onClick={() => remove(t.id)}><Trash2 size={14} /></button>
            </div>
          ))}
          {tunnels.length === 0 && (
            <div className="text-center text-[12px] text-muted py-8">
              <Plug size={28} className="mx-auto mb-2 text-border" />
              No tunnels configured.
            </div>
          )}
        </div>
      ) : (
        <div>
          <Field label="Type">
            <select className="tx-input" value={draft.tunnel_type} onChange={(e) => setDraft({ ...draft, tunnel_type: e.target.value as TunnelType })}>
              <option value="local">Local (-L) — forward a local port to a remote host</option>
              <option value="remote">Remote (-R) — expose a local port on the server</option>
              <option value="dynamic">Dynamic (-D) — SOCKS5 proxy</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Local host"><input className="tx-input" value={draft.local_host ?? ''} onChange={(e) => setDraft({ ...draft, local_host: e.target.value })} /></Field>
            <Field label="Local port"><input type="number" className="tx-input" value={draft.local_port ?? ''} onChange={(e) => setDraft({ ...draft, local_port: Number(e.target.value) })} /></Field>
          </div>
          {draft.tunnel_type !== 'dynamic' && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Remote host"><input className="tx-input" value={draft.remote_host ?? ''} onChange={(e) => setDraft({ ...draft, remote_host: e.target.value })} /></Field>
              <Field label="Remote port"><input type="number" className="tx-input" value={draft.remote_port ?? ''} onChange={(e) => setDraft({ ...draft, remote_port: Number(e.target.value) })} /></Field>
            </div>
          )}
          <label className="flex items-center gap-2 text-[13px] text-text cursor-pointer">
            <input type="checkbox" checked={!!draft.auto_start} onChange={(e) => setDraft({ ...draft, auto_start: e.target.checked })} />
            Auto-start when this session connects
          </label>
        </div>
      )}
    </Modal>
  )
}
