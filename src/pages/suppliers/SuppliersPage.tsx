import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Table } from '@/components/ui/Table'
import { Modal } from '@/components/ui/Modal'
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier } from '@/hooks/useSuppliers'
import type { Supplier } from '@/types'

const EMPTY_FORM = {
  name: '',
  contact: '',
  phone: '',
  email: '',
  notes: '',
}

export function SuppliersPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const { data: suppliers = [], isLoading } = useSuppliers()
  const createSupplier = useCreateSupplier()
  const updateSupplier = useUpdateSupplier()
  const deleteSupplier = useDeleteSupplier()

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(supplier: Supplier) {
    setEditing(supplier)
    setForm({
      name: supplier.name,
      contact: supplier.contact ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      notes: supplier.notes ?? '',
    })
    setFormError('')
    setModalOpen(true)
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setFormError('El nombre es obligatorio.')
      return
    }
    const payload = {
      name: form.name.trim(),
      contact: form.contact.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
    }
    if (editing) {
      await updateSupplier.mutateAsync({ id: editing.id, ...payload })
    } else {
      await createSupplier.mutateAsync(payload)
    }
    setModalOpen(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este proveedor?')) return
    await deleteSupplier.mutateAsync(id)
  }

  const columns = [
    {
      key: 'name',
      header: 'Nombre',
      render: (s: Supplier) => <span className="font-medium text-[var(--color-text)]">{s.name}</span>,
    },
    {
      key: 'contact',
      header: 'Contacto',
      render: (s: Supplier) => <span className="text-[var(--color-muted)]">{s.contact || '—'}</span>,
    },
    {
      key: 'phone',
      header: 'Teléfono',
      render: (s: Supplier) => <span className="text-[var(--color-muted)]">{s.phone || '—'}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      render: (s: Supplier) => <span className="text-[var(--color-muted)]">{s.email || '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-20',
      render: (s: Supplier) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={() => openEdit(s)}
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
          >
            <Pencil size={14} />
          </button>
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
    <div className="animate-fade-in">
      <TopBar
        title="Proveedores"
        subtitle={`${suppliers.length} registros`}
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus size={14} />
            Nuevo proveedor
          </Button>
        }
      />

      <div className="p-6">
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
          <Table
            columns={columns}
            data={suppliers}
            keyField="id"
            loading={isLoading}
            emptyMessage="No hay proveedores registrados"
          />
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar proveedor' : 'Nuevo proveedor'}
      >
        <div className="space-y-4">
          <Input
            label="Nombre *"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ej. Distribuidora Belleza S.A."
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Contacto"
              value={form.contact}
              onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
              placeholder="Nombre del contacto"
            />
            <Input
              label="Teléfono"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+57 300 000 0000"
            />
          </div>
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="contacto@proveedor.com"
          />
          <Input
            label="Notas"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Opcional"
          />
          {formError && <p className="text-xs text-[var(--color-danger)]">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              loading={createSupplier.isPending || updateSupplier.isPending}
            >
              {editing ? 'Guardar cambios' : 'Crear proveedor'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
