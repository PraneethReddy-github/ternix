import { useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { Modal, Field } from '@/components/ui/Modal'

/** Asks for the master password and unlocks the vault. Stays open on a wrong
 *  password; resolves false if the user cancels (ESC / backdrop / Cancel). */
export function UnlockVaultDialog({
  onResolve,
  onClose
}: {
  onResolve: (ok: boolean) => void
  onClose: () => void
}) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const resolved = useRef(false)

  const done = (ok: boolean) => {
    if (resolved.current) return
    resolved.current = true
    onResolve(ok)
    onClose()
  }

  const submit = async () => {
    if (!pw || busy) return
    setBusy(true)
    try {
      if (await window.ternix.vault.unlock(pw)) done(true)
      else {
        setError('Incorrect master password')
        setPw('')
        setBusy(false)
      }
    } catch (e: any) {
      setError(e?.message || 'Unlock failed')
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Unlock vault"
      width={400}
      onClose={() => done(false)}
      footer={
        <>
          <button className="tx-btn-ghost border border-border" onClick={() => done(false)}>
            Cancel
          </button>
          <button className="tx-btn-primary" disabled={!pw || busy} onClick={submit}>
            Unlock
          </button>
        </>
      }
    >
      <div className="flex items-center gap-2 text-[12px] text-muted mb-3">
        <Lock size={14} className="text-accent shrink-0" />
        Enter your master password to unlock saved passwords and keys.
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="Master password">
          <input
            type="password"
            className="tx-input"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setError(null) }}
            autoFocus
          />
        </Field>
      </form>
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </Modal>
  )
}
