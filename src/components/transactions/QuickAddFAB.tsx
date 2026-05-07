import { forwardRef, useEffect } from 'react'
import { Plus } from 'lucide-react'

type Props = {
  onClick: () => void
  disabled?: boolean
  shortcutKey?: string
}

export const QuickAddFAB = forwardRef<HTMLButtonElement, Props>(function QuickAddFAB(
  { onClick, disabled, shortcutKey = 'n' },
  ref,
) {
  useEffect(() => {
    if (disabled) return
    function handleKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== shortcutKey.toLowerCase()) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (target.isContentEditable) return
      }
      e.preventDefault()
      onClick()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClick, shortcutKey, disabled])

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Nueva transacción"
      title={`Nueva transacción · ${shortcutKey.toUpperCase()}`}
      className="group fixed flex items-center justify-center transition-all"
      style={{
        bottom: '24px',
        left: '24px',
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        background: 'var(--color-accent)',
        color: '#fff',
        border: 'none',
        boxShadow: '0 8px 24px rgba(99, 102, 241, 0.35), 0 2px 6px rgba(15, 17, 23, 0.08)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        zIndex: 40,
      }}
      onMouseEnter={e => {
        if (disabled) return
        e.currentTarget.style.transform = 'scale(1.06)'
        e.currentTarget.style.background = 'var(--color-accent-hover)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)'
        e.currentTarget.style.background = 'var(--color-accent)'
      }}
      onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = 'scale(0.96)' }}
      onMouseUp={e => { if (!disabled) e.currentTarget.style.transform = 'scale(1.06)' }}
    >
      <Plus size={26} strokeWidth={2.4} />
    </button>
  )
})
