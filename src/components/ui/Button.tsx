import { type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50',
  secondary: 'bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-bg)] disabled:opacity-50',
  ghost: 'text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-50',
  danger: 'bg-[var(--color-danger)] text-white hover:opacity-90 disabled:opacity-50',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

export function Button({ variant = 'primary', size = 'md', loading, children, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      className={`btn btn--${variant} btn--${size} ${loading ? 'btn--loading' : ''} inline-flex items-center gap-2 font-medium rounded-lg transition-all duration-150 cursor-pointer ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="btn__spinner w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  )
}
