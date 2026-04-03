import { useState, useRef } from 'react'
import { Plus, X, Check, Link, Ban } from 'lucide-react'
import { formatDate } from '@/lib/formatDate'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Table } from '@/components/ui/Table'
import { Modal } from '@/components/ui/Modal'
import { useTransactions, useCreateTransaction, useUpdateTransaction, useVoidTransaction, usePaymentMethodBalances, useUnrefundedAnticipos } from '@/hooks/useTransactions'
import { useLockedPeriods } from '@/hooks/useLockedPeriods'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useTransactionCategories } from '@/hooks/useTransactionCategories'
import { useProfessionals } from '@/hooks/useProfessionals'
import { useCatalogItems } from '@/hooks/useCatalogItems'
import { useProducts } from '@/hooks/useProducts'
import { supabase } from '@/lib/supabaseClient'
import { ReconcileModal } from './ReconcileModal'
import type { Transaction, TransactionType, Currency, PaymentMethod, PaymentInstrument, CatalogItem, Product } from '@/types'
import type { PaymentRow } from '@/hooks/useTransactions'

const INSTRUMENT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Sin instrumento' },
  { value: 'Transferencia', label: 'Transferencia' },
  { value: 'Tarjeta', label: 'Tarjeta' },
]

function makeEmptyPayment(defaultMethod = 'Efectivo'): PaymentRow {
  return { payment_method: defaultMethod, instrument: null, amount: 0 }
}

