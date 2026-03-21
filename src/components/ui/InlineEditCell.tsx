import { useState, useRef, useEffect } from 'react'

interface InlineEditCellProps {
  value: string
  onSave: (value: string) => Promise<void>
  type?: 'text' | 'email' | 'number'
  placeholder?: string
  className?: string
}

export function InlineEditCell({ value, onSave, type = 'text', placeholder, className = '' }: InlineEditCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function startEditing() {
    setDraft(value)
    setEditing(true)
  }

  async function commit() {
    const trimmed = draft.trim()
    if (trimmed === value) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      cancel()
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        disabled={saving}
        placeholder={placeholder}
        className={`w-full bg-[var(--color-bg)] border border-[var(--color-accent)] rounded px-2 py-0.5 text-sm text-[var(--color-text)] outline-none focus:ring-1 focus:ring-[var(--color-accent)] ${className}`}
      />
    )
  }

  return (
    <span
      onClick={startEditing}
      className={`cursor-pointer rounded px-1 py-0.5 hover:bg-[var(--color-bg)] transition-colors ${className}`}
      title="Clic para editar"
    >
      {value || <span className="text-[var(--color-muted)]">{placeholder || '—'}</span>}
    </span>
  )
}
