import { useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { useCategories, useCreateCategory, useDeleteCategory } from '@/hooks/useCategories'
import { useHairdressers, useCreateHairdresser, useUpdateHairdresser, useDeleteHairdresser } from '@/hooks/useHairdressers'
import type { TransactionType, Hairdresser } from '@/types'

const EMPTY_CAT_FORM = { name: '', type: 'income' as TransactionType }
const EMPTY_HD_FORM = { name: '' }

export function SettingsPage() {
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [catForm, setCatForm] = useState(EMPTY_CAT_FORM)
  const [catFormError, setCatFormError] = useState('')

  const [hdModalOpen, setHdModalOpen] = useState(false)
  const [editingHd, setEditingHd] = useState<Hairdresser | null>(null)
  const [hdForm, setHdForm] = useState(EMPTY_HD_FORM)
  const [hdFormError, setHdFormError] = useState('')

  const { data: categories = [], isLoading: catsLoading } = useCategories()
  const createCat = useCreateCategory()
  const deleteCat = useDeleteCategory()

  const { data: hairdressers = [], isLoading: hdsLoading } = useHairdressers()
  const createHd = useCreateHairdresser()
  const updateHd = useUpdateHairdresser()
  const deleteHd = useDeleteHairdresser()

  const income = categories.filter(c => c.type === 'income')
  const expense = categories.filter(c => c.type === 'expense')

  function openCreateCat() {
    setCatForm(EMPTY_CAT_FORM)
    setCatFormError('')
    setCatModalOpen(true)
  }

  async function handleCatSubmit() {
    if (!catForm.name.trim()) {
      setCatFormError('El nombre es obligatorio.')
      return
    }
    await createCat.mutateAsync({ name: catForm.name.trim(), type: catForm.type })
    setCatModalOpen(false)
  }

  async function handleCatDelete(id: string) {
    if (!confirm('¿Eliminar esta categoría? Las transacciones asociadas quedarán sin categoría.')) return
    await deleteCat.mutateAsync(id)
  }

  function openCreateHd() {
    setEditingHd(null)
    setHdForm(EMPTY_HD_FORM)
    setHdFormError('')
    setHdModalOpen(true)
  }

  function openEditHd(hd: Hairdresser) {
    setEditingHd(hd)
    setHdForm({ name: hd.name })
    setHdFormError('')
    setHdModalOpen(true)
  }

  async function handleHdSubmit() {
    if (!hdForm.name.trim()) {
      setHdFormError('El nombre es obligatorio.')
      return
    }
    if (editingHd) {
      await updateHd.mutateAsync({ id: editingHd.id, name: hdForm.name.trim() })
    } else {
      await createHd.mutateAsync(hdForm.name.trim())
    }
    setHdModalOpen(false)
  }

  async function handleHdToggleActive(hd: Hairdresser) {
    await updateHd.mutateAsync({ id: hd.id, active: !hd.active })
  }

  async function handleHdDelete(id: string) {
    if (!confirm('¿Eliminar esta peluquera?')) return
    await deleteHd.mutateAsync(id)
  }

  return (
    <div className="animate-fade-in">
      <TopBar
        title="Configuración"
        subtitle="Categorías y peluqueras"
        actions={
          <div className="flex gap-2">
            <Button onClick={openCreateHd} size="sm" variant="secondary">
              <Plus size={14} />
              Nueva peluquera
            </Button>
            <Button onClick={openCreateCat} size="sm">
              <Plus size={14} />
              Nueva categoría
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-6 max-w-2xl">
        {hdsLoading ? (
          <div className="flex justify-center pt-4">
            <span className="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <section>
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Peluqueras</h2>
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {hairdressers.length === 0 && (
                <p className="px-4 py-3 text-sm text-[var(--color-muted)]">Sin peluqueras</p>
              )}
              {hairdressers.map(hd => (
                <div key={hd.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={hd.active ? 'success' : 'default'}>
                      {hd.active ? 'Activa' : 'Inactiva'}
                    </Badge>
                    <span className="text-sm text-[var(--color-text)]">{hd.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditHd(hd)}
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleHdToggleActive(hd)}
                      className="px-2 py-1 rounded-lg text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
                    >
                      {hd.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      onClick={() => handleHdDelete(hd.id)}
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {catsLoading ? (
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
                      onClick={() => handleCatDelete(cat.id)}
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
                      onClick={() => handleCatDelete(cat.id)}
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

      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title="Nueva categoría">
        <div className="space-y-4">
          <Input
            label="Nombre"
            value={catForm.name}
            onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ej: Servicios, Nómina..."
          />
          <Select
            label="Tipo"
            options={[
              { value: 'income', label: 'Ingreso' },
              { value: 'expense', label: 'Gasto' },
            ]}
            value={catForm.type}
            onChange={e => setCatForm(f => ({ ...f, type: e.target.value as TransactionType }))}
          />
          {catFormError && <p className="text-xs text-[var(--color-danger)]">{catFormError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCatModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCatSubmit} loading={createCat.isPending}>Crear categoría</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={hdModalOpen}
        onClose={() => setHdModalOpen(false)}
        title={editingHd ? 'Editar peluquera' : 'Nueva peluquera'}
      >
        <div className="space-y-4">
          <Input
            label="Nombre"
            value={hdForm.name}
            onChange={e => setHdForm({ name: e.target.value })}
            placeholder="Nombre de la peluquera"
          />
          {hdFormError && <p className="text-xs text-[var(--color-danger)]">{hdFormError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setHdModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleHdSubmit} loading={createHd.isPending || updateHd.isPending}>
              {editingHd ? 'Guardar cambios' : 'Crear peluquera'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
