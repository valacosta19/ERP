import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, Check, X, Pencil } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/Badge'
import { InlineEditCell } from '@/components/ui/InlineEditCell'
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/useCategories'
import { useProfessionals, useCreateProfessional, useUpdateProfessional, useDeleteProfessional } from '@/hooks/useProfessionals'
import { useCatalogItems, useCreateCatalogItem, useUpdateCatalogItem, useDeleteCatalogItem } from '@/hooks/useCatalogItems'
import { usePaymentMethods, useCreatePaymentMethod, useUpdatePaymentMethod, useDeletePaymentMethod } from '@/hooks/usePaymentMethods'
import { useAuth, useUpdateProfile } from '@/hooks/useAuth'
import type { Professional, PaymentMethodConfig } from '@/types'

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

function BusinessNameCard({ name, onSave }: { name: string; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(name)
  }, [name, editing])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function commit() {
    const trimmed = draft.trim()
    if (trimmed === name) { setEditing(false); return }
    setSaving(true)
    try { await onSave(trimmed) } finally { setSaving(false); setEditing(false) }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { setDraft(name); setEditing(false) }
  }

  const isEmpty = !name

  return (
    <div
      onClick={() => !editing && setEditing(true)}
      className="group relative rounded-xl border transition-all cursor-pointer hover:border-[var(--color-accent)]"
      style={{
        background: editing ? 'var(--color-accent-light)' : 'var(--color-surface)',
        borderColor: editing ? 'var(--color-accent)' : 'var(--color-border)',
        borderStyle: isEmpty && !editing ? 'dashed' : 'solid',
        padding: '20px 24px',
      }}
    >
      {editing ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-accent)' }}>
            Nombre del negocio
          </p>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commit}
            disabled={saving}
            placeholder="Ej: Studio Rosa, Salon Valen..."
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderBottom: '2px solid var(--color-accent)',
              outline: 'none',
              fontFamily: 'var(--font-display)',
              fontSize: '1.375rem',
              fontWeight: 600,
              color: 'var(--color-text)',
              padding: '2px 0 6px 0',
            }}
          />
          <p className="text-[11px] mt-2.5" style={{ color: 'var(--color-accent)' }}>
            Enter para guardar · Esc para cancelar
          </p>
        </div>
      ) : isEmpty ? (
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
            style={{ background: 'var(--color-accent-light)', color: 'var(--color-accent)' }}
          >
            <Plus size={16} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--color-accent)' }}>
              Agregar nombre del negocio
            </p>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              Aparecerá en el menú lateral
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
              Nombre del negocio
            </p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.375rem', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.3 }}>
              {name}
            </p>
          </div>
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-1" style={{ color: 'var(--color-muted)' }}>
            <Pencil size={13} />
            <span className="text-xs">Editar</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function SettingsPage() {
  const [addingCat, setAddingCat] = useState(false)
  const [catDraft, setCatDraft] = useState('')
  const catInputRef = useRef<HTMLInputElement>(null)

  const [addingHd, setAddingHd] = useState(false)
  const [hdDraft, setHdDraft] = useState('')
  const hdInputRef = useRef<HTMLInputElement>(null)

  const [addingCatalogFor, setAddingCatalogFor] = useState<string | null>(null)
  const [catalogDraftName, setCatalogDraftName] = useState('')
  const [catalogDraftPrice, setCatalogDraftPrice] = useState('')
  const catalogNameRef = useRef<HTMLInputElement>(null)

  const { data: categories = [], isLoading: catsLoading } = useCategories()
  const createCat = useCreateCategory()
  const updateCat = useUpdateCategory()
  const deleteCat = useDeleteCategory()

  const { data: professionals = [], isLoading: hdsLoading } = useProfessionals()
  const createHd = useCreateProfessional()
  const updateHd = useUpdateProfessional()
  const deleteHd = useDeleteProfessional()

  const [addingPm, setAddingPm] = useState(false)
  const [pmDraft, setPmDraft] = useState('')
  const pmInputRef = useRef<HTMLInputElement>(null)

  const { data: paymentMethods = [] } = usePaymentMethods()
  const createPm = useCreatePaymentMethod()
  const updatePm = useUpdatePaymentMethod()
  const deletePm = useDeletePaymentMethod()

  const { data: catalogItems = [] } = useCatalogItems()
  const createCatalogItem = useCreateCatalogItem()
  const updateCatalogItem = useUpdateCatalogItem()
  const deleteCatalogItem = useDeleteCatalogItem()

  const { profile } = useAuth()
  const updateProfile = useUpdateProfile()

  function startAddCat() {
    setAddingCat(true)
    setCatDraft('')
    setTimeout(() => catInputRef.current?.focus(), 0)
  }

  async function saveCat() {
    if (!catDraft.trim()) return
    await createCat.mutateAsync({ name: catDraft.trim() })
    setAddingCat(false)
    setCatDraft('')
  }

  function cancelCat() {
    setAddingCat(false)
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

  async function handleHdToggleActive(hd: Professional) {
    await updateHd.mutateAsync({ id: hd.id, active: !hd.active })
  }

  async function handleHdDelete(id: string) {
    if (!confirm('¿Eliminar este profesional?')) return
    await deleteHd.mutateAsync(id)
  }

  function startAddPm() {
    setAddingPm(true)
    setPmDraft('')
    setTimeout(() => pmInputRef.current?.focus(), 0)
  }

  async function savePm() {
    if (!pmDraft.trim()) return
    await createPm.mutateAsync(pmDraft.trim())
    setAddingPm(false)
    setPmDraft('')
  }

  function cancelPm() {
    setAddingPm(false)
    setPmDraft('')
  }

  function handlePmKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); savePm() }
    if (e.key === 'Escape') cancelPm()
  }

  async function handlePmToggleActive(pm: PaymentMethodConfig) {
    await updatePm.mutateAsync({ id: pm.id, active: !pm.active })
  }

  async function handlePmDelete(id: string) {
    if (!confirm('¿Eliminar este método de pago?')) return
    await deletePm.mutateAsync(id)
  }

  function startAddCatalogItem(categoryId: string) {
    setAddingCatalogFor(categoryId)
    setCatalogDraftName('')
    setCatalogDraftPrice('')
    setTimeout(() => catalogNameRef.current?.focus(), 0)
  }

  async function saveCatalogItem() {
    if (!addingCatalogFor || !catalogDraftName.trim()) return
    await createCatalogItem.mutateAsync({
      name: catalogDraftName.trim(),
      category_id: addingCatalogFor,
      price: parseFloat(catalogDraftPrice) || 0,
    })
    setAddingCatalogFor(null)
    setCatalogDraftName('')
    setCatalogDraftPrice('')
  }

  function cancelCatalogItem() {
    setAddingCatalogFor(null)
    setCatalogDraftName('')
    setCatalogDraftPrice('')
  }

  function handleCatalogKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); saveCatalogItem() }
    if (e.key === 'Escape') cancelCatalogItem()
  }

  async function handleCatalogItemDelete(id: string) {
    if (!confirm('¿Eliminar este item del catálogo?')) return
    await deleteCatalogItem.mutateAsync(id)
  }

  const serviceCategories = categories.filter(c =>
    c.name.toLowerCase() === 'servicio' || c.name.toLowerCase() === 'producto'
  )

  return (
    <div className="animate-fade-in">
      <TopBar title="Configuración" subtitle="Categorías y profesionales" />

      <div className="p-6 space-y-6 max-w-2xl">
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Negocio</h2>
          {profile && (
            <BusinessNameCard
              name={profile.business_name ?? ''}
              onSave={async v => { await updateProfile.mutateAsync({ id: profile.id, business_name: v || null }) }}
            />
          )}
        </section>

        {hdsLoading ? (
          <div className="flex justify-center pt-4">
            <span className="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Profesionales</h2>
              <button
                onClick={startAddHd}
                disabled={addingHd}
                className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline disabled:opacity-40"
              >
                <Plus size={12} /> Nueva
              </button>
            </div>
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {professionals.length === 0 && !addingHd && (
                <p className="px-4 py-3 text-sm text-[var(--color-muted)]">Sin profesionales</p>
              )}
              {professionals.map(hd => (
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
                    placeholder="Nombre del profesional"
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

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Métodos de pago</h2>
            <button
              onClick={startAddPm}
              disabled={addingPm}
              className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline disabled:opacity-40"
            >
              <Plus size={12} /> Nuevo
            </button>
          </div>
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
            {paymentMethods.length === 0 && !addingPm && (
              <p className="px-4 py-3 text-sm text-[var(--color-muted)]">Sin métodos de pago</p>
            )}
            {paymentMethods.map(pm => (
              <div key={pm.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge variant={pm.active ? 'success' : 'default'}>
                    {pm.active ? 'Activo' : 'Inactivo'}
                  </Badge>
                  <InlineEditCell
                    value={pm.name}
                    onSave={async v => { await updatePm.mutateAsync({ id: pm.id, name: v }) }}
                    className="text-sm text-[var(--color-text)]"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePmToggleActive(pm)}
                    className="px-2 py-1 rounded-lg text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
                  >
                    {pm.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    onClick={() => handlePmDelete(pm.id)}
                    className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {addingPm && (
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
                  Nuevo
                </span>
                <DraftInput
                  inputRef={pmInputRef}
                  value={pmDraft}
                  onChange={setPmDraft}
                  onKeyDown={handlePmKeyDown}
                  placeholder="Nombre del método"
                  autoFocus
                />
                <button
                  onClick={savePm}
                  disabled={createPm.isPending || !pmDraft.trim()}
                  className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors disabled:opacity-40"
                  style={{ background: 'var(--color-accent)', color: '#fff' }}
                >
                  <Check size={13} />
                </button>
                <button
                  onClick={cancelPm}
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </div>
        </section>

        {catsLoading ? (
          <div className="flex justify-center pt-10">
            <span className="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Categorías</h2>
              <button
                onClick={startAddCat}
                disabled={addingCat}
                className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline disabled:opacity-40"
              >
                <Plus size={12} /> Nueva
              </button>
            </div>
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {categories.length === 0 && !addingCat && (
                <p className="px-4 py-3 text-sm text-[var(--color-muted)]">Sin categorías</p>
              )}
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between px-4 py-3">
                  <InlineEditCell
                    value={cat.name}
                    onSave={async v => { await updateCat.mutateAsync({ id: cat.id, name: v }) }}
                    className="text-sm text-[var(--color-text)]"
                  />
                  <button
                    onClick={() => handleCatDelete(cat.id)}
                    className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {addingCat && (
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
        )}

        {serviceCategories.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Catálogo</h2>
            <div className="space-y-4">
              {serviceCategories.map(cat => {
                const items = catalogItems.filter(ci => ci.category_id === cat.id)
                return (
                  <div key={cat.id}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                        {cat.name}
                      </span>
                      <button
                        onClick={() => startAddCatalogItem(cat.id)}
                        disabled={addingCatalogFor !== null}
                        className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline disabled:opacity-40"
                      >
                        <Plus size={12} /> Nuevo
                      </button>
                    </div>
                    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                      {items.length === 0 && addingCatalogFor !== cat.id && (
                        <p className="px-4 py-3 text-sm text-[var(--color-muted)]">Sin items</p>
                      )}
                      {items.map(item => (
                        <div key={item.id} className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-6 flex-1 min-w-0">
                            <InlineEditCell
                              value={item.name}
                              onSave={async v => { await updateCatalogItem.mutateAsync({ id: item.id, name: v }) }}
                              className="text-sm text-[var(--color-text)]"
                            />
                            <InlineEditCell
                              value={String(item.price)}
                              type="number"
                              onSave={async v => { await updateCatalogItem.mutateAsync({ id: item.id, price: parseFloat(v) || 0 }) }}
                              className="text-sm tabular-nums text-[var(--color-muted)]"
                            />
                          </div>
                          <button
                            onClick={() => handleCatalogItemDelete(item.id)}
                            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {addingCatalogFor === cat.id && (
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
                            Nuevo
                          </span>
                          <DraftInput
                            inputRef={catalogNameRef}
                            value={catalogDraftName}
                            onChange={setCatalogDraftName}
                            onKeyDown={handleCatalogKeyDown}
                            placeholder="Nombre *"
                            autoFocus
                          />
                          <DraftInput
                            value={catalogDraftPrice}
                            onChange={setCatalogDraftPrice}
                            onKeyDown={handleCatalogKeyDown}
                            placeholder="Precio"
                            type="number"
                          />
                          <button
                            onClick={saveCatalogItem}
                            disabled={createCatalogItem.isPending || !catalogDraftName.trim()}
                            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors disabled:opacity-40"
                            style={{ background: 'var(--color-accent)', color: '#fff' }}
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={cancelCatalogItem}
                            className="flex items-center justify-center w-7 h-7 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
