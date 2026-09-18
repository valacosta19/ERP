import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
      <div className="modal__backdrop absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`modal__panel modal--${size} relative w-full ${sizeClasses[size]} bg-[var(--color-surface)] rounded-t-2xl md:rounded-xl shadow-2xl animate-fade-in flex flex-col max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)] md:max-h-[90vh]`}>
        <div className="modal__header flex items-center justify-between px-4 md:px-6 py-4 border-b border-[var(--color-border)] shrink-0">
          <h3 className="modal__title text-base font-semibold text-[var(--color-text)]">{title}</h3>
          <button
            onClick={onClose}
            className="modal__close mobile-icon-button rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
        <div className="modal__body px-4 md:px-6 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
