import { useEffect, useState } from 'react'
import { ShieldAlert, ShieldQuestion, KeyRound, Lock, FolderOpen, RefreshCw } from 'lucide-react'
import type { HostKeyPrompt, KeyboardInteractivePrompt, CredentialRequest } from '@shared/index'
import { Modal, Field } from '@/components/ui/Modal'
import { shortFingerprint, fingerprintSparkline } from '@/utils/sshFingerprintDisplay'
import { cn } from '@/utils/cn'
import { useSessionStore } from '@/store/useSessionStore'

/** Renders blocking modals driven by main-process events: host-key verification,
 *  keyboard-interactive auth prompts, and the just-in-time credential picker. */
export function GlobalPrompts() {
  const [hostKey, setHostKey] = useState<HostKeyPrompt | null>(null)
  const [kbi, setKbi] = useState<KeyboardInteractivePrompt | null>(null)
  const [kbiValues, setKbiValues] = useState<string[]>([])
  const [credReq, setCredReq] = useState<CredentialRequest | null>(null)

  useEffect(() => {
    const offHk = window.ternix.terminal.onHostKeyPrompt((p) => setHostKey(p))
    const offKbi = window.ternix.terminal.onKbInteractive((p) => {
      setKbi(p)
      setKbiValues(p.prompts.map(() => ''))
    })
    const offCred = window.ternix.terminal.onNeedsCredentials((req) => setCredReq(req))
    return () => {
      offHk()
      offKbi()
      offCred()
    }
  }, [])

  return (
    <>
      {hostKey && (
        <Modal
          title={hostKey.changed ? 'Host key CHANGED' : 'Unknown host key'}
          width={520}
          onClose={() => {
            window.ternix.terminal.respondHostKey(hostKey.tabId, 'reject')
            setHostKey(null)
          }}
          footer={
            <>
              <button
                className="tx-btn-ghost border border-border"
                onClick={() => {
                  window.ternix.terminal.respondHostKey(hostKey.tabId, 'reject')
                  setHostKey(null)
                }}
              >
                Reject
              </button>
              <button
                className="tx-btn-ghost border border-border"
                onClick={() => {
                  window.ternix.terminal.respondHostKey(hostKey.tabId, 'accept')
                  setHostKey(null)
                }}
              >
                Accept once
              </button>
              <button
                className="tx-btn-primary"
                onClick={() => {
                  window.ternix.terminal.respondHostKey(hostKey.tabId, 'always')
                  setHostKey(null)
                }}
              >
                Always trust
              </button>
            </>
          }
        >
          <div className="flex gap-3">
            {hostKey.changed ? <ShieldAlert size={32} className="text-danger shrink-0" /> : <ShieldQuestion size={32} className="text-warning shrink-0" />}
            <div className="text-[13px] text-text space-y-2">
              <p>
                The authenticity of host <b>{hostKey.host}:{hostKey.port}</b> {hostKey.changed ? 'has CHANGED.' : "can't be established."}
              </p>
              {hostKey.changed && (
                <p className="text-danger">
                  ⚠ This could indicate a man-in-the-middle attack. Only continue if you know the host key legitimately changed.
                </p>
              )}
              {hostKey.changed && hostKey.oldFingerprint && (
                <div>
                  <div className="text-muted text-[11px]">Previously trusted:</div>
                  <code className="text-[12px]">{shortFingerprint(hostKey.oldFingerprint)}</code>
                  <div className="text-muted">{fingerprintSparkline(hostKey.oldFingerprint)}</div>
                </div>
              )}
              <div>
                <div className="text-muted text-[11px]">New fingerprint:</div>
                <code className="text-[12px]">{shortFingerprint(hostKey.fingerprint)}</code>
                <div className="text-accent">{fingerprintSparkline(hostKey.fingerprint)}</div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {kbi && (
        <Modal
          title={kbi.name || 'Authentication required'}
          width={440}
          onClose={() => {
            window.ternix.terminal.respondKbInteractive(kbi.tabId, kbi.prompts.map(() => ''))
            setKbi(null)
          }}
          footer={
            <button
              className="tx-btn-primary"
              onClick={() => {
                window.ternix.terminal.respondKbInteractive(kbi.tabId, kbiValues)
                setKbi(null)
              }}
            >
              Submit
            </button>
          }
        >
          {kbi.instructions && <p className="text-[12px] text-muted mb-3">{kbi.instructions}</p>}
          {kbi.prompts.map((p, i) => (
            <label key={i} className="block mb-3">
              <div className="text-[12px] text-muted mb-1">{p.prompt}</div>
              <input
                autoFocus={i === 0}
                type={p.echo ? 'text' : 'password'}
                className="tx-input"
                value={kbiValues[i] ?? ''}
                onChange={(e) => setKbiValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && i === kbi.prompts.length - 1) {
                    window.ternix.terminal.respondKbInteractive(kbi.tabId, kbiValues)
                    setKbi(null)
                  }
                }}
              />
            </label>
          ))}
        </Modal>
      )}

      {credReq && (
        <CredentialPicker
          req={credReq}
          onClose={() => {
            window.ternix.terminal.respondCredentials(credReq.tabId, { type: 'cancel' })
            setCredReq(null)
          }}
          onSubmit={(response) => {
            window.ternix.terminal.respondCredentials(credReq.tabId, response)
            setCredReq(null)
          }}
        />
      )}
    </>
  )
}

// ─── Credential Picker ────────────────────────────────────────────────────────

type AuthMode = 'password' | 'key'

