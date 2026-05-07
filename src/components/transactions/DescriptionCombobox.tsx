import { forwardRef, useId, useImperativeHandle, useRef, useState } from 'react'

export type Suggestion = {
  id: string
  name: string
  priceCash: number
  priceTransfer: number | null
  priceCard: number | null
  productId?: string
}

export type DescriptionComboboxHandle = {
  focus: () => void
  isOpen: () => boolean
}

type Props = {
  value: string
  onChange: (v: string) => void
  onSelect: (s: Suggestion) => void
  suggestions: Suggestion[]
  placeholder?: string
  ariaLabel?: string
  fieldIndex?: number
}

export const DescriptionCombobox = forwardRef<DescriptionComboboxHandle, Props>(function DescriptionCombobox(
  { value, onChange, onSelect, suggestions, placeholder = 'Descripción', ariaLabel, fieldIndex },
  ref,
) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const filtered = suggestions.filter(s =>
    value.length > 0 && s.name.toLowerCase().includes(value.toLowerCase()),
  )

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    isOpen: () => open && filtered.length > 0,
  }))

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const isOpen = open && filtered.length > 0
    if (!isOpen) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      setHighlight(h => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      const picked = filtered[highlight]
      if (picked) {
        onSelect(picked)
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div
      className="relative"
      style={{ width: '100%' }}
      data-combobox-open={open && filtered.length > 0 ? 'true' : 'false'}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(0) }}
        onFocus={() => { if (value.length > 0) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        aria-autocomplete="list"
        aria-expanded={open && filtered.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && filtered.length > 0 ? `${listId}-${highlight}` : undefined}
        role="combobox"
        data-field-index={fieldIndex}
        style={{
          width: '100%',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '10px 12px',
          fontSize: '0.9375rem',
          color: 'var(--color-text)',
          outline: 'none',
          fontFamily: 'inherit',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
        onFocusCapture={e => {
          e.currentTarget.style.borderColor = 'var(--color-accent)'
          e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-light)'
        }}
        onBlurCapture={e => {
          e.currentTarget.style.borderColor = 'var(--color-border)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      />
      {open && filtered.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 top-full mt-1 rounded-lg border border-[var(--color-border)] shadow-lg overflow-hidden"
          style={{ background: 'var(--color-surface)', zIndex: 50, width: '100%', maxHeight: '240px', overflowY: 'auto', listStyle: 'none', margin: 0, padding: 0 }}
        >
          {filtered.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={highlight === i}
              className="px-3 py-2 text-sm border-b border-[var(--color-border)] last:border-0 cursor-pointer"
              style={{
                color: 'var(--color-text)',
                background: highlight === i ? 'var(--color-accent-light)' : 'transparent',
              }}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={e => { e.preventDefault(); onSelect(s); setOpen(false) }}
            >
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})
