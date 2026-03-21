import { useState, useRef } from 'react'
import { Plus, Trash2, Check, X } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/Badge'
import { InlineEditCell } from '@/components/ui/InlineEditCell'
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/useCategories'
import { useHairdressers, useCreateHairdresser, useUpdateHairdresser, useDeleteHairdresser } from '@/hooks/useHairdressers'
import type { TransactionType, Hairdresser } from '@/types'

function DraftInput({
  inputRef,
  value,
  onChange,
  onKeyDown,
  placeholder,
  autoFocus,
}: {
  inputRef?: React.Ref<HTMLInputElement>
  value: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [focused, setFocused] = useState(autoFocus ?? false)
  return (
    <input
      ref={inputRef}
      value={value}
      autoFocus={autoFocus}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      style={{
        flex: 1,
        minWidth: 0,
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

export function SettingsPage() {
  const [addingCatType, setAddingCatType] = useState<TransactionType | null>(null)
  const [catDraft, setCatDraft] = useState('')
  const catInputRef = useRef<HTMLInputElement>(null)

  const [addingHd, setAddingHd] = useState(false)
  const [hdDraft, setHdDraft] = useState('')
  const hdInputRef = useRef<HTMLInputElement>(null)

  const { data: categories = [], isLoading: catsLoading } = useCategories()
  const createCat = useCreateCategory()
  const updateCat = useUpdateCategory()
  const deleteCat = useDeleteCategory()

  const { data: hairdressers = [], isLoading: hdsLoading } = useHairdressers()
  const createHd = useCreateHairdresser()
  const updateHd = useUpdateHairdresser()
  const deleteHd = useDeleteHairdresser()

  const income = categories.filter(c => c.type === 'income')
  const expense = categories.filter(c => c.type === 'expense')

  function startAddCat(type: TransactionType) {
    setAddingCatType(type)
    setCatDraft('')
    setTimeout(() => catInputRef.current?.focus(), 0)
  }

  async function saveCat() {
    if (!catDraft.trim() || !addingCatType) return
    await createCat.mutateAsync({ name: catDraft.trim(), type: addingCatType })
    setAddingCatType(null)
    setCatDraft('')
  }

  function cancelCat() {
    setAddingCatType(null)
    setCatDraft('')
  }

  function handleCatKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); saveCat() }
    if (e.key === 'Escape') cancelCat()
  }

  async function handleCatDelete(id: string) {
    if (!confirm('¿Eliminar esta categoría? Las transacciones asociadas quedarán sin categoría.')) return
    await deleteCat.mutateAsync(id)
  }

  function startAddHd() {
    setAddingHd(true)
    setHdDraft('')
    setTimeout(() => hdInputRef.current?.focus(), 0)
  }

  async function saveHd() {
    if (!hdDraft.trim()) return
    await createHd.mutateAsync(hdDraft.trim())
    setAddingHd(false)
    setHdDraft('')
  }

  function cancelHd() {
    setAddingHd(false)
    setHdDraft('')
  }

  function handleHdKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); saveHd() }
    if (e.key === 'Escape') cancelHd()
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
      <TopBar title="Configuración" subtitle="Categorías y peluqueras" />

      <div className="p-6 space-y-6 max-w-2xl">
        {hdsLoading ? (
          <div className="flex justify-center pt-4">
            <span className="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Peluqueras</h2>
              <button
                onClick={startAddHd}
                disabled={addingHd}
                className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline disabled:opacity-40"
              >
                <Plus size={12} /> Nueva
              </button>
            </div>
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {hairdressers.length === 0 && !addingHd && (
                <p className="px-4 py-3 text-sm text-[var(--color-muted)]">Sin peluqueras</p>
              )}
              {hairdressers.map(hd => (
                <div key={hd.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={hd.active ? 'success' : 'default'}>
                      {hd.active ? 'Activa' : 'Inactiva'}
                    </Badge>
                    <InlineEditCell
                      value={hd.name}
                      onSave={async v => { await updateHd.mutateAsync({ id: hd.id, name: v }) }}
                      className="text-sm text-[var(--color-text)]"
                    />
                  </div>
                  <div className="flex items-center gap-1">
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
              {addingHd && (
                <div
                  className="flex items-center gap-2 px-4 py-2.5 animate-slide-in"
                  style={{
                    background: 'var(--color-accent-light)',
                    borderLeft: '3px solid var(--color-accent)',
                  }}
                >
                  <span
                    className="shrink-0 text-[10px] font-semibold tracking-widest uppercase px-1.5 py-0.5 rounded"
                    style={{
                      color: 'var(--color-accent)',
                      background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                    }}
                  >
                    Nueva
                  </span>
                  <DraftInput
                    inputRef={hdInputRef}
                    value={hdDraft}
                    onChange={setHdDraft}
                    onKeyDown={handleHdKeyDown}
                    placeholder="Nombre de la peluquera"
                    autoFocus
                  />
                  <button
                    onClick={saveHd}
                    disabled={createHd.isPending || !hdDraft.trim()}
                    className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors disabled:opacity-40"
                    style={{ background: 'var(--color-accent)', color: '#fff' }}
                  >
                    <Check size={13} />
                  </button>
                  <button
                    onClick={cancelHd}
                    className="flex items-center justify-center w-7 h-7 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
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
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[var(--color-text)]">Categorías de ingresos</h2>
                <button
                  onClick={() => startAddCat('income')}
                  disabled={addingCatType !== null}
                  className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline disabled:opacity-40"
                >
                  <Plus size={12} /> Nueva
                </button>
              </div>
              <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                {income.length === 0 && addingCatType !== 'income' && (
                  <p className="px-4 py-3 text-sm text-[var(--color-muted)]">Sin categorías</p>
                )}
                {income.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="success">Ingreso</Badge>
                      <InlineEditCell
                        value={cat.name}
                        onSave={async v => { await updateCat.mutateAsync({ id: cat.id, name: v }) }}
                        className="text-sm text-[var(--color-text)]"
                      />
                    </div>
                    <button
                      onClick={() => handleCatDelete(cat.id)}
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {addingCatType === 'income' && (
                  <div
                    className="flex items-center gap-2 px-4 py-2.5 animate-slide-in"
                    style={{
                      background: 'var(--color-accent-light)',
                      borderLeft: '3px solid var(--color-accent)',
                    }}
                  >
                    <span
                      className="shrink-0 text-[10px] font-semibold tracking-widest uppercase px-1.5 py-0.5 rounded"
                      style={{
                        color: 'var(--color-accent)',
                        background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                      }}
                    >
                      Nueva
                    </span>
                    <DraftInput
                      inputRef={catInputRef}
                      value={catDraft}
                      onChange={setCatDraft}
                      onKeyDown={handleCatKeyDown}
                      placeholder="Nombre de la categoría"
                      autoFocus
                    />
                    <button
                      onClick={saveCat}
                      disabled={createCat.isPending || !catDraft.trim()}
                      className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors disabled:opacity-40"
                      style={{ background: 'var(--color-accent)', color: '#fff' }}
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={cancelCat}
                      className="flex items-center justify-center w-7 h-7 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[var(--color-text)]">Categorías de gastos</h2>
                <button
                  onClick={() => startAddCat('expense')}
                  disabled={addingCatType !== null}
                  className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline disabled:opacity-40"
                >
                  <Plus size={12} /> Nueva
                </button>
              </div>
              <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                {expense.length === 0 && addingCatType !== 'expense' && (
                  <p className="px-4 py-3 text-sm text-[var(--color-muted)]">Sin categorías</p>
                )}
                {expense.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="danger">Gasto</Badge>
                      <InlineEditCell
                        value={cat.name}
                        onSave={async v => { await updateCat.mutateAsync({ id: cat.id, name: v }) }}
                        className="text-sm text-[var(--color-text)]"
                      />
                    </div>
                    <button
                      onClick={() => handleCatDelete(cat.id)}
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {addingCatType === 'expense' && (
                  <div
                    className="flex items-center gap-2 px-4 py-2.5 animate-slide-in"
                    style={{
                      background: 'var(--color-accent-light)',
                      borderLeft: '3px solid var(--color-accent)',
                    }}
                  >
                    <span
                      className="shrink-0 text-[10px] font-semibold tracking-widest uppercase px-1.5 py-0.5 rounded"
                      style={{
                        color: 'var(--color-accent)',
                        background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                      }}
                    >
                      Nueva
                    </span>
                    <DraftInput
                      inputRef={catInputRef}
                      value={catDraft}
                      onChange={setCatDraft}
                      onKeyDown={handleCatKeyDown}
                      placeholder="Nombre de la categoría"
                      autoFocus
                    />
                    <button
                      onClick={saveCat}
                      disabled={createCat.isPending || !catDraft.trim()}
                      className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors disabled:opacity-40"
                      style={{ background: 'var(--color-accent)', color: '#fff' }}
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={cancelCat}
                      className="flex items-center justify-center w-7 h-7 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