function CredentialPicker({
  req,
  onClose,
  onSubmit
}: {
  req: CredentialRequest
  onClose: () => void
  onSubmit: (r: { type: 'password'; password: string; save: boolean } | { type: 'key'; keyId: number; save: boolean }) => void
}) {
  const [mode, setMode] = useState<AuthMode>('password')
  const [password, setPassword] = useState('')
  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(
    req.vaultKeys.length > 0 ? req.vaultKeys[0].id : null
  )
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [vaultKeys, setVaultKeys] = useState(req.vaultKeys)

  const canSubmit =
    (mode === 'password' && password.trim().length > 0) ||
    (mode === 'key' && selectedKeyId !== null)

  const handleBrowseKey = async () => {
    setImportError(null)
    const path = await window.ternix.system.selectFile([
      { name: 'SSH Private Key', extensions: ['pem', 'ppk', 'key', 'rsa', 'ed25519', 'ecdsa', '*'] }
    ])
    if (!path) return
    setImporting(true)
    try {
      const pem = await window.ternix.system.readFile(path)
      const filename = path.split(/[/\\]/).pop() ?? 'imported-key'
      // Import the key into the vault (no passphrase initially; user can add later)
      const newKey = await window.ternix.keys.import(pem, filename)
      setVaultKeys((prev) => [...prev, { id: newKey.id, name: newKey.name, key_type: newKey.key_type, fingerprint: newKey.fingerprint }])
      setSelectedKeyId(newKey.id)
      setMode('key')
    } catch (e: any) {
      setImportError(e.message)
    } finally {
      setImporting(false)
    }
  }

  const handleSubmit = async () => {
    try {
      if (mode === 'password') {
        // Save the credential via the UI store so React state is instantly updated
        await useSessionStore.getState().updateSession(req.sessionId, {
          name: req.sessionName,
          protocol: 'ssh',
          auth_type: 'password',
          password
        })
        onSubmit({ type: 'password', password, save: true })
      } else if (selectedKeyId !== null) {
        await useSessionStore.getState().updateSession(req.sessionId, {
          name: req.sessionName,
          protocol: 'ssh',
          auth_type: 'key',
          ssh_key_id: selectedKeyId
        })
        onSubmit({ type: 'key', keyId: selectedKeyId, save: true })
      }
    } catch (e) {
      console.error('Failed to save session credentials', e)
      // still proceed so the connection can happen at least once
      if (mode === 'password') onSubmit({ type: 'password', password, save: true })
      else if (selectedKeyId !== null) onSubmit({ type: 'key', keyId: selectedKeyId, save: true })
    }
  }

  return (
    <Modal
      title="Credentials required"
      width={480}
      onClose={onClose}
      footer={
        <>
          <button className="tx-btn-ghost border border-border" onClick={onClose}>Cancel</button>
          <button className="tx-btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
            Connect
          </button>
        </>
      }
    >
      {/* Session info banner */}
      <div className="flex items-center gap-2 rounded-input bg-surface-2 px-3 py-2 mb-4 text-[12px] text-muted">
        <Lock size={13} className="text-accent shrink-0" />
        <span>
          <span className="text-text font-medium">{req.sessionName}</span>
          {req.username && <span className="mx-1">·</span>}
          {req.username && <span>{req.username}</span>}
          {req.host && <span className="mx-1">@</span>}
          {req.host && <span>{req.host}</span>}
        </span>
      </div>

      {/* Mode selector */}
      <div className="flex border-b border-border mb-4">
        {(['password', 'key'] as AuthMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-[12px] border-b-2 transition-colors -mb-px',
              mode === m ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'
            )}
          >
            {m === 'password' ? <Lock size={13} /> : <KeyRound size={13} />}
            {m === 'password' ? 'Password' : 'SSH Key'}
          </button>
        ))}
      </div>

      {/* Password mode */}
      {mode === 'password' && (
        <Field label="Password">
          <input
            type="password"
            className="tx-input"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleSubmit() }}
            placeholder="Enter password…"
          />
        </Field>
      )}

      {/* Key mode */}
      {mode === 'key' && (
        <div className="space-y-3">
          {/* Vault key selector */}
          {vaultKeys.length > 0 ? (
            <Field label="Select key from vault">
              <div className="space-y-1">
                {vaultKeys.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => setSelectedKeyId(k.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 rounded-input border p-2 text-left transition-colors',
                      selectedKeyId === k.id ? 'border-accent bg-accent/8' : 'border-border hover:border-muted'
                    )}
                  >
                    <KeyRound size={14} className={selectedKeyId === k.id ? 'text-accent' : 'text-muted'} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-text truncate">
                        {k.name} <span className="text-muted text-[10px]">{k.key_type}</span>
                      </div>
                      {k.fingerprint && (
                        <code className="text-[10px] text-muted">{shortFingerprint(k.fingerprint)}</code>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </Field>
          ) : (
            <p className="text-[12px] text-muted text-center py-2">
              No keys in vault yet. Browse for a key file below.
            </p>
          )}

          {/* File browser */}
          <button
            className="tx-btn-ghost border border-dashed border-border w-full flex items-center justify-center gap-2 text-[12px] text-muted hover:text-text hover:border-accent"
            onClick={handleBrowseKey}
            disabled={importing}
          >
            {importing ? (
              <><RefreshCw size={13} className="animate-spin" /> Importing…</>
            ) : (
              <><FolderOpen size={13} /> Browse for key file…</>
            )}
          </button>
          {importError && (
            <p className="text-[11px] text-danger">{importError}</p>
          )}
        </div>
      )}

    </Modal>
  )
}
