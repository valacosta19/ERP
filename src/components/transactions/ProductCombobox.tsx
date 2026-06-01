import { forwardRef, useId, useImperativeHandle, useRef, useState } from 'react'
import type { Product } from '@/types'

export type ProductComboboxHandle = {
  focus: () => void
}

type Props = {
  value: string | null
  onChange: (productId: string | null, product: Product | null) => void
  products: Product[]
  productLabel: (p: Product) => string
  placeholder?: string
  ariaLabel?: string
}

export const ProductCombobox = forwardRef<ProductComboboxHandle, Props>(function ProductCombobox(
  { value, onChange, products, productLabel, placeholder = 'Buscar producto', ariaLabel },
  ref,
) {
  const selected = value ? products.find(p => p.id === value) ?? null : null
  const selectedLabel = selected ? productLabel(selected) : ''
  const [typed, setTyped] = useState('')
  const [focused, setFocused] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const display = focused ? typed : selectedLabel
  const filtered = open
    ? products.filter(p => typed.length === 0 || productLabel(p).toLowerCase().includes(typed.toLowerCase()))
    : []

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  function commit(p: Product) {
    onChange(p.id, p)
    setTyped(productLabel(p))
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || filtered.length === 0) return
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
      if (picked) commit(picked)
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
        value={display}
        onChange={e => { setTyped(e.target.value); setOpen(true); setHighlight(0); if (value) onChange(null, null) }}
        onFocus={() => { setFocused(true); setTyped(''); setOpen(true); setHighlight(0) }}
        onBlur={() => setTimeout(() => { setFocused(false); setOpen(false) }, 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        aria-autocomplete="list"
        aria-expanded={open && filtered.length > 0}
        aria-controls={listId}
        role="combobox"
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
          {filtered.map((p, i) => {
            const stock = p.stock ?? 0
            return (
              <li
                key={p.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={highlight === i}
                className="px-3 py-2 text-sm border-b border-[var(--color-border)] last:border-0 cursor-pointer flex items-center justify-between gap-2"
                style={{
                  color: 'var(--color-text)',
                  background: highlight === i ? 'var(--color-accent-light)' : 'transparent',
                }}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={e => { e.preventDefault(); commit(p) }}
              >
                <span>{productLabel(p)}</span>
                <span
                  className="text-xs whitespace-nowrap"
                  style={{ color: stock > 0 ? 'var(--color-muted)' : 'var(--color-danger)' }}
                >
                  {stock > 0 ? `Stock: ${stock}` : 'Sin stock'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
})
