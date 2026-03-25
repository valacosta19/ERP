import { useState } from 'react'
import { Plus, Trash2, X, Check, Link } from 'lucide-react'
import { formatDate } from '@/lib/formatDate'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Table } from '@/components/ui/Table'
import { Modal } from '@/components/ui/Modal'
import { useTransactions, useCreateTransaction, useUpdateTransaction, useDeleteTransaction, usePaymentMethodBalances } from '@/hooks/useTransactions'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useCategories } from '@/hooks/useCategories'
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
  type: 'income' as TransactionType,
  currency: 'ARS' as Currency,
  category_id: '',
  catalog_item_id: null as string | null,
  description: '',
  seña_amount: '',
  payments: [makeEmptyPayment()] as PaymentRow[],
  professionals: [] as { id: string; commission_rate: number }[],
  product_id: null as string | null,
}

function calcTotal(payments: PaymentRow[]) {
  return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
}

const CURRENCY_SYMBOL: Record<Currency, string> = { ARS: '$', USD: 'U$D', EUR: '€' }

function formatAmount(type: TransactionType, amount: number, currency: Currency) {
  const sign = type === 'income' ? '+' : '-'
  const sym = CURRENCY_SYMBOL[currency]
  return `${sign}${sym}${amount.toLocaleString('es-CO')}`
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
  onSelect: (s: Suggestion, price: number) => void
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
          style={{ background: 'var(--color-surface)', zIndex: 50, minWidth: '240px' }}
        >
          {filtered.map(s => (
            <div
              key={s.id}
              className="px-3 py-2 border-b border-[var(--color-border)] last:border-0"
            >
              <div className="text-sm mb-1.5" style={{ color: 'var(--color-text)' }}>{s.name}</div>
              <div className="flex gap-1.5 flex-wrap">
                {s.priceCash > 0 && (
                  <button
                    type="button"
                    onMouseDown={() => { onSelect(s, s.priceCash); setOpen(false) }}
                    className="text-xs px-2 py-0.5 rounded-full border transition-colors hover:bg-[var(--color-accent)] hover:text-white hover:border-[var(--color-accent)]"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
                  >
                    ${s.priceCash.toLocaleString('es-CO')} Ef.
                  </button>
                )}
                {s.priceTransfer != null && (
                  <button
                    type="button"
                    onMouseDown={() => { onSelect(s, s.priceTransfer!); setOpen(false) }}
                    className="text-xs px-2 py-0.5 rounded-full border transition-colors hover:bg-[var(--color-accent)] hover:text-white hover:border-[var(--color-accent)]"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
                  >
                    ${s.priceTransfer.toLocaleString('es-CO')} Transf.
                  </button>
                )}
                {s.priceCard != null && (
                  <button
                    type="button"
                    onMouseDown={() => { onSelect(s, s.priceCard!); setOpen(false) }}
                    className="text-xs px-2 py-0.5 rounded-full border transition-colors hover:bg-[var(--color-accent)] hover:text-white hover:border-[var(--color-accent)]"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
                  >
                    ${s.priceCard.toLocaleString('es-CO')} Tarj.
                  </button>
                )}
              </div>
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
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [currencyFilter, setCurrencyFilter] = useState<Currency | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [draft, setDraft] = useState<typeof EMPTY_DRAFT | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [editForm, setEditForm] = useState(EMPTY_DRAFT)
  const [formError, setFormError] = useState('')

  const { data: transactions = [], isLoading } = useTransactions({
    type: typeFilter,
    categoryId: categoryFilter || undefined,
    currency: currencyFilter || undefined,
    from: from || undefined,
    to: to || undefined,
  })
  const { data: categories = [] } = useCategories()
  const { data: professionals = [] } = useProfessionals()
  const { data: catalogItems = [] } = useCatalogItems(draft?.category_id || undefined)
  const { data: products = [] } = useProducts()
  const createTx = useCreateTransaction()
  const updateTx = useUpdateTransaction()
  const deleteTx = useDeleteTransaction()
  const { data: paymentBalances = [] } = usePaymentMethodBalances({ from: from || undefined, to: to || undefined, currency: currencyFilter || undefined })
  const { data: paymentMethodsData = [] } = usePaymentMethods()
  const paymentMethodOptions = paymentMethodsData
    .filter(pm => pm.active)
    .map(pm => ({ value: pm.name, label: pm.name }))

  const activeProfessionals = professionals.filter(h => h.active)

  const allCategoryOptions = [
    { value: '', label: 'Todas las categorías' },
    ...categories.map(c => ({ value: c.id, label: c.name })),
  ]

  const categoryOptions = categories.map(c => ({ value: c.id, label: c.name }))

  const isDraftServiceCategory = categories.find(c => c.id === draft?.category_id)?.name.toLowerCase() === 'servicio'
  const isEditServiceCategory = categories.find(c => c.id === editForm.category_id)?.name.toLowerCase() === 'servicio'
  const isDraftProductCategory = categories.find(c => c.id === draft?.category_id)?.name.toLowerCase() === 'producto'

  const draftSuggestions: Suggestion[] = isDraftProductCategory
    ? products.map((p: Product) => ({ id: p.id, name: p.name, priceCash: p.sale_price, priceTransfer: null, priceCard: null, productId: p.id }))
    : catalogItems.map((ci: CatalogItem) => ({ id: ci.id, name: ci.name, priceCash: ci.price, priceTransfer: ci.price_transfer ?? null, priceCard: ci.price_card ?? null }))

  function startNew() {
    setFormError('')
    setDraft({ ...EMPTY_DRAFT, date: new Date().toISOString().slice(0, 10) })
  }

  function cancelNew() {
    setDraft(null)
    setFormError('')
  }

  function openEdit(tx: Transaction) {
    setEditing(tx)
    setEditForm({
      date: tx.date,
      type: tx.type,
      currency: tx.currency,
      category_id: tx.category_id ?? '',
      catalog_item_id: tx.catalog_item_id ?? null,
      description: tx.description ?? '',
      seña_amount: tx.seña_amount != null ? String(tx.seña_amount) : '',
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
    })
    setFormError('')
    setModalOpen(true)
  }

  function handleSuggestionSelect(s: Suggestion, price: number) {
    setDraft(d => d && {
      ...d,
      description: s.name,
      payments: [{ ...d.payments[0], amount: price }],
      product_id: s.productId ?? null,
      catalog_item_id: s.productId ? null : s.id,
    })
  }

  async function handleCreate() {
    if (!draft) return
    const total = calcTotal(draft.payments)
    if (!draft.date || total <= 0) {
      setFormError('Fecha y al menos un pago con monto son obligatorios.')
      return
    }
    const isSeña = draft.description.trim().toLowerCase() === 'seña'
    const tx = await createTx.mutateAsync({
      date: draft.date,
      type: draft.type,
      currency: draft.currency,
      category_id: draft.category_id || null,
      catalog_item_id: draft.catalog_item_id ?? null,
      description: draft.description || null,
      is_seña: isSeña,
      seña_amount: isSeña ? total : (isDraftServiceCategory && draft.seña_amount ? parseFloat(draft.seña_amount) : null),
      payments: draft.payments.map(p => ({
        ...p,
        instrument: p.instrument || null,
        amount: Number(p.amount),
      })),
      professionals: draft.professionals,
    })
    if (draft.product_id && draft.type === 'expense') {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: fifoError } = await supabase.rpc('consume_inventory_fifo', {
        p_product_id: draft.product_id,
        p_quantity: 1,
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
    const isSeña = editForm.description.trim().toLowerCase() === 'seña'
    await updateTx.mutateAsync({
      id: editing!.id,
      date: editForm.date,
      type: editForm.type,
      currency: editForm.currency,
      amount: total,
      category_id: editForm.category_id || null,
      catalog_item_id: editForm.catalog_item_id ?? null,
      description: editForm.description || null,
      is_seña: isSeña,
      seña_amount: isSeña ? total : (isEditServiceCategory && editForm.seña_amount ? parseFloat(editForm.seña_amount) : null),
      payments: editForm.payments.map(p => ({ ...p, instrument: p.instrument || null, amount: Number(p.amount) })),
      professionals: editForm.professionals,
    })
    setModalOpen(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta transacción?')) return
    await deleteTx.mutateAsync(id)
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
        colSpan={8}
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
              value={draft.type}
              onChange={e => setDraft(d => d && { ...d, type: e.target.value as TransactionType, category_id: '' })}
              style={INLINE_SELECT_STYLE}
            >
              <option value="income">Ingreso</option>
              <option value="expense">Gasto</option>
            </select>
            <select
              value={draft.currency}
              onChange={e => setDraft(d => d && { ...d, currency: e.target.value as Currency })}
              style={INLINE_SELECT_STYLE}
            >
              {CURRENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={draft.category_id}
              onChange={e => setDraft(d => d && { ...d, category_id: e.target.value, product_id: null })}
              style={INLINE_SELECT_STYLE}
            >
              <option value="">Sin categoría</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <DescriptionCombobox
              value={draft.description}
              onChange={v => setDraft(d => d && { ...d, description: v, product_id: null })}
              onSelect={handleSuggestionSelect}
              suggestions={draftSuggestions}
            />
          </div>

          <div className="space-y-1.5">
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
          </div>

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
            {isDraftServiceCategory && draft.description.trim().toLowerCase() !== 'seña' && (
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.seña_amount}
                onChange={e => setDraft(d => d && { ...d, seña_amount: e.target.value })}
                placeholder="Seña cobrada previamente"
                style={{ ...INLINE_SELECT_STYLE, width: '190px' }}
              />
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
        <span className="text-[var(--color-muted)]">{formatDate(tx.date)}</span>
      ),
    },
    {
      key: 'description',
      header: 'Descripción',
      render: (tx: Transaction) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-[var(--color-text)]">{tx.description || '—'}</span>
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
      render: (tx: Transaction) => (
        <span className="text-[var(--color-muted)] text-xs">{tx.category?.name || '—'}</span>
      ),
    },
    {
      key: 'payments',
      header: 'Métodos',
      render: (tx: Transaction) => (
        <div className="flex flex-wrap gap-1">
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
      header: 'Seña',
      className: 'text-right',
      render: (tx: Transaction) => (
        tx.seña_amount != null && tx.seña_amount > 0
          ? <span className="tabular-nums text-xs" style={{ color: 'var(--color-muted)' }}>${tx.seña_amount.toLocaleString('es-CO')}</span>
          : <span style={{ color: 'var(--color-muted)' }}>—</span>
      ),
    },
    {
      key: 'amount',
      header: 'Monto',
      className: 'text-right',
      render: (tx: Transaction) => {
        const total = tx.amount
        return (
          <span className={`font-semibold tabular-nums ${tx.type === 'income' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
            {formatAmount(tx.type, total, tx.currency)}
          </span>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'w-20',
      render: (tx: Transaction) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={() => openEdit(tx)}
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button
            onClick={() => handleDelete(tx.id)}
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
        title="Transacciones"
        subtitle={`${transactions.length} registros`}
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
              { value: 'all', label: 'Todos' },
              { value: 'income', label: 'Ingreso' },
              { value: 'expense', label: 'Gasto' },
            ]}
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value as typeof typeFilter); setCategoryFilter('') }}
            className="w-36"
          />
          <Select
            options={allCategoryOptions}
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="w-48"
          />
          <Select
            options={CURRENCY_FILTER_OPTIONS}
            value={currencyFilter}
            onChange={e => setCurrencyFilter(e.target.value as Currency | '')}
            className="w-40"
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
          {(from || to || categoryFilter || typeFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setTypeFilter('all'); setCategoryFilter(''); setFrom(''); setTo('') }}
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
            data={transactions}
            keyField="id"
            loading={isLoading}
            emptyMessage="No hay transacciones para los filtros seleccionados"
            prependRow={newRow}
          />
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Editar transacción"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Fecha"
              type="date"
              value={editForm.date}
              onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
            />
            <Select
              label="Tipo"
              options={[
                { value: 'income', label: 'Ingreso' },
                { value: 'expense', label: 'Gasto' },
              ]}
              value={editForm.type}
              onChange={e => setEditForm(f => ({ ...f, type: e.target.value as TransactionType, category_id: '' }))}
            />
            <Select
              label="Moneda"
              options={CURRENCY_OPTIONS}
              value={editForm.currency}
              onChange={e => setEditForm(f => ({ ...f, currency: e.target.value as Currency }))}
            />
          </div>

          <Select
            label="Categoría"
            options={categoryOptions}
            value={editForm.category_id}
            onChange={e => setEditForm(f => ({ ...f, category_id: e.target.value }))}
            placeholder="Sin categoría"
          />

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

          {isEditServiceCategory && editForm.description.trim().toLowerCase() !== 'seña' && (
            <Input
              type="number"
              min="0"
              step="0.01"
              value={editForm.seña_amount}
              onChange={e => setEditForm(f => ({ ...f, seña_amount: e.target.value }))}
              placeholder="Seña cobrada previamente"
              prefix="$"
              className="w-40"
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
