import { Modal } from '@/components/ui/Modal'

export function ConfirmDialog({
  title,
  message,
  danger,
  onConfirm,
  onClose
}: {
  title: string
  message: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      title={title}
      width={420}
      onClose={onClose}
      footer={
        <>
          <button className="tx-btn-ghost border border-border" onClick={onClose}>
            Cancel
          </button>
          <button
            className={danger ? 'tx-btn-danger' : 'tx-btn-primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
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
