import { useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'

export function ConfirmDialog({
  title,
  message,
  danger,
  onConfirm,
  onCancel,
  onClose
}: {
  title: string
  message: string
  danger?: boolean
  onConfirm: () => void
  onCancel?: () => void
  onClose: () => void
}) {
  const handleClose = () => {
    onCancel?.()
    onClose()
  }

  const handleConfirm = () => {
    // Close before onConfirm — it may open another dialog (see PromptDialog).
    onClose()
    onConfirm()
  }

  // Enter confirms, regardless of which button holds focus (delete dialogs
  // autoFocus Cancel for safety). Capture phase + stopPropagation so xterm —
  // whose textarea keydown fires in the target phase — never writes the \r to
  // the PTY behind the dialog when the terminal still holds focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        handleConfirm()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Modal
      title={title}
      width={420}
      onClose={handleClose}
      footer={
        <>
          <button className="tx-btn-ghost border border-border" onClick={handleClose} autoFocus={danger}>
            Cancel
          </button>
          <button
            className={danger ? 'tx-btn-danger' : 'tx-btn-primary'}
            autoFocus={!danger}
            onClick={handleConfirm}
          >
            {danger ? 'Delete' : 'Confirm'}
          </button>
        </>
      }
    >
      <p className="text-[13px] text-text">{message}</p>
    </Modal>
  )
}
