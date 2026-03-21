import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string
  error?: string
  hint?: string
  prefix?: ReactNode
  suffix?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, prefix, suffix, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[var(--color-text)]">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {prefix && (
            <span className="absolute left-3 text-[var(--color-muted)] flex items-center">{prefix}</span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full bg-[var(--color-surface)] border rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] outline-none transition-all duration-150
              focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-0 focus:border-[var(--color-accent)]
              ${error ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]'}
              ${prefix ? 'pl-9' : ''}
              ${suffix ? 'pr-9' : ''}
              ${className}`}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 text-[var(--color-muted)] flex items-center">{suffix}</span>
          )}
        </div>
        {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
        {hint && !error && <p className="text-xs text-[var(--color-muted)]">{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
