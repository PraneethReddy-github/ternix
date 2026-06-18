import { useState } from 'react'
import { Modal, Field } from '@/components/ui/Modal'

const BITS = [
  { label: 'Owner', base: 6 },
  { label: 'Group', base: 3 },
  { label: 'Public', base: 0 }
] as const
const PERMS = [
  { label: 'Read', bit: 4 },
  { label: 'Write', bit: 2 },
  { label: 'Execute', bit: 1 }
] as const

/** chmod UI: checkbox grid + octal field, kept in sync. */
export function PermissionsEditor({ initialMode, name, onApply, onClose }: { initialMode: number; name: string; onApply: (mode: number) => void; onClose: () => void }) {
  const [mode, setMode] = useState(initialMode & 0o777)

  const toggle = (base: number, bit: number) => {
    const shift = bit << base
    setMode((m) => (m & shift ? m & ~shift : m | shift))
  }

  const octal = mode.toString(8).padStart(3, '0')

  return (
    <Modal
      title={`Permissions · ${name}`}
      width={360}
      onClose={onClose}
      footer={
        <>
          <button className="tx-btn-ghost border border-border" onClick={onClose}>Cancel</button>
          <button className="tx-btn-primary" onClick={() => { onApply(mode); onClose() }}>Apply</button>
        </>
      }
    >
      <table className="w-full text-[12px] mb-3">
        <thead>
          <tr className="text-muted">
            <th />
            {PERMS.map((p) => <th key={p.label} className="font-normal">{p.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {BITS.map((group) => (
            <tr key={group.label}>
              <td className="text-text py-1">{group.label}</td>
              {PERMS.map((p) => (
                <td key={p.label} className="text-center">
                  <input type="checkbox" checked={!!(mode & (p.bit << group.base))} onChange={() => toggle(group.base, p.bit)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Field label="Octal">
        <input
          className="tx-input font-mono w-24"
          value={octal}
          onChange={(e) => {
            const v = parseInt(e.target.value || '0', 8)
            if (!isNaN(v)) setMode(v & 0o777)
          }}
        />
      </Field>
    </Modal>
  )
}
