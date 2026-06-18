import { Info, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useUiStore } from '@/store/useUiStore'
import { cn } from '@/utils/cn'

export function Toast() {
  const toast = useUiStore((s) => s.toast)
  if (!toast) return null
  const Icon = toast.type === 'error' ? AlertTriangle : toast.type === 'success' ? CheckCircle2 : Info
  return (
    <div
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
    </div>
  )
}
