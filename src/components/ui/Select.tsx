import { type SelectHTMLAttributes, forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className = '', id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className={`select-field ${error ? 'select-field--error' : ''} flex flex-col gap-1.5`}>
        {label && (
          <label htmlFor={selectId} className="select-field__label text-sm font-medium text-[var(--color-text)]">
            {label}
          </label>
        )}
        <div className="select-field__wrapper relative">
          <select
            ref={ref}
            id={selectId}
            className={`select-field__control w-full appearance-none bg-[var(--color-surface)] border rounded-lg px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-all duration-150 pr-8
              focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)]
              ${error ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]'}
              ${className}`}
            {...props}
          >
            {placeholder && <option value="">{placeholder}</option>}
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown size={14} className="select-field__icon absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none" />
        </div>
        {error && <p className="select-field__error text-xs text-[var(--color-danger)]">{error}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'
