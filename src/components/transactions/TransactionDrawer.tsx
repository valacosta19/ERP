import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  initialFocusRef?: React.RefObject<HTMLElement | null>
}

export function TransactionDrawer({ open, onClose, title, children, footer, initialFocusRef }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousActiveRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousActiveRef.current = document.activeElement as HTMLElement | null
    const t = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
      } else {
        panelRef.current?.focus()
      }
    }, 60)
    return () => {
      clearTimeout(t)
      previousActiveRef.current?.focus()
    }
  }, [open, initialFocusRef])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0"
      style={{ zIndex: 60 }}
      role="presentation"
    >
      <div
        className="absolute inset-0 animate-backdrop-fade"
        style={{ background: 'rgba(15, 17, 23, 0.45)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-drawer-title"
        tabIndex={-1}
        className="absolute right-0 top-0 bottom-0 flex flex-col animate-slide-in-right"
        style={{
          width: '520px',
          maxWidth: '92vw',
          background: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-border)',
          boxShadow: '-12px 0 32px rgba(15, 17, 23, 0.12)',
          outline: 'none',
        }}
      >
        <header
          className="flex items-center justify-between"
          style={{
            height: '64px',
            padding: '0 24px',
            borderBottom: '1px solid var(--color-border)',
            flexShrink: 0,
          }}
        >
          <h2
            id="tx-drawer-title"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--color-text)',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex items-center justify-center rounded-lg transition-colors"
            style={{
              width: '32px',
              height: '32px',
              color: 'var(--color-muted)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg)'; e.currentTarget.style.color = 'var(--color-text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-muted)' }}
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto" style={{ padding: '24px' }}>
          {children}
        </div>

        {footer && (
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
