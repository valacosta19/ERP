import { useState, useRef, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Trash2, Check, X, Pencil, UserPlus, Lock, LockOpen } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { InlineEditCell } from '@/components/ui/InlineEditCell'
import { useTransactionCategories, useCreateTransactionCategory, useUpdateTransactionCategory, useDeleteTransactionCategory } from '@/hooks/useTransactionCategories'
import { useProfessionals, useCreateProfessional, useUpdateProfessional, useDeleteProfessional } from '@/hooks/useProfessionals'
import { useCatalogItems, useCreateCatalogItem, useUpdateCatalogItem, useDeleteCatalogItem, useUpdateCatalogItemHours } from '@/hooks/useCatalogItems'
import { usePaymentMethods, useCreatePaymentMethod, useUpdatePaymentMethod, useDeletePaymentMethod } from '@/hooks/usePaymentMethods'
import { useAuth, useUpdateProfile, useUsers, useInviteUser, useUpdateUserRole } from '@/hooks/useAuth'
import { useFixedCosts, useCreateFixedCost, useUpdateFixedCost, useDeleteFixedCost } from '@/hooks/useFixedCosts'
import { useServiceRecipes, useUpsertServiceRecipes } from '@/hooks/useServiceRecipes'
import { useProducts } from '@/hooks/useProducts'
import { useLockedPeriods, useLockPeriod, useUnlockPeriod } from '@/hooks/useLockedPeriods'
import type { LockedPeriod } from '@/hooks/useLockedPeriods'
import type { Professional, PaymentMethodConfig, FixedCost, Product } from '@/types'

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

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function PeriodLockList({
  lockedPeriods,
  onLock,
  onUnlock,
}: {
  lockedPeriods: LockedPeriod[]
  onLock: (year: number, month: number) => Promise<void>
  onUnlock: (year: number, month: number) => Promise<void>
}) {
  const now = new Date()
  const rows: { year: number; month: number }[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    rows.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  const [pending, setPending] = useState<string | null>(null)

  async function toggle(year: number, month: number, isLocked: boolean) {
    const key = `${year}-${month}`
    setPending(key)
    try {
      if (isLocked) {
        await onUnlock(year, month)
      } else {
        await onLock(year, month)
      }
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
      {rows.map(({ year, month }) => {
        const isLocked = lockedPeriods.some(p => p.year === year && p.month === month)
        const key = `${year}-${month}`
        const isPending = pending === key
        return (
          <div key={key} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-[var(--color-text)]">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <div className="flex items-center gap-3">
              {isLocked && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>
                  Cerrado
                </span>
              )}
              <button
                onClick={() => toggle(year, month, isLocked)}
                disabled={isPending}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40"
                style={isLocked
                  ? { borderColor: 'var(--color-border)', color: 'var(--color-muted)', background: 'var(--color-bg)' }
                  : { borderColor: 'var(--color-accent)', color: 'var(--color-accent)', background: 'var(--color-accent-light)' }
                }
              >
                {isLocked ? <LockOpen size={12} /> : <Lock size={12} />}
                {isLocked ? 'Reabrir' : 'Cerrar'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

type SettingsTab = 'general' | 'operaciones' | 'costos' | 'catalogo' | 'periodos'

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as SettingsTab) ?? 'general'
  function setActiveTab(tab: SettingsTab) {
    setSearchParams(prev => { prev.set('tab', tab); return prev })
  }
  const [addingCat, setAddingCat] = useState(false)
  const [catDraft, setCatDraft] = useState('')
  const [catParentDraft, setCatParentDraft] = useState('')
  const catInputRef = useRef<HTMLInputElement>(null)

  const [addingHd, setAddingHd] = useState(false)
  const [hdDraft, setHdDraft] = useState('')
  const hdInputRef = useRef<HTMLInputElement>(null)

  const [addingCatalogFor, setAddingCatalogFor] = useState<string | null>(null)
  const [catalogDraftName, setCatalogDraftName] = useState('')
  const [catalogDraftPrice, setCatalogDraftPrice] = useState('')
  const [catalogDraftPriceTransfer, setCatalogDraftPriceTransfer] = useState('')
  const [catalogDraftPriceCard, setCatalogDraftPriceCard] = useState('')
  const catalogNameRef = useRef<HTMLInputElement>(null)

  const { data: txCategories = [], isLoading: catsLoading } = useTransactionCategories()
  const createCat = useCreateTransactionCategory()
  const updateCat = useUpdateTransactionCategory()
  const deleteCat = useDeleteTransactionCategory()

  const categories = txCategories.filter(c => c.parent_id !== null)
  const parentCategories = txCategories.filter(c => c.parent_id === null)

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

  const [addingUser, setAddingUser] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFullName, setInviteFullName] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'employee'>('employee')
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [inviteErrorMsg, setInviteErrorMsg] = useState<string | null>(null)
  const inviteNameRef = useRef<HTMLInputElement>(null)

  const { profile } = useAuth()
  const updateProfile = useUpdateProfile()
  const { data: users = [] } = useUsers()
  const inviteUser = useInviteUser()
  const updateUserRole = useUpdateUserRole()

  const { data: lockedPeriods = [] } = useLockedPeriods()
  const lockPeriod = useLockPeriod()
  const unlockPeriod = useUnlockPeriod()

  function startAddUser() {
    setAddingUser(true)
    setInviteEmail('')
    setInviteFullName('')
    setInviteRole('employee')
    setInviteSuccess(false)
    setInviteErrorMsg(null)
    setTimeout(() => inviteNameRef.current?.focus(), 0)
  }

  function cancelAddUser() {
    setAddingUser(false)
    setInviteEmail('')
    setInviteFullName('')
    setInviteErrorMsg(null)
  }

  async function saveInvite() {
    if (!inviteEmail.trim() || !inviteFullName.trim()) return
    setInviteErrorMsg(null)
    try {
      await inviteUser.mutateAsync({ email: inviteEmail.trim(), role: inviteRole, full_name: inviteFullName.trim() })
      setInviteSuccess(true)
      setAddingUser(false)
      setInviteEmail('')
      setInviteFullName('')
    } catch (e) {
      setInviteErrorMsg(e instanceof Error ? e.message : 'Error al invitar')
    }
  }

  function handleInviteKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); saveInvite() }
    if (e.key === 'Escape') cancelAddUser()
  }

  function startAddCat() {
    setAddingCat(true)
    setCatDraft('')
    setCatParentDraft('')
    setTimeout(() => catInputRef.current?.focus(), 0)
  }

  async function saveCat() {
    if (!catDraft.trim() || !catParentDraft) return
    await createCat.mutateAsync({ name: catDraft.trim(), parent_id: catParentDraft })
    setAddingCat(false)
    setCatDraft('')
    setCatParentDraft('')
  }

  function cancelCat() {
    setAddingCat(false)
    setCatDraft('')
    setCatParentDraft('')
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
    setCatalogDraftPriceTransfer('')
    setCatalogDraftPriceCard('')
    setTimeout(() => catalogNameRef.current?.focus(), 0)
  }

  async function saveCatalogItem() {
    if (!addingCatalogFor || !catalogDraftName.trim()) return
    const priceTransfer = parseFloat(catalogDraftPriceTransfer)
    const priceCard = parseFloat(catalogDraftPriceCard)
    await createCatalogItem.mutateAsync({
      name: catalogDraftName.trim(),
      price: parseFloat(catalogDraftPrice) || 0,
      price_transfer: isNaN(priceTransfer) ? null : priceTransfer,
      price_card: isNaN(priceCard) ? null : priceCard,
    })
    setAddingCatalogFor(null)
    setCatalogDraftName('')
    setCatalogDraftPrice('')
    setCatalogDraftPriceTransfer('')
    setCatalogDraftPriceCard('')
  }

  function cancelCatalogItem() {
    setAddingCatalogFor(null)
    setCatalogDraftName('')
    setCatalogDraftPrice('')
    setCatalogDraftPriceTransfer('')
    setCatalogDraftPriceCard('')
  }

  function handleCatalogKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); saveCatalogItem() }
    if (e.key === 'Escape') cancelCatalogItem()
  }

  async function handleCatalogItemDelete(id: string) {
    if (!confirm('¿Eliminar este item del catálogo?')) return
    await deleteCatalogItem.mutateAsync(id)
  }


  const { data: fixedCosts = [], isLoading: fcLoading } = useFixedCosts()
  const createFc = useCreateFixedCost()
  const updateFc = useUpdateFixedCost()
  const deleteFc = useDeleteFixedCost()

  const [addingFc, setAddingFc] = useState(false)
  const [fcDraftName, setFcDraftName] = useState('')
  const [fcDraftAmount, setFcDraftAmount] = useState('')
  const fcNameRef = useRef<HTMLInputElement>(null)

  function startAddFc() {
    setAddingFc(true)
    setFcDraftName('')
    setFcDraftAmount('')
    setTimeout(() => fcNameRef.current?.focus(), 0)
  }

  async function saveFc() {
    if (!fcDraftName.trim() || !fcDraftAmount) return
    await createFc.mutateAsync({ name: fcDraftName.trim(), monthly_amount: parseFloat(fcDraftAmount) || 0 })
    setAddingFc(false)
    setFcDraftName('')
    setFcDraftAmount('')
  }

  function cancelFc() {
    setAddingFc(false)
    setFcDraftName('')
    setFcDraftAmount('')
  }

  function handleFcKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); saveFc() }
    if (e.key === 'Escape') cancelFc()
  }

  async function handleFcToggleActive(fc: FixedCost) {
    await updateFc.mutateAsync({ id: fc.id, active: !fc.active })
  }

  async function handleFcDelete(id: string) {
    if (!confirm('¿Eliminar este gasto fijo?')) return
    await deleteFc.mutateAsync(id)
  }

  const activeFcTotal = useMemo(
    () => fixedCosts.filter(fc => fc.active).reduce((s, fc) => s + fc.monthly_amount, 0),
    [fixedCosts]
  )

  const { data: products = [] } = useProducts()
  const { data: allCatalogItems = [] } = useCatalogItems()
  const updateCatalogItemHours = useUpdateCatalogItemHours()
  const upsertRecipes = useUpsertServiceRecipes()

  const serviceItems = useMemo(
    () => allCatalogItems.filter(ci => ci.name.toLowerCase() !== 'seña'),
    [allCatalogItems]
  )

  const [selectedServiceId, setSelectedServiceId] = useState<string>('')
  const [hoursInput, setHoursInput] = useState<string>('')
  const { data: currentRecipes } = useServiceRecipes(selectedServiceId || null)

  type RecipeLine = { product_id: string; quantity_grams: string }
  const [recipeLines, setRecipeLines] = useState<RecipeLine[]>([])

  useEffect(() => {
    const svc = serviceItems.find(s => s.id === selectedServiceId)
    setHoursInput(svc?.hours != null ? String(svc.hours) : '')
  }, [selectedServiceId, serviceItems])

  useEffect(() => {
    setRecipeLines((currentRecipes ?? []).map(r => ({ product_id: r.product_id, quantity_grams: String(r.quantity_grams) })))
  }, [currentRecipes])

  function addRecipeLine() {
    setRecipeLines(lines => [...lines, { product_id: '', quantity_grams: '' }])
  }

  function removeRecipeLine(idx: number) {
    setRecipeLines(lines => lines.filter((_, i) => i !== idx))
  }

  function updateRecipeLine(idx: number, field: keyof RecipeLine, value: string) {
    setRecipeLines(lines => lines.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  async function saveRecipes() {
    if (!selectedServiceId) return
    const valid = recipeLines.filter(l => l.product_id && l.quantity_grams)
    await upsertRecipes.mutateAsync({
      catalogItemId: selectedServiceId,
      recipes: valid.map(l => ({ product_id: l.product_id, quantity_grams: parseFloat(l.quantity_grams) || 0 })),
    })
  }

  async function handleHoursSave() {
    if (!selectedServiceId) return
    const parsed = hoursInput !== '' ? parseFloat(hoursInput) : null
    await updateCatalogItemHours.mutateAsync({ id: selectedServiceId, hours: isNaN(parsed as number) ? null : parsed })
  }

  function getAvgCostPerGram(product: Product): number | null {
    if (!product.unit_size) return null
    const min = product.min_cost ?? 0
    const max = product.max_cost ?? min
    const avg = (min + max) / 2
    return avg / product.unit_size
  }

  const TAB_LABELS: Record<SettingsTab, string> = {
    general: 'General',
    operaciones: 'Operaciones',
    costos: 'Costos',
    catalogo: 'Catálogo',
    periodos: 'Períodos',
  }

  return (
    <div className="animate-fade-in flex-1 min-h-0 flex flex-col">
      <TopBar title="Configuración" subtitle={TAB_LABELS[activeTab]} />

      <div className="flex gap-0 border-b border-[var(--color-border)] px-6 shrink-0">
        {(Object.keys(TAB_LABELS) as SettingsTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        {activeTab === 'general' && (<>
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Negocio</h2>
          {profile && (
            <BusinessNameCard
              name={profile.business_name ?? ''}
              onSave={async v => { await updateProfile.mutateAsync({ id: profile.id, business_name: v || null }) }}
            />
          )}
        </section>

        {profile?.role === 'admin' && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Usuarios</h2>
              <button
                onClick={startAddUser}
                disabled={addingUser}
                className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline disabled:opacity-40"
              >
                <UserPlus size={12} /> Invitar
              </button>
            </div>
            {inviteSuccess && (
              <p className="text-xs text-[var(--color-success)] mb-2">
                Invitación enviada. El usuario recibirá un email para configurar su contraseña.
              </p>
            )}
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={u.role === 'admin' ? 'success' : 'default'}>
                      {u.role === 'admin' ? 'Admin' : 'Empleado'}
                    </Badge>
                    <span className="text-sm text-[var(--color-text)]">
                      {u.full_name || u.email || '(Sin nombre)'}
                    </span>
                    {u.id === profile.id && (
                      <span className="text-xs text-[var(--color-muted)]">(tú)</span>
                    )}
                  </div>
                  {u.id !== profile.id && (
                    <button
                      onClick={() => updateUserRole.mutate({ id: u.id, role: u.role === 'admin' ? 'employee' : 'admin' })}
                      disabled={updateUserRole.isPending}
                      className="px-2 py-1 rounded-lg text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors disabled:opacity-40"
                    >
                      {u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                    </button>
                  )}
                </div>
              ))}
              {addingUser && (
                <div
                  className="flex flex-col gap-2 px-4 py-3 animate-slide-in"
                  style={{
                    background: 'var(--color-accent-light)',
                    borderLeft: '3px solid var(--color-accent)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="shrink-0 text-[10px] font-semibold tracking-widest uppercase px-1.5 py-0.5 rounded"
                      style={{
                        color: 'var(--color-accent)',
                        background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                      }}
                    >
                      Invitar
                    </span>
                    <DraftInput
                      inputRef={inviteNameRef}
                      value={inviteFullName}
                      onChange={setInviteFullName}
                      onKeyDown={handleInviteKeyDown}
                      placeholder="Nombre"
                      autoFocus
                    />
                    <DraftInput
                      value={inviteEmail}
                      onChange={setInviteEmail}
                      onKeyDown={handleInviteKeyDown}
                      placeholder="Email"
                      type="email"
                    />
                    <select
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value as 'admin' | 'employee')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1.5px solid var(--color-border)',
                        padding: '3px 2px',
                        fontSize: '0.875rem',
                        color: 'var(--color-text)',
                        outline: 'none',
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="employee">Empleado</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={saveInvite}
                      disabled={inviteUser.isPending || !inviteEmail.trim() || !inviteFullName.trim()}
                      className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors disabled:opacity-40"
                      style={{ background: 'var(--color-accent)', color: '#fff' }}
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={cancelAddUser}
                      className="flex items-center justify-center w-7 h-7 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {inviteErrorMsg && (
                    <p className="text-xs pl-1" style={{ color: 'var(--color-danger)' }}>{inviteErrorMsg}</p>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
        </>)}

        {activeTab === 'operaciones' && (<>
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
                  <select
                    value={catParentDraft}
                    onChange={e => setCatParentDraft(e.target.value)}
                    style={{ fontSize: '12px', padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                  >
                    <option value="">Grupo...</option>
                    {parentCategories.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
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
                    disabled={createCat.isPending || !catDraft.trim() || !catParentDraft}
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
        </>)}

        {activeTab === 'costos' && (<>
        {fcLoading ? (
          <div className="flex justify-center pt-4">
            <span className="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Gastos fijos</h2>
              <button
                onClick={startAddFc}
                disabled={addingFc}
                className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline disabled:opacity-40"
              >
                <Plus size={12} /> Nuevo
              </button>
            </div>
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {addingFc && (
                <div
                  className="flex items-center gap-2 px-4 py-2.5 animate-slide-in"
                  style={{ background: 'var(--color-accent-light)', borderLeft: '3px solid var(--color-accent)' }}
                >
                  <span
                    className="shrink-0 text-[10px] font-semibold tracking-widest uppercase px-1.5 py-0.5 rounded"
                    style={{ color: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}
                  >
                    Nuevo
                  </span>
                  <DraftInput inputRef={fcNameRef} value={fcDraftName} onChange={setFcDraftName} onKeyDown={handleFcKeyDown} placeholder="Nombre *" autoFocus />
                  <DraftInput value={fcDraftAmount} onChange={setFcDraftAmount} onKeyDown={handleFcKeyDown} placeholder="Monto mensual" type="number" />
                  <button
                    onClick={saveFc}
                    disabled={createFc.isPending || !fcDraftName.trim() || !fcDraftAmount}
                    className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors disabled:opacity-40"
                    style={{ background: 'var(--color-accent)', color: '#fff' }}
                  >
                    <Check size={13} />
                  </button>
                  <button
                    onClick={cancelFc}
                    className="flex items-center justify-center w-7 h-7 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              {fixedCosts.length === 0 && !addingFc && (
                <p className="px-4 py-3 text-sm text-[var(--color-muted)]">Sin gastos fijos</p>
              )}
              {fixedCosts.map(fc => (
                <div key={fc.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <InlineEditCell
                      value={fc.name}
                      onSave={async v => { await updateFc.mutateAsync({ id: fc.id, name: v }) }}
                      className="text-sm text-[var(--color-text)]"
                    />
                    <InlineEditCell
                      value={String(fc.monthly_amount)}
                      type="number"
                      displayValue={`$${fc.monthly_amount.toLocaleString('es-AR')}`}
                      onSave={async v => { await updateFc.mutateAsync({ id: fc.id, monthly_amount: parseFloat(v) || 0 }) }}
                      className="text-sm tabular-nums text-[var(--color-muted)]"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={fc.active ? 'success' : 'default'}>{fc.active ? 'Activo' : 'Inactivo'}</Badge>
                    <button
                      onClick={() => handleFcToggleActive(fc)}
                      className="px-2 py-1 rounded-lg text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
                    >
                      {fc.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      onClick={() => handleFcDelete(fc.id)}
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 text-xs text-[var(--color-muted)]">
                Total activos: <span className="font-semibold text-[var(--color-text)]">${activeFcTotal.toLocaleString('es-AR')}/mes</span>
                {' → '}
                <span className="font-semibold text-[var(--color-text)]">${(activeFcTotal / 160).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hora</span>
                {' (÷ 160)'}
              </div>
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Recetas de servicios</h2>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 min-w-0 space-y-3">
              <Select
                value={selectedServiceId}
                onChange={e => setSelectedServiceId(e.target.value)}
                placeholder="Seleccionar servicio..."
                options={serviceItems.map(s => ({ value: s.id, label: s.name }))}
              />
              {selectedServiceId && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[var(--color-muted)] shrink-0">Horas estimadas:</label>
                  <input
                    type="number"
                    value={hoursInput}
                    onChange={e => setHoursInput(e.target.value)}
                    onBlur={handleHoursSave}
                    placeholder="0"
                    style={{
                      width: '80px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1.5px solid var(--color-border)',
                      padding: '3px 2px',
                      fontSize: '0.875rem',
                      color: 'var(--color-text)',
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              )}
            </div>
            {selectedServiceId && (
              <div className="flex-1 min-w-0">
                <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Insumo</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Gramos/mL</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Costo est.</th>
                        <th className="px-3 py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {recipeLines.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-xs text-[var(--color-muted)]">Sin insumos</td>
                        </tr>
                      )}
                      {recipeLines.map((line, idx) => {
                        const product = products.find(p => p.id === line.product_id)
                        const cpg = product ? getAvgCostPerGram(product) : null
                        const qty = parseFloat(line.quantity_grams) || 0
                        const lineCost = cpg != null ? cpg * qty : null
                        return (
                          <tr key={idx} className="border-t border-[var(--color-border)]">
                            <td className="px-3 py-2">
                              <select
                                value={line.product_id}
                                onChange={e => updateRecipeLine(idx, 'product_id', e.target.value)}
                                className="w-full bg-transparent text-sm text-[var(--color-text)] border-none outline-none"
                              >
                                <option value="">Seleccionar...</option>
                                {products.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}{!p.unit_size ? ' (sin tamaño)' : ''}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                value={line.quantity_grams}
                                onChange={e => updateRecipeLine(idx, 'quantity_grams', e.target.value)}
                                className="w-20 text-right bg-transparent text-sm text-[var(--color-text)] border-none outline-none"
                                placeholder="0"
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-[var(--color-muted)] tabular-nums">
                              {lineCost != null ? `$${lineCost.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => removeRecipeLine(idx)}
                                className="p-1 rounded text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
                              >
                                <X size={13} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 border-t border-[var(--color-border)] flex items-center justify-between gap-2">
                    <button
                      onClick={addRecipeLine}
                      className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
                    >
                      <Plus size={12} /> Agregar insumo
                    </button>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[var(--color-muted)]">
                        Costo total:{' '}
                        <span className="font-semibold text-[var(--color-text)]">
                          ${recipeLines.reduce((s, line) => {
                            const product = products.find(p => p.id === line.product_id)
                            const cpg = product ? getAvgCostPerGram(product) : null
                            const qty = parseFloat(line.quantity_grams) || 0
                            return s + (cpg != null ? cpg * qty : 0)
                          }, 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </span>
                      <button
                        onClick={saveRecipes}
                        disabled={upsertRecipes.isPending}
                        className="px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                        style={{ background: 'var(--color-accent)', color: '#fff' }}
                      >
                        Guardar receta
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
        </>)}

        {activeTab === 'catalogo' && (
        <>
          <section>
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Catálogo</h2>
            <div className="space-y-4">
              <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                        Servicios
                      </span>
                      <button
                        onClick={() => startAddCatalogItem('__catalog__')}
                        disabled={addingCatalogFor !== null}
                        className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline disabled:opacity-40"
                      >
                        <Plus size={12} /> Nuevo
                      </button>
                    </div>
                    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                      {catalogItems.length === 0 && addingCatalogFor !== '__catalog__' && (
                        <p className="px-4 py-3 text-sm text-[var(--color-muted)]">Sin items</p>
                      )}
                      {catalogItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-6 flex-1 min-w-0">
                            <InlineEditCell
                              value={item.name}
                              onSave={async v => { await updateCatalogItem.mutateAsync({ id: item.id, name: v }) }}
                              className="text-sm text-[var(--color-text)]"
                            />
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] text-[var(--color-muted)]">Efectivo</span>
                                <InlineEditCell
                                  value={String(item.price)}
                                  type="number"
                                  onSave={async v => { await updateCatalogItem.mutateAsync({ id: item.id, price: parseFloat(v) || 0 }) }}
                                  className="text-sm tabular-nums text-[var(--color-muted)]"
                                />
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] text-[var(--color-muted)]">Transf.</span>
                                <InlineEditCell
                                  value={item.price_transfer != null ? String(item.price_transfer) : ''}
                                  type="number"
                                  placeholder="—"
                                  onSave={async v => {
                                    const n = parseFloat(v)
                                    await updateCatalogItem.mutateAsync({ id: item.id, price_transfer: isNaN(n) ? null : n })
                                  }}
                                  className="text-sm tabular-nums text-[var(--color-muted)]"
                                />
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] text-[var(--color-muted)]">Tarjeta</span>
                                <InlineEditCell
                                  value={item.price_card != null ? String(item.price_card) : ''}
                                  type="number"
                                  placeholder="—"
                                  onSave={async v => {
                                    const n = parseFloat(v)
                                    await updateCatalogItem.mutateAsync({ id: item.id, price_card: isNaN(n) ? null : n })
                                  }}
                                  className="text-sm tabular-nums text-[var(--color-muted)]"
                                />
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleCatalogItemDelete(item.id)}
                            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {addingCatalogFor === '__catalog__' && (
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
                            placeholder="Efectivo"
                            type="number"
                          />
                          <DraftInput
                            value={catalogDraftPriceTransfer}
                            onChange={setCatalogDraftPriceTransfer}
                            onKeyDown={handleCatalogKeyDown}
                            placeholder="Transf."
                            type="number"
                          />
                          <DraftInput
                            value={catalogDraftPriceCard}
                            onChange={setCatalogDraftPriceCard}
                            onKeyDown={handleCatalogKeyDown}
                            placeholder="Tarjeta"
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
            </div>
          </section>
        </>)}

        {activeTab === 'periodos' && profile?.role === 'admin' && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-1">Períodos cerrados</h2>
          <p className="text-xs text-[var(--color-muted)] mb-4">
            Un período cerrado impide crear, editar o anular transacciones con fecha dentro de ese mes. El cierre se aplica a todos los usuarios.
          </p>
          <PeriodLockList
            lockedPeriods={lockedPeriods}
            onLock={async (year, month) => { await lockPeriod.mutateAsync({ year, month }) }}
            onUnlock={async (year, month) => { await unlockPeriod.mutateAsync({ year, month }) }}
          />
        </section>
        )}
      </div>
    </div>
  )
}
