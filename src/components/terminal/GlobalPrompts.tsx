import { useEffect, useState } from 'react'
import { ShieldAlert, ShieldQuestion } from 'lucide-react'
import type { HostKeyPrompt, KeyboardInteractivePrompt } from '@shared/index'
import { Modal } from '@/components/ui/Modal'
import { shortFingerprint, fingerprintSparkline } from '@/utils/sshFingerprintDisplay'

/** Renders blocking modals driven by main-process events: host-key verification and
 *  keyboard-interactive auth prompts. */
export function GlobalPrompts() {
  const [hostKey, setHostKey] = useState<HostKeyPrompt | null>(null)
  const [kbi, setKbi] = useState<KeyboardInteractivePrompt | null>(null)
  const [kbiValues, setKbiValues] = useState<string[]>([])

  useEffect(() => {
    const offHk = window.ternix.terminal.onHostKeyPrompt((p) => setHostKey(p))
    const offKbi = window.ternix.terminal.onKbInteractive((p) => {
      setKbi(p)
      setKbiValues(p.prompts.map(() => ''))
    })
    return () => {
      offHk()
      offKbi()
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
    </>
  )
}
