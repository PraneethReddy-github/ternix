import { useEffect, useState } from 'react'
import type { Snippet } from '@shared/index'
import { Modal, Field } from '@/components/ui/Modal'
import { useUiStore } from '@/store/useUiStore'

export function SnippetDialog({ id, onClose }: { id?: number; onClose: () => void }) {
  const notify = useUiStore((s) => s.notify)
  const [form, setForm] = useState<Partial<Snippet>>({ name: '', command: '', description: '', tags: [], is_global: true })

  useEffect(() => {
    if (id) window.ternix.snippets.list().then((list) => { const s = list.find((x) => x.id === id); if (s) setForm(s) })
  }, [id])

  const save = async () => {
    if (!form.name?.trim() || !form.command?.trim()) return notify('Name and command are required', 'error')
    try {
      if (id) await window.ternix.snippets.update(id, form)
      else await window.ternix.snippets.create({ name: form.name!, command: form.command!, description: form.description ?? null, tags: form.tags ?? [], is_global: form.is_global })
      notify('Snippet saved', 'success')
      onClose()
    } catch (e: any) {
      notify(e.message, 'error')
    }
  }

  return (
    <Modal
      title={id ? 'Edit snippet' : 'New snippet'}
      width={520}
      onClose={onClose}
      footer={
        <>
          <button className="tx-btn-ghost border border-border" onClick={onClose}>Cancel</button>
          <button className="tx-btn-primary" onClick={save}>Save</button>
        </>
      }
    >
      <Field label="Name"><input className="tx-input" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
      <Field label="Description"><input className="tx-input" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="Command" hint="Use ${VARIABLE} to prompt for input on execution">
        <textarea className="tx-input h-28 font-mono text-[12px]" value={form.command ?? ''} onChange={(e) => setForm({ ...form, command: e.target.value })} />
      </Field>
      <Field label="Tags" hint="Comma-separated">
        <input className="tx-input" value={(form.tags ?? []).join(', ')} onChange={(e) => setForm({ ...form, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} />
      </Field>
      <label className="flex items-center gap-2 text-[13px] text-text cursor-pointer">
        <input type="checkbox" checked={form.is_global !== false} onChange={(e) => setForm({ ...form, is_global: e.target.checked })} />
        Global snippet (available in all sessions)
      </label>
    </Modal>
  )
}
