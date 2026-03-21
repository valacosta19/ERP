import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { useCategories, useCreateCategory, useDeleteCategory } from '@/hooks/useCategories'
import type { TransactionType } from '@/types'

const EMPTY_FORM = { name: '', type: 'income' as TransactionType }

export function SettingsPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const { data: categories = [], isLoading } = useCategories()
  const createCat = useCreateCategory()
  const deleteCat = useDeleteCategory()

  const income = categories.filter(c => c.type === 'income')
  const expense = categories.filter(c => c.type === 'expense')

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setFormError('El nombre es obligatorio.')
      return
    }
    await createCat.mutateAsync({ name: form.name.trim(), type: form.type })
    setModalOpen(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta categoría? Las transacciones asociadas quedarán sin categoría.')) return
    await deleteCat.mutateAsync(id)
  }

  return (
    <div className="animate-fade-in">
      <TopBar
        title="Configuración"
        subtitle="Categorías del sistema"
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus size={14} />
            Nueva categoría
          </Button>
        }
      />

      <div className="p-6 space-y-6 max-w-2xl">
        {isLoading ? (
          <div className="flex justify-center pt-10">
            <span className="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <section>
              <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Categorías de ingresos</h2>
              <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                {income.length === 0 && (
                  <p className="px-4 py-3 text-sm text-[var(--color-muted)]">Sin categorías</p>
                )}
                {income.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="success">Ingreso</Badge>
                      <span className="text-sm text-[var(--color-text)]">{cat.name}</span>
                    </div>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Categorías de gastos</h2>
              <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                {expense.length === 0 && (
                  <p className="px-4 py-3 text-sm text-[var(--color-muted)]">Sin categorías</p>
                )}
                {expense.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="danger">Gasto</Badge>
                      <span className="text-sm text-[var(--color-text)]">{cat.name}</span>
                    </div>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva categoría">
        <div className="space-y-4">
          <Input
            label="Nombre"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ej: Servicios, Nómina..."
          />
          <Select
            label="Tipo"
            options={[
              { value: 'income', label: 'Ingreso' },
              { value: 'expense', label: 'Gasto' },
            ]}
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value as TransactionType }))}
          />
          {formError && <p className="text-xs text-[var(--color-danger)]">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} loading={createCat.isPending}>Crear categoría</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
