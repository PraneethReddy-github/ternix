import { useEffect, useState } from 'react'
import { KeyRound, Plus, Trash2, Copy, Download, Upload, FolderSearch, Server, Link2 } from 'lucide-react'
import type { SshKey, KeyGenerateOptions } from '@shared/index'
import { Modal, Field } from '@/components/ui/Modal'
import { useUiStore } from '@/store/useUiStore'
import { useSessionStore } from '@/store/useSessionStore'
import { shortFingerprint } from '@/utils/sshFingerprintDisplay'
import { SessionPickerDialog } from './SessionPickerDialog'

export function KeyVaultDialog({ onClose }: { onClose: () => void }) {
  const [keys, setKeys] = useState<SshKey[]>([])
  const [mode, setMode] = useState<'list' | 'generate' | 'import'>('list')
  const [picker, setPicker] = useState<{ key: SshKey; action: 'assign' | 'deploy' } | null>(null)
  const notify = useUiStore((s) => s.notify)
  const sessions = useSessionStore((s) => s.sessions)
  const updateSession = useSessionStore((s) => s.updateSession)

  const load = () => window.ternix.keys.list().then(setKeys)
  useEffect(() => {
    load()
  }, [])

  // generate form
  const [gen, setGen] = useState<KeyGenerateOptions>({ name: '', type: 'ed25519', comment: '', passphrase: '' })
  // import form
  const [pem, setPem] = useState('')
  const [importName, setImportName] = useState('')
  const [importPass, setImportPass] = useState('')

  const doGenerate = async () => {
    if (!gen.name.trim()) return notify('Name required', 'error')
    try {
      const key = await window.ternix.keys.generate(gen)
      notify(`Generated ${key.key_type} key`, 'success')
      setMode('list')
      setGen({ name: '', type: 'ed25519', comment: '', passphrase: '' })
      load()
    } catch (e: any) {
      notify(e.message, 'error')
    }
  }

  const doImport = async () => {
    if (!pem.trim() || !importName.trim()) return notify('Name and key required', 'error')
    try {
      await window.ternix.keys.import(pem, importName, importPass || undefined)
      notify('Key imported', 'success')
      setMode('list')
      setPem('')
      setImportName('')
      setImportPass('')
      load()
    } catch (e: any) {
      notify(e.message, 'error')
    }
  }

  const browsePem = async () => {
    const path = await window.ternix.system.selectFile()
    if (!path) return
    try {
      const content = await window.ternix.system.readFile(path)
      setPem(content)
      notify('Key loaded from file', 'success')
      if (!importName) {
        // try to guess name from filename
        const filename = path.split(/[/\\]/).pop() || 'key'
        setImportName(filename)
      }
    } catch (e: any) {
      notify(`Failed to read file: ${e.message}`, 'error')
    }
  }

  const copyPublic = async (id: number) => {
    const pub = await window.ternix.keys.getPublic(id)
    window.ternix.system.writeClipboard(pub)
    notify('Public key copied', 'success')
  }

  const exportPrivate = async (id: number) => {
    useUiStore.getState().openDialog({
      kind: 'prompt',
      title: 'Export Private Key',
      label: 'Confirm master password (leave blank if none):',
      password: true,
      onSubmit: async (mp) => {
        try {
          const priv = await window.ternix.keys.exportPrivate(id, mp)
          const path = await window.ternix.system.saveFile('id_key', priv)
          if (path) notify('Private key exported', 'success')
        } catch (e: any) {
          notify(e.message, 'error')
        }
      }
    })
  }

  const sshSessions = sessions.filter((s) => s.protocol === 'ssh')

  /** Assign this vault key to the picked sessions locally; unpicked sessions that used it are unlinked. */
  const applyToSessions = async (key: SshKey, ids: number[]) => {
    const picked = new Set(ids)
    const changed = sshSessions.filter((s) => picked.has(s.id) !== (s.ssh_key_id === key.id))
    for (const s of changed) {
      const use = picked.has(s.id)
      await updateSession(s.id, {
        name: s.name,
        protocol: s.protocol,
        ssh_key_id: use ? key.id : null,
        auth_type: use ? 'key' : 'password'
      })
    }
    notify(changed.length ? `"${key.name}" now used by ${picked.size} session(s)` : 'No change', 'success')
    load()
  }

  /** Push the public key to each picked server's authorized_keys (ssh-copy-id). */
  const deployToSessions = async (key: SshKey, ids: number[]) => {
    if (!ids.length) return
    notify(`Deploying to ${ids.length} server(s)…`, 'info')
    const failed: string[] = []
    for (const id of ids) {
      try {
        await window.ternix.keys.deploy(key.id, id)
      } catch (e: any) {
        failed.push(`${sshSessions.find((s) => s.id === id)?.name}: ${e.message}`)
      }
    }
    if (failed.length) notify(`Deployed to ${ids.length - failed.length}/${ids.length}. Failed — ${failed.join('; ')}`, 'error')
    else notify(`Key deployed to ${ids.length} server(s)`, 'success')
  }

  const openPicker = (key: SshKey, action: 'assign' | 'deploy') => {
    if (!sshSessions.length) return notify('No SSH sessions', 'error')
    setPicker({ key, action })
  }

  const remove = (k: SshKey) =>
    useUiStore.getState().openDialog({
      kind: 'confirm',
      title: 'Delete key',
      message: k.usedBy ? `"${k.name}" is used by ${k.usedBy} session(s). Delete anyway?` : `Delete "${k.name}"?`,
      danger: true,
      onConfirm: async () => {
        await window.ternix.keys.delete(k.id)
        load()
      }
    })

  const importFromDir = async () => {
    const imported = await window.ternix.keys.importFromDir()
    notify(`Imported ${imported.length} key(s) from ~/.ssh`, 'success')
    load()
  }

  return (
    <Modal
      title="SSH Key Vault"
      width={640}
      onClose={onClose}
      footer={
        mode === 'list' ? (
          <>
            <button className="tx-btn-ghost border border-border" onClick={importFromDir}><FolderSearch size={14} /> Import from ~/.ssh</button>
            <button className="tx-btn-ghost border border-border" onClick={() => setMode('import')}><Upload size={14} /> Import</button>
            <button className="tx-btn-primary" onClick={() => setMode('generate')}><Plus size={14} /> Generate</button>
          </>
        ) : (
          <>
            <button className="tx-btn-ghost border border-border" onClick={() => setMode('list')}>Back</button>
            <button className="tx-btn-primary" onClick={mode === 'generate' ? doGenerate : doImport}>{mode === 'generate' ? 'Generate' : 'Import'}</button>
          </>
        )
      }
    >
      {mode === 'list' && (
        <div className="space-y-1">
          {keys.map((k) => (
            <div key={k.id} className="group flex items-center gap-3 rounded-input border border-border p-2.5">
              <KeyRound size={16} className="text-accent shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-text truncate">{k.name} <span className="text-[11px] text-muted">{k.key_type}</span></div>
                <code className="text-[11px] text-muted">{shortFingerprint(k.fingerprint)}</code>
                {k.usedBy ? <span className="text-[10px] text-muted ml-2">· {k.usedBy} session(s)</span> : null}
              </div>
              <button className="text-muted hover:text-text" title="Copy public key" onClick={() => copyPublic(k.id)}><Copy size={14} /></button>
              <button className="text-muted hover:text-text" title="Use for sessions…" onClick={() => openPicker(k, 'assign')}><Link2 size={14} /></button>
              <button className="text-muted hover:text-text" title="Deploy to server" onClick={() => openPicker(k, 'deploy')}><Server size={14} /></button>
              <button className="text-muted hover:text-text" title="Export private key" onClick={() => exportPrivate(k.id)}><Download size={14} /></button>
              <button className="text-muted hover:text-danger" title="Delete" onClick={() => remove(k)}><Trash2 size={14} /></button>
            </div>
          ))}
          {keys.length === 0 && <div className="text-center text-[12px] text-muted py-8">No keys in the vault yet.</div>}
        </div>
      )}

      {mode === 'generate' && (
        <div>
          <Field label="Key name"><input className="tx-input" value={gen.name} onChange={(e) => setGen({ ...gen, name: e.target.value })} autoFocus /></Field>
          <Field label="Key type">
            <select className="tx-input" value={gen.type} onChange={(e) => setGen({ ...gen, type: e.target.value as any })}>
              <option value="ed25519">ed25519 (recommended)</option>
              <option value="rsa">RSA 4096</option>
              <option value="ecdsa">ECDSA 521</option>
            </select>
          </Field>
          <Field label="Comment" hint="Defaults to ternix@hostname"><input className="tx-input" value={gen.comment} onChange={(e) => setGen({ ...gen, comment: e.target.value })} /></Field>
          <Field label="Passphrase" hint="Optional — encrypts the private key"><input type="password" className="tx-input" value={gen.passphrase} onChange={(e) => setGen({ ...gen, passphrase: e.target.value })} /></Field>
        </div>
      )}

      {mode === 'import' && (
        <div>
          <Field label="Key name"><input className="tx-input" value={importName} onChange={(e) => setImportName(e.target.value)} autoFocus /></Field>
          <Field label="Private key (PEM / OpenSSH)">
            <textarea className="tx-input h-40 font-mono text-[11px]" value={pem} onChange={(e) => setPem(e.target.value)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
          </Field>
          <button className="text-[12px] text-accent mb-2" onClick={browsePem}>Browse for file…</button>
          <Field label="Passphrase" hint="If the key is encrypted"><input type="password" className="tx-input" value={importPass} onChange={(e) => setImportPass(e.target.value)} /></Field>
        </div>
      )}

      {picker && (
        <SessionPickerDialog
          title={picker.action === 'assign' ? `Use "${picker.key.name}" for sessions` : `Deploy "${picker.key.name}" to servers`}
          sessions={sshSessions}
          preselected={picker.action === 'assign' ? sshSessions.filter((s) => s.ssh_key_id === picker.key.id).map((s) => s.id) : []}
          applyLabel={picker.action === 'assign' ? 'Apply' : 'Deploy'}
          onApply={(ids) => (picker.action === 'assign' ? applyToSessions(picker.key, ids) : deployToSessions(picker.key, ids))}
          onClose={() => setPicker(null)}
        />
      )}
    </Modal>
  )
}
