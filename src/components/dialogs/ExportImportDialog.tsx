import { useState } from 'react'
import type { ImportSource, ExportTarget, ImportResult } from '@shared/index'
import { Modal, Field } from '@/components/ui/Modal'
import { useUiStore } from '@/store/useUiStore'
import { useSessionStore } from '@/store/useSessionStore'

const IMPORT_SOURCES: { id: ImportSource; label: string }[] = [
  { id: 'ternix', label: 'Ternix JSON backup' },
  { id: 'sshconfig', label: 'OpenSSH config (~/.ssh/config)' },
  { id: 'putty', label: 'PuTTY (.reg export)' },
  { id: 'winscp', label: 'WinSCP (.ini)' },
  { id: 'csv', label: 'CSV' },
  { id: 'mobaxterm', label: 'MobaXterm (.mxtsessions)' },
  { id: 'tabby', label: 'Tabby (config.yaml)' }
]
const EXPORT_TARGETS: { id: ExportTarget; label: string }[] = [
  { id: 'ternix', label: 'Ternix JSON backup' },
  { id: 'csv', label: 'CSV (no credentials)' },
  { id: 'sshconfig', label: 'OpenSSH config' },
  { id: 'mobaxterm', label: 'MobaXterm (.mxtsessions)' },
  { id: 'tabby', label: 'Tabby (config.yaml)' }
]

export function ExportImportDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'import' | 'export'>('import')
  const notify = useUiStore((s) => s.notify)
  const reload = useSessionStore((s) => s.load)

  // import
  const [source, setSource] = useState<ImportSource>('ternix')
  const [payload, setPayload] = useState('')
  const [preview, setPreview] = useState<ImportResult | null>(null)

  // export
  const [target, setTarget] = useState<ExportTarget>('ternix')
  const [includeKeys, setIncludeKeys] = useState(false)

  const browseFile = async () => {
    const path = await window.ternix.system.selectFile()
    if (!path) return
    try {
      const content = await window.ternix.system.readFile(path)
      setPayload(content)
      notify('File loaded', 'success')
    } catch (e: any) {
      notify(`Failed to read file: ${e.message}`, 'error')
    }
  }

  const doPreview = async () => {
    try {
      const result = await window.ternix.importExport.import(source, payload)
      setPreview(result)
      if (!result.sessions.length) notify('No sessions found in input', 'info')
    } catch (e: any) {
      notify(e.message, 'error')
    }
  }

  const doCommit = async () => {
    if (!preview) return
    const n = await window.ternix.importExport.commitImport(preview.sessions)
    notify(`Imported ${n} session(s)`, 'success')
    await reload()
    onClose()
  }

  const executeExport = async (mp?: string) => {
    try {
      const content = await window.ternix.importExport.export(target, includeKeys, mp)
      const ext = target === 'csv' ? 'csv' : target === 'sshconfig' ? 'config' : target === 'mobaxterm' ? 'mxtsessions' : target === 'tabby' ? 'yaml' : 'json'
      const path = await window.ternix.system.saveFile(`ternix-export.${ext}`, content)
      if (path) notify('Exported', 'success')
    } catch (e: any) {
      notify(e.message, 'error')
    }
  }

  const doExport = async () => {
    if (includeKeys && target === 'ternix') {
      useUiStore.getState().openDialog({
        kind: 'prompt',
        title: 'Export',
        label: 'Confirm master password to include private keys (blank if none):',
        password: true,
        onSubmit: executeExport
      })
    } else {
      executeExport()
    }
  }

  return (
    <Modal
      title="Import / Export"
      width={600}
      onClose={onClose}
      footer={
        tab === 'import' ? (
          preview ? (
            <>
              <button className="tx-btn-ghost border border-border" onClick={() => setPreview(null)}>Back</button>
              <button className="tx-btn-primary" onClick={doCommit}>Import {preview.sessions.length} session(s)</button>
            </>
          ) : (
            <button className="tx-btn-primary" onClick={doPreview}>Preview</button>
          )
        ) : (
          <button className="tx-btn-primary" onClick={doExport}>Export</button>
        )
      }
    >
      <div className="flex gap-1 mb-3 border-b border-border">
        {(['import', 'export'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-[12px] border-b-2 -mb-px capitalize ${tab === t ? 'border-accent text-text' : 'border-transparent text-muted'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'import' &&
        (preview ? (
          <div>
            <div className="text-[12px] text-muted mb-2">{preview.sessions.length} session(s) to import:</div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {preview.sessions.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] rounded-input border border-border p-1.5">
                  <span className="px-1 rounded bg-surface-2 text-accent text-[10px] uppercase">{s.protocol}</span>
                  <span className="text-text">{s.name}</span>
                  <span className="text-muted">{s.host}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <Field label="Source format">
              <select className="tx-input" value={source} onChange={(e) => setSource(e.target.value as ImportSource)}>
                {IMPORT_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <button className="text-[12px] text-accent mb-2" onClick={browseFile}>Browse for a file…</button>
            <Field label="Paste file contents">
              <textarea className="tx-input h-44 font-mono text-[11px]" value={payload} onChange={(e) => setPayload(e.target.value)} placeholder="Paste here…" />
            </Field>
          </div>
        ))}

      {tab === 'export' && (
        <div>
          <Field label="Export format">
            <select className="tx-input" value={target} onChange={(e) => setTarget(e.target.value as ExportTarget)}>
              {EXPORT_TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
          {target === 'ternix' && (
            <label className="flex items-center gap-2 text-[13px] text-text cursor-pointer mt-2">
              <input type="checkbox" checked={includeKeys} onChange={(e) => setIncludeKeys(e.target.checked)} />
              Include private keys (requires master password)
            </label>
          )}
          <p className="text-[11px] text-muted mt-3">CSV and ssh_config never include credentials.</p>
        </div>
      )}
    </Modal>
  )
}
