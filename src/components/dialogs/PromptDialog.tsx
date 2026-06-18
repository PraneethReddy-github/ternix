import { useState } from 'react'
import { Modal, Field } from '@/components/ui/Modal'

export function PromptDialog({
  title,
  label,
  defaultValue = '',
  password = false,
  onSubmit,
  onClose
}: {
  title: string
  label?: string
  defaultValue?: string
  password?: boolean
  onSubmit: (value: string) => void
  onClose: () => void
}) {
  const [val, setVal] = useState(defaultValue)

  return (
    <Modal
      title={title}
      width={400}
      onClose={onClose}
      footer={
        <>
          <button className="tx-btn-ghost border border-border" onClick={onClose}>
            Cancel
          </button>
          <button
            className="tx-btn-primary"
            onClick={() => {
              onSubmit(val)
              onClose()
            }}
          >
            OK
          </button>
        </>
      }
    >
      <form onSubmit={(e) => {
        e.preventDefault()
        onSubmit(val)
        onClose()
      }}>
        <Field label={label || ''}>
          <input
            type={password ? 'password' : 'text'}
            className="tx-input"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            autoFocus
          />
        </Field>
      </form>
    </Modal>
  )
}
