import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { dismissToast, subscribeToasts, type Toast, type ToastVariant } from '@/lib/toast'

const AUTO_DISMISS_MS = 7000

const variantStyle: Record<ToastVariant, { border: string; color: string; background: string }> = {
  danger: { border: 'var(--color-danger)', color: 'var(--color-danger)', background: 'var(--color-danger-light)' },
  success: { border: 'var(--color-success)', color: 'var(--color-success)', background: 'var(--color-success-light)' },
  warning: { border: 'var(--color-warning)', color: 'var(--color-warning)', background: 'var(--color-warning-light)' },
}

function ToastItem({ toast }: { toast: Toast }) {
  useEffect(() => {
    const id = window.setTimeout(() => dismissToast(toast.id), AUTO_DISMISS_MS)
    return () => window.clearTimeout(id)
  }, [toast.id])

  const style = variantStyle[toast.variant]
  return (
    <div
      role="alert"
      className="toast flex items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg"
      style={{ border: `1px solid ${style.border}`, color: style.color, background: style.background, maxWidth: '380px' }}
    >
      <span className="flex-1 break-words">{toast.message}</span>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label="Cerrar aviso"
        className="p-0.5 rounded-md opacity-70 hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(() => subscribeToasts(setToasts), [])
  if (toasts.length === 0) return null
  return (
    <div className="toaster fixed bottom-4 left-4 z-50 flex flex-col gap-2">
      {toasts.map(toast => <ToastItem key={toast.id} toast={toast} />)}
    </div>
  )
}
