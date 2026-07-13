import { useState } from 'react'
import { Check, Download, FolderSearch, KeyRound } from 'lucide-react'
import type { ImportSource, ExportTarget, ImportResult, ImportKeyRef } from '@shared/index'
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
  // Phase 2: user-located key files for paths missing on this machine.
  const [located, setLocated] = useState<Record<string, string>>({})
  const [locatedEnc, setLocatedEnc] = useState<Record<string, boolean>>({})

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

  const resetPreview = () => {
    setPreview(null)
    setLocated({})
    setLocatedEnc({})
  }

  const locateKey = async (ref: ImportKeyRef) => {
    const path = await window.ternix.system.selectFile()
    if (!path) return
    try {
      const info = await window.ternix.importExport.inspectKey(path)
      if (!info) {
        notify("That file doesn't look like a private key", 'error')
        return
      }
      setLocated((m) => ({ ...m, [ref.path]: path }))
      setLocatedEnc((m) => ({ ...m, [ref.path]: info.encrypted }))
      notify(`Located ${ref.name}`, 'success')
    } catch (e: any) {
      notify(e.message, 'error')
    }
  }

  const doCommit = async () => {
    if (!preview) return
    const n = await window.ternix.importExport.commitImport(preview.sessions, located)
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
              <button className="tx-btn-ghost border border-border" onClick={resetPreview}>Back</button>
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
            <div className="max-h-48 overflow-y-auto space-y-1">
              {preview.sessions.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] rounded-input border border-border p-1.5">
                  <span className="px-1 rounded bg-surface-2 text-accent text-[10px] uppercase">{s.protocol}</span>
                  <span className="text-text">{s.name}</span>
                  <span className="text-muted">{s.host}</span>
                  {s.importGroupPath && <span className="ml-auto text-[11px] text-muted shrink-0">{s.importGroupPath}</span>}
                </div>
              ))}
            </div>
            <KeySection keyRefs={preview.keyRefs ?? []} located={located} locatedEnc={locatedEnc} onLocate={locateKey} />
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

/**
 * Shows the distinct SSH key files referenced by the import and where each one
 * stands: already in the vault, readable on disk (will be imported once and
 * linked to every session that uses it), or missing — in which case the user
 * can locate it and it gets stored in the vault on import.
 */
function KeySection({
  keyRefs,
  located,
  locatedEnc,
  onLocate
}: {
  keyRefs: ImportKeyRef[]
  located: Record<string, string>
  locatedEnc: Record<string, boolean>
  onLocate: (ref: ImportKeyRef) => void
}) {
  if (!keyRefs.length) return null

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted font-semibold mb-2">
        <KeyRound size={12} /> SSH keys ({keyRefs.length})
      </div>
      <div className="max-h-40 overflow-y-auto space-y-1">
        {keyRefs.map((ref) => {
          const isLocated = !!located[ref.path]
          const encrypted = isLocated ? locatedEnc[ref.path] : ref.encrypted
          // Resolved = will end up linked: already vaulted, readable on disk, or located by the user.
          const resolved = ref.status === 'vault' || ref.status === 'found' || isLocated
          const label =
            ref.status === 'vault' ? 'In vault' : isLocated ? 'Located — will import' : ref.status === 'found' ? 'Will import from disk' : 'Not found on this machine'
          const Icon = ref.status === 'vault' ? Check : resolved ? Download : FolderSearch

          return (
            <div key={ref.path} className="flex items-center gap-2 text-[12px] rounded-input border border-border p-1.5">
              <Icon size={13} className={resolved ? 'text-green-500 shrink-0' : 'text-amber-500 shrink-0'} />
              <span className="text-text truncate" title={ref.path}>{ref.name}</span>
              {encrypted && <span className="px-1 rounded bg-surface-2 text-muted text-[10px]">encrypted</span>}
              <span className="ml-auto text-[11px] text-muted shrink-0">{label}</span>
              {!resolved && (
                <button className="text-[11px] text-accent shrink-0" onClick={() => onLocate(ref)}>Locate…</button>
              )}
            </div>
          )
        })}
      </div>
      {keyRefs.some((r) => r.encrypted || locatedEnc[r.path]) && (
        <p className="text-[11px] text-muted mt-2">Encrypted keys are stored as-is; their passphrase is requested when you connect.</p>
      )}
    </div>
  )
}
