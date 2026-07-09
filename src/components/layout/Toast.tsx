import { useEffect, useState } from 'react'
import { Info, AlertTriangle, CheckCircle2, ArrowUpRight } from 'lucide-react'
import { useUiStore } from '@/store/useUiStore'
import { cn } from '@/utils/cn'

export function Toast() {
  const toast = useUiStore((s) => s.toast)
  const dismiss = useUiStore((s) => s.dismissToast)
  // Held while the pointer is over the toast, or while its button has keyboard focus,
  // so the thing you are reaching for doesn't vanish mid-reach. Leaving restarts the 4s.
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (!toast || held) return
    const t = setTimeout(dismiss, 4000)
    return () => clearTimeout(t)
  }, [toast?.id, held, dismiss])

  if (!toast) return null
  const Icon = toast.type === 'error' ? AlertTriangle : toast.type === 'success' ? CheckCircle2 : Info
  return (
    <div
      role="status"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className={cn(
        'fixed bottom-10 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 px-4 py-2 rounded-panel border shadow-2xl text-[13px]',
        toast.type === 'error'
          ? 'bg-surface border-danger text-danger'
          : toast.type === 'success'
            ? 'bg-surface border-success text-success'
            : 'bg-surface border-border text-text'
      )}
    >
      <Icon size={15} />
      {toast.message}
      {toast.action && (
        // Plain utilities, not tx-btn-ghost: that rule is declared after @tailwind
        // utilities and its :hover would repaint the accent label.
        <button
          className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-input text-accent hover:bg-surface-2 transition-colors"
          onClick={() => {
            toast.action!.onClick()
            // Clear the hold explicitly: this unmounts the toast, so no mouseleave/blur
            // will fire and the next toast would inherit held=true and never expire.
            setHeld(false)
            dismiss()
          }}
        >
          {toast.action.label}
          <ArrowUpRight size={13} />
        </button>
      )}
    </div>
  )
}
