import { useState, useRef } from 'react'
import { Plus, Trash2, Check, X } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Table } from '@/components/ui/Table'
import { InlineEditCell } from '@/components/ui/InlineEditCell'
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier } from '@/hooks/useSuppliers'
import type { Supplier } from '@/types'

const EMPTY_DRAFT = { name: '', contact: '', phone: '', email: '', notes: '' }

function DraftInput({
  inputRef,
  value,
  onChange,
  onKeyDown,
  placeholder,
  type = 'text',
  autoFocus,
}: {
  inputRef?: React.Ref<HTMLInputElement>
  value: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  type?: string
  autoFocus?: boolean
}) {
  const [focused, setFocused] = useState(autoFocus ?? false)
  return (
    <input
      ref={inputRef}
      type={type}
      value={value}
      autoFocus={autoFocus}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      style={{
        width: '100%',
        background: 'transparent',
        border: 'none',
        borderBottom: `1.5px solid ${focused ? 'var(--color-accent)' : 'var(--color-border)'}`,
        padding: '3px 2px',
        fontSize: '0.875rem',
        color: 'var(--color-text)',
        outline: 'none',
        fontFamily: 'inherit',
        transition: 'border-color 0.15s ease',
      }}
    />
  )
}

export function SuppliersPage() {
  const [draft, setDraft] = useState<typeof EMPTY_DRAFT | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const { data: suppliers = [], isLoading } = useSuppliers()
  const createSupplier = useCreateSupplier()
  const updateSupplier = useUpdateSupplier()
  const deleteSupplier = useDeleteSupplier()

  function startNew() {
    setDraft({ ...EMPTY_DRAFT })
    setTimeout(() => nameRef.current?.focus(), 0)
  }

  async function saveNew() {
    if (!draft || !draft.name.trim()) return
    await createSupplier.mutateAsync({
      name: draft.name.trim(),
      contact: draft.contact.trim() || null,
      phone: draft.phone.trim() || null,
      email: draft.email.trim() || null,
      notes: draft.notes.trim() || null,
    })
    setDraft(null)
  }

  function cancelNew() {
    setDraft(null)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); saveNew() }
    if (e.key === 'Escape') cancelNew()
  }

  async function saveField(s: Supplier, field: keyof Supplier, value: string) {
    await updateSupplier.mutateAsync({
      id: s.id,
      name: s.name,
      contact: s.contact,
      phone: s.phone,
      email: s.email,
      notes: s.notes,
      [field]: value || null,
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este proveedor?')) return
    await deleteSupplier.mutateAsync(id)
  }

  const newRow = draft ? (
    <tr
      className="animate-slide-in"
      style={{
        background: 'var(--color-accent-light)',
        borderBottom: '2px solid var(--color-accent)',
      }}
    >
      <td
        className="px-4 py-2.5"
        style={{ borderLeft: '3px solid var(--color-accent)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="shrink-0 text-[10px] font-semibold tracking-widest uppercase px-1.5 py-0.5 rounded"
            style={{
              color: 'var(--color-accent)',
              background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
            }}
          >
            Nuevo
          </span>
          <DraftInput
            inputRef={nameRef}
            value={draft.name}
            onChange={v => setDraft(d => d && { ...d, name: v })}
            onKeyDown={handleKeyDown}
            placeholder="Nombre *"
            autoFocus
          />
        </div>
      </td>
      <td className="px-4 py-2.5">
        <DraftInput
          value={draft.contact}
          onChange={v => setDraft(d => d && { ...d, contact: v })}
          onKeyDown={handleKeyDown}
          placeholder="Contacto"
        />
      </td>
      <td className="px-4 py-2.5">
        <DraftInput
          value={draft.phone}
          onChange={v => setDraft(d => d && { ...d, phone: v })}
          onKeyDown={handleKeyDown}
          placeholder="Teléfono"
        />
      </td>
      <td className="px-4 py-2.5">
        <DraftInput
          value={draft.email}
          onChange={v => setDraft(d => d && { ...d, email: v })}
          onKeyDown={handleKeyDown}
          placeholder="Email"
          type="email"
        />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={saveNew}
            disabled={createSupplier.isPending || !draft.name.trim()}
            title="Guardar (Enter)"
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors disabled:opacity-40"
            style={{
              background: 'var(--color-accent)',
              color: '#fff',
            }}
          >
            <Check size={13} />
          </button>
          <button
            onClick={cancelNew}
            title="Cancelar (Esc)"
            className="flex items-center justify-center w-7 h-7 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </td>
    </tr>
  ) : undefined

  const columns = [
    {
      key: 'name',
      header: 'Nombre',
      render: (s: Supplier) => (
        <InlineEditCell
          value={s.name}
          onSave={v => saveField(s, 'name', v)}
          className="font-medium text-[var(--color-text)]"
        />
      ),
    },
    {
      key: 'contact',
      header: 'Contacto',
      render: (s: Supplier) => (
        <InlineEditCell
          value={s.contact ?? ''}
          onSave={v => saveField(s, 'contact', v)}
          placeholder="—"
          className="text-[var(--color-muted)]"
        />
      ),
    },
    {
      key: 'phone',
      header: 'Teléfono',
      render: (s: Supplier) => (
        <InlineEditCell
          value={s.phone ?? ''}
          onSave={v => saveField(s, 'phone', v)}
          placeholder="—"
          className="text-[var(--color-muted)]"
        />
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (s: Supplier) => (
        <InlineEditCell
          value={s.email ?? ''}
          onSave={v => saveField(s, 'email', v)}
          type="email"
          placeholder="—"
          className="text-[var(--color-muted)]"
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      render: (s: Supplier) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={() => handleDelete(s.id)}
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="animate-fade-in flex-1 min-h-0 flex flex-col">
      <TopBar
        title="Proveedores"
        subtitle={`${suppliers.length} registros`}
        actions={
          <Button onClick={startNew} size="sm" disabled={!!draft}>
            <Plus size={14} />
            Nuevo proveedor
          </Button>
        }
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
          <Table
            columns={columns}
            data={suppliers}
            keyField="id"
            loading={isLoading}
            emptyMessage="No hay proveedores registrados"
            prependRow={newRow}
          />
        </div>
      </div>
    </div>
  )
}