const CURRENCY_OPTIONS: { value: Currency; label: string }[] = [
  { value: 'ARS', label: 'ARS' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
]

const CURRENCY_FILTER_OPTIONS = [
  { value: '', label: 'Todas las monedas' },
  ...CURRENCY_OPTIONS,
]

const EMPTY_DRAFT = {
  date: new Date().toISOString().slice(0, 10),
  currency: 'ARS' as Currency,
  category_parent_id: '',
  subcategory_id: '',
  catalog_item_id: null as string | null,
  description: '',
  seña_amount: '',
  refunds_anticipo_id: null as string | null,
  transfer_direction: 'entrada' as 'entrada' | 'salida',
  payments: [makeEmptyPayment()] as PaymentRow[],
  professionals: [] as { id: string; commission_rate: number }[],
  product_id: null as string | null,
  product_quantity: 1,
  inventory_items: [] as Array<{ product_id: string; quantity: number }>,
}

function calcTotal(payments: PaymentRow[]) {
  return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
}

const CURRENCY_SYMBOL: Record<Currency, string> = { ARS: '$', USD: 'U$D', EUR: '€' }

function getTxDirection(tx: Transaction): 'entrada' | 'salida' {
  if (tx.is_seña) return tx.description?.trim().toLowerCase() === 'anticipo' ? 'entrada' : 'salida'
  const txType = tx.subcategory?.transaction_type
  if (txType === 'income') return 'entrada'
  if (txType === 'expense') return 'salida'
  return (tx.payments?.[0]?.type as 'entrada' | 'salida') ?? 'entrada'
}

type Suggestion = {
  id: string
  name: string
  priceCash: number
  priceTransfer: number | null
  priceCard: number | null
  productId?: string
}

function DescriptionCombobox({
  value,
  onChange,
  onSelect,
  suggestions,
}: {
  value: string
  onChange: (v: string) => void
  onSelect: (s: Suggestion) => void
  suggestions: Suggestion[]
}) {
  const [open, setOpen] = useState(false)
  const filtered = suggestions.filter(s =>
    value.length > 0 && s.name.toLowerCase().includes(value.toLowerCase())
  )

  return (
    <div className="relative flex-1" style={{ minWidth: '160px' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => { if (value.length > 0) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Descripción"
        style={{
          width: '100%',
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
      {open && filtered.length > 0 && (
        <div
          className="absolute left-0 top-full mt-1 rounded-lg border border-[var(--color-border)] shadow-lg overflow-hidden"
          style={{ background: 'var(--color-surface)', zIndex: 50, minWidth: '200px' }}
        >
          {filtered.map(s => (
            <div
              key={s.id}
              className="px-3 py-2 text-sm border-b border-[var(--color-border)] last:border-0 cursor-pointer hover:bg-[var(--color-bg)]"
              style={{ color: 'var(--color-text)' }}
              onMouseDown={() => { onSelect(s); setOpen(false) }}
            >
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const INLINE_SELECT_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderBottom: '1.5px solid var(--color-border)',
  padding: '3px 2px',
  fontSize: '0.875rem',
  color: 'var(--color-text)',
  outline: 'none',
  fontFamily: 'inherit',
}

export function TransactionsPage() {
  const [parentCategoryFilter, setParentCategoryFilter] = useState('')
  const [currencyFilter, setCurrencyFilter] = useState<Currency | ''>('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showVoided, setShowVoided] = useState(false)

  const [draft, setDraft] = useState<typeof EMPTY_DRAFT | null>(null)
  const [draftSelectedSuggestion, setDraftSelectedSuggestion] = useState<Suggestion | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [editForm, setEditForm] = useState(EMPTY_DRAFT)
  const [formError, setFormError] = useState('')

  const { data: txCategories = [] } = useTransactionCategories()
  const { data: professionals = [] } = useProfessionals()
  const { data: catalogItems = [] } = useCatalogItems()
  const { data: products = [] } = useProducts()
  const { data: unrefundedAnticipos = [] } = useUnrefundedAnticipos()
  const createTx = useCreateTransaction()
  const updateTx = useUpdateTransaction()
  const voidTx = useVoidTransaction()
  const { data: lockedPeriods = [] } = useLockedPeriods()
  const { data: paymentBalances = [] } = usePaymentMethodBalances({ from: from || undefined, to: to || undefined, currency: currencyFilter || undefined })
  const { data: paymentMethodsData = [] } = usePaymentMethods()
  const paymentMethodOptions = paymentMethodsData
    .filter(pm => pm.active)
    .map(pm => ({ value: pm.name, label: pm.name }))

  const activeProfessionals = professionals.filter(h => h.active)

  function isDateLocked(date: string) {
    const d = new Date(date + 'T00:00:00')
    return lockedPeriods.some(p => p.year === d.getFullYear() && p.month === d.getMonth() + 1)
  }

  const parents = txCategories.filter(c => c.parent_id === null)
  const subcategories = txCategories.filter(c => c.parent_id !== null)

  function subcatsForParent(parentId: string) {
    return subcategories.filter(c => c.parent_id === parentId)
  }

  function typeFromParent(parentId: string): TransactionType {
    const name = parents.find(p => p.id === parentId)?.name ?? ''
    if (name === 'Ingresos') return 'income'
    if (name === 'Movimientos') return 'transfer'
    return 'expense'
  }

  const filterSubcatIds = parentCategoryFilter ? subcatsForParent(parentCategoryFilter).map(c => c.id) : undefined

  const { data: transactions = [], isLoading } = useTransactions({
    subcategoryIds: filterSubcatIds,
    currency: currencyFilter || undefined,
    from: from || undefined,
    to: to || undefined,
    showVoided,
  })

  const filteredTransactions = paymentMethodFilter
    ? transactions.filter(tx => tx.payments?.some(p => p.payment_method.toLowerCase() === paymentMethodFilter.toLowerCase()))
    : transactions

  const totals = filteredTransactions
    .filter(tx => !tx.voided_at)
    .reduce((acc, tx) => {
      const dir = getTxDirection(tx)
      const cur = tx.currency
      if (!acc[cur]) acc[cur] = { entrada: 0, salida: 0 }
      if (dir === 'entrada') acc[cur].entrada += tx.amount
      else acc[cur].salida += tx.amount
      return acc
    }, {} as Record<string, { entrada: number; salida: number }>)

  const refundedAntipoIds = new Set(
    transactions.filter(t => t.refunds_anticipo_id !== null).map(t => t.refunds_anticipo_id as string)
  )

  const isDraftServiceCategory = subcategories.find(c => c.id === draft?.subcategory_id)?.name.toLowerCase() === 'servicio'
  const isEditServiceCategory = subcategories.find(c => c.id === editForm.subcategory_id)?.name.toLowerCase() === 'servicio'
  const isDraftProductCategory = subcategories.find(c => c.id === draft?.subcategory_id)?.name.toLowerCase() === 'producto'
  const isDraftInventoryCategory = !!(draft && subcategories.find(c => c.id === draft.subcategory_id)?.deducts_inventory)

  const fifoCostsRef = useRef<Record<string, number>>({})

  function computeInventoryTotal(items: Array<{ product_id: string; quantity: number }>) {
    return items.reduce((sum, item) => sum + (fifoCostsRef.current[item.product_id] ?? 0) * item.quantity, 0)
  }

  async function handleInventoryProductChange(index: number, productId: string) {
    const updated = (draft?.inventory_items ?? []).map((item, i) => i === index ? { ...item, product_id: productId } : item)
    if (productId && !(productId in fifoCostsRef.current)) {
      const { data } = await supabase
        .from('inventory_lots')
        .select('unit_cost')
        .eq('product_id', productId)
        .gt('remaining_quantity', 0)
        .order('received_date', { ascending: true })
        .limit(1)
        .single()
      fifoCostsRef.current[productId] = data?.unit_cost ?? 0
    }
    setDraft(d => {
      if (!d) return d
      const items = updated
      const total = items.reduce((sum, item) => sum + (fifoCostsRef.current[item.product_id] ?? 0) * item.quantity, 0)
      return { ...d, inventory_items: items, payments: [{ payment_method: 'Inventario', instrument: null, amount: total }] }
    })
  }

  function handleInventoryQuantityChange(index: number, quantity: number) {
    setDraft(d => {
      if (!d) return d
      const items = d.inventory_items.map((item, i) => i === index ? { ...item, quantity } : item)
      const total = items.reduce((sum, item) => sum + (fifoCostsRef.current[item.product_id] ?? 0) * item.quantity, 0)
      return { ...d, inventory_items: items, payments: [{ payment_method: 'Inventario', instrument: null, amount: total }] }
    })
  }

  const draftSuggestions: Suggestion[] = isDraftProductCategory
    ? products
        .filter((p: Product) => (p.stock ?? 0) > 0)
        .map((p: Product) => ({ id: p.id, name: p.name, priceCash: p.sale_price, priceTransfer: null, priceCard: null, productId: p.id }))
    : catalogItems.map((ci: CatalogItem) => ({ id: ci.id, name: ci.name, priceCash: ci.price, priceTransfer: ci.price_transfer ?? null, priceCard: ci.price_card ?? null }))

  function startNew() {
    setFormError('')
    setDraftSelectedSuggestion(null)
    const ingrenosParent = parents.find(p => p.name === 'Ingresos')
    setDraft({ ...EMPTY_DRAFT, date: new Date().toISOString().slice(0, 10), category_parent_id: ingrenosParent?.id ?? '' })
  }

  function cancelNew() {
    setDraft(null)
    setDraftSelectedSuggestion(null)
    setFormError('')
  }

  function openEdit(tx: Transaction) {
    setEditing(tx)
    setEditForm({
      date: tx.date,
      currency: tx.currency,
      category_parent_id: tx.subcategory?.parent_id ?? '',
      subcategory_id: tx.subcategory_id ?? '',
      catalog_item_id: tx.catalog_item_id ?? null,
      description: tx.description ?? '',
      seña_amount: tx.seña_amount != null ? String(tx.seña_amount) : '',
      refunds_anticipo_id: tx.refunds_anticipo_id ?? null,
      transfer_direction: (tx.payments?.[0]?.type === 'entrada' || tx.payments?.[0]?.type === 'salida')
        ? tx.payments[0].type
        : 'entrada',
      payments: tx.payments && tx.payments.length > 0
        ? tx.payments.map(p => {
            const validMethod = paymentMethodsData.some(pm => pm.active && pm.name === p.payment_method)
            return {
              payment_method: validMethod ? p.payment_method : (paymentMethodsData.find(pm => pm.active)?.name ?? p.payment_method),
              instrument: p.instrument,
              amount: p.amount,
            }
          })
        : [makeEmptyPayment()],
      professionals: tx.professionals?.map(h => ({ id: h.id, commission_rate: h.commission_rate })) ?? [],
      product_id: null,
      product_quantity: 1,
      inventory_items: [],
    })
    setFormError('')
    setModalOpen(true)
  }

  function handleSuggestionSelect(s: Suggestion) {
    setDraftSelectedSuggestion(s)
    setDraft(d => d && {
      ...d,
      description: s.name,
      product_id: s.productId ?? null,
      catalog_item_id: s.productId ? null : s.id,
    })
  }

  async function handleCreate() {
    if (!draft) return
    const isInventoryCategory = !!subcategories.find(c => c.id === draft.subcategory_id)?.deducts_inventory
    const total = isInventoryCategory
      ? computeInventoryTotal(draft.inventory_items)
      : calcTotal(draft.payments)
    if (!draft.date) {
      setFormError('La fecha es obligatoria.')
      return
    }
    if (isInventoryCategory && draft.inventory_items.filter(i => i.product_id).length === 0) {
      setFormError('Agregá al menos un producto para descontar del inventario.')
      return
    }
    if (!isInventoryCategory && total <= 0) {
      setFormError('Fecha y al menos un pago con monto son obligatorios.')
      return
    }
    if (isDateLocked(draft.date)) {
      setFormError('El período de esa fecha está cerrado. No se pueden crear transacciones en períodos cerrados.')
      return
    }
    const transactionType = typeFromParent(draft.category_parent_id)
    const draftDesc = draft.description.trim().toLowerCase()
    const isAnticipo = draftDesc === 'anticipo'
    const isDevolución = draftDesc === 'devolución de anticipo'
    const draftSubcatName = subcategories.find(c => c.id === draft.subcategory_id)?.name ?? null
    const tx = await createTx.mutateAsync({
      date: draft.date,
      transaction_type: transactionType,
      currency: draft.currency,
      subcategory_id: draft.subcategory_id || null,
      subcategory_name: draftSubcatName,
      catalog_item_id: draft.catalog_item_id ?? null,
      description: draft.description || null,
      is_seña: isAnticipo || isDevolución,
      seña_amount: !isAnticipo && !isDevolución && isDraftServiceCategory && draft.seña_amount ? parseFloat(draft.seña_amount) : null,
      refunds_anticipo_id: isDevolución ? draft.refunds_anticipo_id : null,
      transfer_direction: transactionType === 'transfer' ? draft.transfer_direction : undefined,
      payments: isInventoryCategory
        ? [{ payment_method: 'Inventario', instrument: null, amount: total }]
        : draft.payments.map(p => ({ ...p, instrument: p.instrument || null, amount: Number(p.amount) })),
      professionals: draft.professionals,
    })
    const { data: { user } } = await supabase.auth.getUser()
    if (isInventoryCategory) {
      for (const item of draft.inventory_items.filter(i => i.product_id)) {
        const { error: fifoError } = await supabase.rpc('consume_inventory_fifo', {
          p_product_id: item.product_id,
          p_quantity: item.quantity,
          p_transaction_id: tx.id,
          p_unit_sale_price: 0,
          p_created_by: user!.id,
        })
        if (fifoError) throw new Error(fifoError.message)
      }
    } else if (draft.product_id && transactionType === 'expense') {
      const { error: fifoError } = await supabase.rpc('consume_inventory_fifo', {
        p_product_id: draft.product_id,
        p_quantity: draft.product_quantity,
        p_transaction_id: tx.id,
        p_unit_sale_price: total,
        p_created_by: user!.id,
      })
      if (fifoError) throw new Error(fifoError.message)
    }
    setDraft(null)
    setFormError('')
  }

  async function handleUpdate() {
    const total = calcTotal(editForm.payments)
    if (!editForm.date || total <= 0) {
      setFormError('Fecha y al menos un pago con monto son obligatorios.')
      return
    }
    if (isDateLocked(editForm.date)) {
      setFormError('El período de esa fecha está cerrado. No se pueden editar transacciones en períodos cerrados.')
      return
    }
    const editTransactionType = typeFromParent(editForm.category_parent_id)
    const editDesc = editForm.description.trim().toLowerCase()
    const isEditAnticipo = editDesc === 'anticipo'
    const isEditDevolución = editDesc === 'devolución de anticipo'
    await updateTx.mutateAsync({
      id: editing!.id,
      date: editForm.date,
      transaction_type: editTransactionType,
      currency: editForm.currency,
      amount: total,
      subcategory_id: editForm.subcategory_id || null,
      catalog_item_id: editForm.catalog_item_id ?? null,
      description: editForm.description || null,
      is_seña: isEditAnticipo || isEditDevolución,
      seña_amount: !isEditAnticipo && !isEditDevolución && isEditServiceCategory && editForm.seña_amount ? parseFloat(editForm.seña_amount) : null,
      refunds_anticipo_id: isEditDevolución ? editForm.refunds_anticipo_id : null,
      transfer_direction: editTransactionType === 'transfer' ? editForm.transfer_direction : undefined,
      payments: editForm.payments.map(p => ({ ...p, instrument: p.instrument || null, amount: Number(p.amount) })),
      professionals: editForm.professionals,
    })
    setModalOpen(false)
  }

  async function handleVoid(id: string) {
    const tx = transactions.find(t => t.id === id)
    if (tx && isDateLocked(tx.date)) {
      alert('El período de esa transacción está cerrado. No se pueden anular transacciones en períodos cerrados.')
      return
    }
    if (!confirm('¿Anular esta transacción? La acción quedará registrada.')) return
    await voidTx.mutateAsync(id)
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
        colSpan={9}
        style={{ borderLeft: '3px solid var(--color-accent)', padding: '12px 16px' }}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="shrink-0 text-[10px] font-semibold tracking-widest uppercase px-1.5 py-0.5 rounded"
              style={{
                color: 'var(--color-accent)',
                background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
              }}
            >
              Nueva
            </span>
            <input
              type="date"
              value={draft.date}
              onChange={e => setDraft(d => d && { ...d, date: e.target.value })}
              style={{ ...INLINE_SELECT_STYLE, width: '130px' }}
            />
            <select
              value={draft.currency}
              onChange={e => setDraft(d => d && { ...d, currency: e.target.value as Currency })}
              style={INLINE_SELECT_STYLE}
            >
              {CURRENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={draft.category_parent_id}
              onChange={e => setDraft(d => d && { ...d, category_parent_id: e.target.value, subcategory_id: '' })}
              style={INLINE_SELECT_STYLE}
            >
              <option value="">Categoría</option>
              {parents.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={draft.subcategory_id}
              onChange={e => setDraft(d => d && { ...d, subcategory_id: e.target.value, product_id: null, product_quantity: 1, inventory_items: [] })}
              style={INLINE_SELECT_STYLE}
              disabled={!draft.category_parent_id}
            >
              <option value="">Subcategoría</option>
              {subcatsForParent(draft.category_parent_id).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {typeFromParent(draft.category_parent_id) === 'transfer' && (
              <select
                value={draft.transfer_direction}
                onChange={e => setDraft(d => d && { ...d, transfer_direction: e.target.value as 'entrada' | 'salida' })}
                style={INLINE_SELECT_STYLE}
              >
                <option value="entrada">Entrada</option>
                <option value="salida">Salida</option>
              </select>
            )}
            <DescriptionCombobox
              value={draft.description}
              onChange={v => { setDraftSelectedSuggestion(null); setDraft(d => d && { ...d, description: v, product_id: null, product_quantity: 1 }) }}
              onSelect={handleSuggestionSelect}
              suggestions={draftSuggestions}
            />
            {isDraftProductCategory && draft.product_id && (
              <input
                type="number"
                min="1"
                step="1"
                value={draft.product_quantity}
                onChange={e => setDraft(d => d && { ...d, product_quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                style={{ ...INLINE_SELECT_STYLE, width: '70px' }}
                placeholder="Cant."
              />
            )}
          </div>

          {isDraftInventoryCategory && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-[var(--color-muted)]">Productos a descontar</span>
                <button
                  type="button"
                  onClick={() => setDraft(d => d && { ...d, inventory_items: [...d.inventory_items, { product_id: '', quantity: 1 }] })}
                  className="text-xs text-[var(--color-accent)] hover:underline"
                >
                  + Agregar producto
                </button>
              </div>
              {draft.inventory_items.length === 0 && (
                <p className="text-xs text-[var(--color-muted)]">Agregá al menos un producto.</p>
              )}
              {draft.inventory_items.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={item.product_id}
                    onChange={e => handleInventoryProductChange(i, e.target.value)}
                    style={INLINE_SELECT_STYLE}
                  >
                    <option value="">— producto —</option>
                    {products.filter((p: Product) => (p.stock ?? 0) > 0).map((p: Product) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={item.quantity}
                    onChange={e => handleInventoryQuantityChange(i, Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ ...INLINE_SELECT_STYLE, width: '65px' }}
                    placeholder="Cant."
                  />
                  {item.product_id && fifoCostsRef.current[item.product_id] != null && (
                    <span className="text-xs text-[var(--color-muted)]">
                      costo: ${(fifoCostsRef.current[item.product_id] * item.quantity).toLocaleString('es-CO')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setDraft(d => {
                      if (!d) return d
                      const items = d.inventory_items.filter((_, ii) => ii !== i)
                      const total = items.reduce((sum, it) => sum + (fifoCostsRef.current[it.product_id] ?? 0) * it.quantity, 0)
                      return { ...d, inventory_items: items, payments: [{ payment_method: 'Inventario', instrument: null, amount: total }] }
                    })}
                    className="text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              {draft.inventory_items.length > 0 && (
                <p className="text-xs text-[var(--color-muted)]">
                  Total costo: ${computeInventoryTotal(draft.inventory_items).toLocaleString('es-CO')}
                </p>
              )}
            </div>
          )}

          {draftSelectedSuggestion && (draftSelectedSuggestion.priceCash > 0 || draftSelectedSuggestion.priceTransfer != null || draftSelectedSuggestion.priceCard != null) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {draftSelectedSuggestion.priceCash > 0 && (
                <button
                  type="button"
                  onClick={() => setDraft(d => d && { ...d, payments: d.payments.map((p, i) => i === 0 ? { ...p, amount: draftSelectedSuggestion.priceCash } : p) })}
                  className="text-xs px-2 py-0.5 rounded-full border transition-colors text-[var(--color-muted)] hover:bg-[var(--color-accent)] hover:text-[#fff] hover:border-[var(--color-accent)]"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  ${draftSelectedSuggestion.priceCash.toLocaleString('es-CO')}
                </button>
              )}
              {draftSelectedSuggestion.priceTransfer != null && (
                <button
                  type="button"
                  onClick={() => setDraft(d => d && { ...d, payments: d.payments.map((p, i) => i === 0 ? { ...p, amount: draftSelectedSuggestion.priceTransfer! } : p) })}
                  className="text-xs px-2 py-0.5 rounded-full border transition-colors text-[var(--color-muted)] hover:bg-[var(--color-accent)] hover:text-[#fff] hover:border-[var(--color-accent)]"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  ${draftSelectedSuggestion.priceTransfer.toLocaleString('es-CO')}
                </button>
              )}
              {draftSelectedSuggestion.priceCard != null && (
                <button
                  type="button"
                  onClick={() => setDraft(d => d && { ...d, payments: d.payments.map((p, i) => i === 0 ? { ...p, amount: draftSelectedSuggestion.priceCard! } : p) })}
                  className="text-xs px-2 py-0.5 rounded-full border transition-colors text-[var(--color-muted)] hover:bg-[var(--color-accent)] hover:text-[#fff] hover:border-[var(--color-accent)]"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  ${draftSelectedSuggestion.priceCard.toLocaleString('es-CO')}
                </button>
              )}
            </div>
          )}

          {!isDraftInventoryCategory && <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-[var(--color-muted)]">Métodos de pago</span>
              <button
                type="button"
                onClick={() => setDraft(d => d && { ...d, payments: [...d.payments, makeEmptyPayment()] })}
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                + Agregar fila
              </button>
            </div>
            {draft.payments.map((p, i) => (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <select
                  value={p.payment_method}
                  onChange={e => setDraft(d => d && { ...d, payments: d.payments.map((pp, ii) => ii === i ? { ...pp, payment_method: e.target.value as PaymentMethod } : pp) })}
                  style={INLINE_SELECT_STYLE}
                >
                  {paymentMethodOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select
                  value={p.instrument ?? ''}
                  onChange={e => setDraft(d => d && { ...d, payments: d.payments.map((pp, ii) => ii === i ? { ...pp, instrument: (e.target.value as PaymentInstrument) || null } : pp) })}
                  style={INLINE_SELECT_STYLE}
                >
                  {INSTRUMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={p.amount === 0 ? '' : String(p.amount)}
                  onChange={e => setDraft(d => d && { ...d, payments: d.payments.map((pp, ii) => ii === i ? { ...pp, amount: parseFloat(e.target.value) || 0 } : pp) })}
                  placeholder="$0"
                  style={{ ...INLINE_SELECT_STYLE, width: '80px', textAlign: 'right' }}
                />
                {draft.payments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setDraft(d => d && { ...d, payments: d.payments.filter((_, ii) => ii !== i) })}
                    className="text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>}

          {isDraftServiceCategory && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-[var(--color-muted)]">Profesionales</span>
                {activeProfessionals.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDraft(d => d && { ...d, professionals: [...d.professionals, { id: activeProfessionals[0].id, commission_rate: 0 }] })}
                    className="text-xs text-[var(--color-accent)] hover:underline"
                  >
                    + Agregar profesional
                  </button>
                )}
              </div>
              {draft.professionals.map((pa, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={pa.id}
                    onChange={e => setDraft(d => d && { ...d, professionals: d.professionals.map((p, ii) => ii === i ? { ...p, id: e.target.value } : p) })}
                    style={INLINE_SELECT_STYLE}
                  >
                    {activeProfessionals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={pa.commission_rate === 0 ? '' : String(pa.commission_rate)}
                    onChange={e => setDraft(d => d && { ...d, professionals: d.professionals.map((p, ii) => ii === i ? { ...p, commission_rate: parseFloat(e.target.value) || 0 } : p) })}
                    placeholder="0"
                    style={{ ...INLINE_SELECT_STYLE, width: '52px', textAlign: 'right' }}
                  />
                  <span className="text-xs text-[var(--color-muted)]">%</span>
                  <button
                    type="button"
                    onClick={() => setDraft(d => d && { ...d, professionals: d.professionals.filter((_, ii) => ii !== i) })}
                    className="text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            {isDraftServiceCategory && draft.description.trim().toLowerCase() !== 'anticipo' && draft.description.trim().toLowerCase() !== 'devolución de anticipo' && (
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.seña_amount}
                onChange={e => setDraft(d => d && { ...d, seña_amount: e.target.value })}
                placeholder="Anticipo cobrado previamente"
                style={{ ...INLINE_SELECT_STYLE, width: '210px' }}
              />
            )}
            {draft.description.trim().toLowerCase() === 'devolución de anticipo' && (
              <select
                value={draft.refunds_anticipo_id ?? ''}
                onChange={e => {
                  const anticipo = unrefundedAnticipos.find(a => a.id === e.target.value)
                  const parentId = anticipo?.subcategory_id
                    ? txCategories.find(c => c.id === anticipo.subcategory_id)?.parent_id ?? ''
                    : ''
                  setDraft(d => d && {
                    ...d,
                    refunds_anticipo_id: e.target.value || null,
                    subcategory_id: anticipo?.subcategory_id ?? d.subcategory_id,
                    category_parent_id: parentId || d.category_parent_id,
                  })
                }}
                style={INLINE_SELECT_STYLE}
              >
                <option value="">Anticipo a devolver...</option>
                {unrefundedAnticipos.filter(a => a.date <= draft.date).map(a => (
                  <option key={a.id} value={a.id}>
                    {formatDate(a.date)} — ${a.amount.toLocaleString('es-CO')} {a.currency !== 'ARS' ? a.currency : ''}
                  </option>
                ))}
              </select>
            )}
            <span className="text-sm font-semibold text-[var(--color-text)] ml-auto tabular-nums">
              Total: {CURRENCY_SYMBOL[draft.currency]}{calcTotal(draft.payments).toLocaleString('es-CO')}
            </span>
            {formError && (
              <span className="text-xs text-[var(--color-danger)]">{formError}</span>
            )}
            <button
              onClick={handleCreate}
              disabled={createTx.isPending}
              title="Guardar"
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors disabled:opacity-40"
              style={{ background: 'var(--color-accent)', color: '#fff' }}
            >
              <Check size={13} />
            </button>
            <button
              onClick={cancelNew}
              title="Cancelar"
              className="flex items-center justify-center w-7 h-7 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </td>
    </tr>
  ) : undefined

  const columns = [
    {
      key: 'date',
      header: 'Fecha',
      render: (tx: Transaction) => (
        <span className="text-[var(--color-muted)]" style={tx.voided_at ? { opacity: 0.5 } : undefined}>{formatDate(tx.date)}</span>
      ),
    },
    {
      key: 'description',
      header: 'Descripción',
      render: (tx: Transaction) => (
        <div className="flex flex-col gap-0.5" style={tx.voided_at ? { opacity: 0.5 } : undefined}>
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--color-text)]">{tx.description || '—'}</span>
            {tx.voided_at && <Badge variant="danger">Anulada</Badge>}
            {tx.is_seña && !tx.voided_at && tx.description?.trim().toLowerCase() === 'anticipo' && refundedAntipoIds.has(tx.id) && <Badge variant="warning">Devuelta</Badge>}
          </div>
          {tx.professionals && tx.professionals.length > 0 && (
            <span className="text-xs text-[var(--color-muted)]">
              {tx.professionals.map(h => h.name).join(', ')}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Categoría',
      render: (tx: Transaction) => {
        const parent = tx.subcategory ? txCategories.find(c => c.id === tx.subcategory!.parent_id) : null
        return <span className="text-[var(--color-muted)] text-xs" style={tx.voided_at ? { opacity: 0.5 } : undefined}>{parent?.name || '—'}</span>
      },
    },
    {
      key: 'subcategory',
      header: 'Subcategoría',
      render: (tx: Transaction) => (
        <span className="text-[var(--color-muted)] text-xs" style={tx.voided_at ? { opacity: 0.5 } : undefined}>{tx.subcategory?.name || '—'}</span>
      ),
    },
    {
      key: 'payments',
      header: 'Métodos',
      render: (tx: Transaction) => (
        <div className="flex flex-wrap gap-1" style={tx.voided_at ? { opacity: 0.5 } : undefined}>
          {tx.payments && tx.payments.length > 0
            ? tx.payments.map((p, i) => (
                <Badge key={i} variant="default">{p.payment_method}</Badge>
              ))
            : <span className="text-[var(--color-muted)] text-xs">—</span>
          }
        </div>
      ),
    },
    {
      key: 'seña_amount',
      header: 'Anticipo',
      className: 'text-right',
      render: (tx: Transaction) => (
        tx.seña_amount != null && tx.seña_amount > 0
          ? <span className="tabular-nums text-xs" style={{ color: 'var(--color-muted)', ...(tx.voided_at ? { opacity: 0.5 } : {}) }}>${tx.seña_amount.toLocaleString('es-CO')}</span>
          : <span style={{ color: 'var(--color-muted)', ...(tx.voided_at ? { opacity: 0.5 } : {}) }}>—</span>
      ),
    },
    {
      key: 'entrada',
      header: 'Entrada',
      className: 'text-right',
      render: (tx: Transaction) => {
        const dir = getTxDirection(tx)
        const sym = CURRENCY_SYMBOL[tx.currency]
        return dir === 'entrada'
          ? <span className="font-semibold tabular-nums text-[var(--color-success)]" style={tx.voided_at ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>{sym}{tx.amount.toLocaleString('es-CO')}</span>
          : <span style={{ color: 'var(--color-muted)', ...(tx.voided_at ? { opacity: 0.5 } : {}) }}>—</span>
      },
    },
    {
      key: 'salida',
      header: 'Salida',
      className: 'text-right',
      render: (tx: Transaction) => {
        const dir = getTxDirection(tx)
        const sym = CURRENCY_SYMBOL[tx.currency]
        return dir === 'salida'
          ? <span className="font-semibold tabular-nums text-[var(--color-danger)]" style={tx.voided_at ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>{sym}{tx.amount.toLocaleString('es-CO')}</span>
          : <span style={{ color: 'var(--color-muted)', ...(tx.voided_at ? { opacity: 0.5 } : {}) }}>—</span>
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'w-20',
      render: (tx: Transaction) => (
        <div className="flex items-center gap-1 justify-end">
          {!tx.voided_at && !isDateLocked(tx.date) && (
            <button
              onClick={() => openEdit(tx)}
              className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          )}
          {!tx.voided_at && !isDateLocked(tx.date) && (
            <button
              onClick={() => handleVoid(tx.id)}
              title="Anular"
              className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
            >
              <Ban size={14} />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="animate-fade-in flex-1 min-h-0 flex flex-col">
      <TopBar
        title="Transacciones"
        subtitle={`${filteredTransactions.length} registros`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setReconcileOpen(true)} disabled={!!draft}>
              <Link size={14} />
              Reconciliar productos
            </Button>
            <Button onClick={startNew} size="sm" disabled={!!draft}>
              <Plus size={14} />
              Nueva transacción
            </Button>
          </div>
        }
      />

      <div className="flex-1 min-h-0 flex flex-col p-6 gap-4">
        <div className="flex flex-wrap gap-3">
          <Select
            options={[
              { value: '', label: 'Todas las categorías' },
              ...parents.map(p => ({ value: p.id, label: p.name })),
            ]}
            value={parentCategoryFilter}
            onChange={e => { setParentCategoryFilter(e.target.value) }}
            className="w-48"
          />
          <Select
            options={CURRENCY_FILTER_OPTIONS}
            value={currencyFilter}
            onChange={e => setCurrencyFilter(e.target.value as Currency | '')}
            className="w-40"
          />
          <Select
            options={[
              { value: '', label: 'Todos los métodos' },
              ...paymentMethodOptions,
            ]}
            value={paymentMethodFilter}
            onChange={e => setPaymentMethodFilter(e.target.value)}
            className="w-44"
          />
          <Input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            placeholder="Desde"
            className="w-40"
          />
          <Input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="Hasta"
            className="w-40"
          />
          <label className="flex items-center gap-1.5 cursor-pointer text-sm" style={{ color: 'var(--color-muted)' }}>
            <input
              type="checkbox"
              checked={showVoided}
              onChange={e => setShowVoided(e.target.checked)}
              style={{ accentColor: 'var(--color-accent)' }}
            />
            Mostrar anuladas
          </label>
          {(from || to || parentCategoryFilter || paymentMethodFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setParentCategoryFilter(''); setFrom(''); setTo(''); setPaymentMethodFilter('') }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {paymentBalances.map(b => (
            <div
              key={b.method}
              className="rounded-xl border border-[var(--color-border)] p-4"
              style={{ background: 'var(--color-surface)' }}
            >
              <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>
                {b.method}
              </div>
              <div className="flex flex-col gap-1">
                {b.currencies.map(({ currency, balance }) => (
                  <div key={currency} className="flex items-baseline justify-between gap-2">
                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{currency}</span>
                    <span className={`text-base font-bold tabular-nums ${balance >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                      {CURRENCY_SYMBOL[currency as Currency] ?? '$'}{balance.toLocaleString('es-CO')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1 min-h-0 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
          <Table
            columns={columns}
            data={filteredTransactions}
            keyField="id"
            loading={isLoading}
            emptyMessage="No hay transacciones para los filtros seleccionados"
            prependRow={newRow}
            appendRow={
              Object.keys(totals).length > 0 ? (
                <>
                  {Object.entries(totals).map(([currency, { entrada, salida }]) => (
                    <tr key={currency} className="border-t-2 border-[var(--color-border)]" style={{ background: 'var(--color-bg)' }}>
                      <td colSpan={6} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                        Total {Object.keys(totals).length > 1 ? currency : ''}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold tabular-nums text-[var(--color-success)]">
                          {CURRENCY_SYMBOL[currency as Currency] ?? ''}{entrada.toLocaleString('es-CO')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold tabular-nums text-[var(--color-danger)]">
                          {CURRENCY_SYMBOL[currency as Currency] ?? ''}{salida.toLocaleString('es-CO')}
                        </span>
                      </td>
                      <td />
                    </tr>
                  ))}
                </>
              ) : undefined
            }
          />
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Editar transacción"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Fecha"
              type="date"
              value={editForm.date}
              onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
            />
            <Select
              label="Moneda"
              options={CURRENCY_OPTIONS}
              value={editForm.currency}
              onChange={e => setEditForm(f => ({ ...f, currency: e.target.value as Currency }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Categoría"
              options={[
                { value: '', label: 'Seleccionar...' },
                ...parents.map(p => ({ value: p.id, label: p.name })),
              ]}
              value={editForm.category_parent_id}
              onChange={e => setEditForm(f => ({ ...f, category_parent_id: e.target.value, subcategory_id: '' }))}
            />
            <Select
              label="Subcategoría"
              options={[
                { value: '', label: 'Seleccionar...' },
                ...subcatsForParent(editForm.category_parent_id).map(c => ({ value: c.id, label: c.name })),
              ]}
              value={editForm.subcategory_id}
              onChange={e => setEditForm(f => ({ ...f, subcategory_id: e.target.value }))}
            />
          </div>

          {typeFromParent(editForm.category_parent_id) === 'transfer' && (
            <Select
              label="Dirección"
              options={[
                { value: 'entrada', label: 'Entrada' },
                { value: 'salida', label: 'Salida' },
              ]}
              value={editForm.transfer_direction}
              onChange={e => setEditForm(f => ({ ...f, transfer_direction: e.target.value as 'entrada' | 'salida' }))}
            />
          )}

          <Input
            label="Descripción"
            value={editForm.description}
            onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Opcional"
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[var(--color-text)]">Métodos de pago</span>
              <button
                type="button"
                onClick={() => setEditForm(f => ({ ...f, payments: [...f.payments, makeEmptyPayment()] }))}
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                + Agregar fila
              </button>
            </div>
            <div className="space-y-2">
              {editForm.payments.map((p, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Select
                      options={paymentMethodOptions}
                      value={p.payment_method}
                      onChange={e => setEditForm(f => ({ ...f, payments: f.payments.map((pp, ii) => ii === i ? { ...pp, payment_method: e.target.value as PaymentMethod } : pp) }))}
                    />
                  </div>
                  <div className="flex-1">
                    <Select
                      options={INSTRUMENT_OPTIONS}
                      value={p.instrument ?? ''}
                      onChange={e => setEditForm(f => ({ ...f, payments: f.payments.map((pp, ii) => ii === i ? { ...pp, instrument: (e.target.value as PaymentInstrument) || null } : pp) }))}
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={p.amount === 0 ? '' : String(p.amount)}
                      onChange={e => setEditForm(f => ({ ...f, payments: f.payments.map((pp, ii) => ii === i ? { ...pp, amount: parseFloat(e.target.value) || 0 } : pp) }))}
                      placeholder="Monto"
                      prefix="$"
                    />
                  </div>
                  {editForm.payments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setEditForm(f => ({ ...f, payments: f.payments.filter((_, ii) => ii !== i) }))}
                      className="p-1.5 mb-0.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 text-right text-sm font-semibold text-[var(--color-text)]">
              Total: {CURRENCY_SYMBOL[editForm.currency]}{calcTotal(editForm.payments).toLocaleString('es-CO')}
            </div>
          </div>

          {isEditServiceCategory && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[var(--color-text)]">Profesionales</span>
                {activeProfessionals.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditForm(f => ({ ...f, professionals: [...f.professionals, { id: activeProfessionals[0].id, commission_rate: 0 }] }))}
                    className="text-xs text-[var(--color-accent)] hover:underline"
                  >
                    + Agregar profesional
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {editForm.professionals.map((pa, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="flex-1">
                      <Select
                        options={activeProfessionals.map(h => ({ value: h.id, label: h.name }))}
                        value={pa.id}
                        onChange={e => setEditForm(f => ({ ...f, professionals: f.professionals.map((p, ii) => ii === i ? { ...p, id: e.target.value } : p) }))}
                      />
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={pa.commission_rate === 0 ? '' : String(pa.commission_rate)}
                        onChange={e => setEditForm(f => ({ ...f, professionals: f.professionals.map((p, ii) => ii === i ? { ...p, commission_rate: parseFloat(e.target.value) || 0 } : p) }))}
                        placeholder="% comisión"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditForm(f => ({ ...f, professionals: f.professionals.filter((_, ii) => ii !== i) }))}
                      className="p-1.5 mb-0.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isEditServiceCategory && editForm.description.trim().toLowerCase() !== 'anticipo' && editForm.description.trim().toLowerCase() !== 'devolución de anticipo' && (
            <Input
              type="number"
              min="0"
              step="0.01"
              value={editForm.seña_amount}
              onChange={e => setEditForm(f => ({ ...f, seña_amount: e.target.value }))}
              placeholder="Anticipo cobrado previamente"
              prefix="$"
              className="w-40"
            />
          )}
          {editForm.description.trim().toLowerCase() === 'devolución de anticipo' && (
            <Select
              label="Anticipo que se devuelve"
              options={[
                { value: '', label: 'Seleccionar anticipo...' },
                ...unrefundedAnticipos.filter(a => a.date <= editForm.date).map(a => ({
                  value: a.id,
                  label: `${formatDate(a.date)} — $${a.amount.toLocaleString('es-CO')}${a.currency !== 'ARS' ? ` ${a.currency}` : ''}`,
                })),
              ]}
              value={editForm.refunds_anticipo_id ?? ''}
              onChange={e => {
                const anticipo = unrefundedAnticipos.find(a => a.id === e.target.value)
                const parentId = anticipo?.subcategory_id
                  ? txCategories.find(c => c.id === anticipo.subcategory_id)?.parent_id ?? ''
                  : ''
                setEditForm(f => ({
                  ...f,
                  refunds_anticipo_id: e.target.value || null,
                  subcategory_id: anticipo?.subcategory_id ?? f.subcategory_id,
                  category_parent_id: parentId || f.category_parent_id,
                }))
              }}
            />
          )}

          {formError && <p className="text-xs text-[var(--color-danger)]">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} loading={updateTx.isPending}>
              Guardar cambios
            </Button>
          </div>
        </div>
      </Modal>

      <ReconcileModal open={reconcileOpen} onClose={() => setReconcileOpen(false)} />
    </div>
  )
}
