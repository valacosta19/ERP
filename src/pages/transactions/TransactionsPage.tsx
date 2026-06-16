import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { X, Link, Ban, Zap } from 'lucide-react'
import { formatDate } from '@/lib/formatDate'
import { currentMonthRange } from '@/lib/dateRange'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Table } from '@/components/ui/Table'
import { Modal } from '@/components/ui/Modal'
import { useTransactions, useUpdateTransaction, useVoidTransaction, usePaymentMethodBalances, useUnrefundedAnticipos } from '@/hooks/useTransactions'
import { useLockedPeriods } from '@/hooks/useLockedPeriods'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useTransactionCategories } from '@/hooks/useTransactionCategories'
import { useProfessionals } from '@/hooks/useProfessionals'
import { useProducts } from '@/hooks/useProducts'
import { supabase } from '@/lib/supabaseClient'
import { ReconcileModal } from './ReconcileModal'
import { ProductCombobox } from '@/components/transactions/ProductCombobox'
import {
  EMPTY_DRAFT,
  makeEmptyPayment,
  calcTotal,
  CURRENCY_SYMBOL,
  CURRENCY_OPTIONS,
  INSTRUMENT_OPTIONS,
  type TransactionDraft,
} from '@/components/transactions/transactionDraft'
import type { Transaction, TransactionType, Currency, PaymentMethod, PaymentInstrument, Product } from '@/types'

const CURRENCY_FILTER_OPTIONS = [
  { value: '', label: 'Todas las monedas' },
  ...CURRENCY_OPTIONS,
]

function getTxDirection(tx: Transaction): 'entrada' | 'salida' | 'transfer' {
  if (tx.is_seña) return tx.description?.trim().toLowerCase() === 'anticipo' ? 'entrada' : 'salida'
  const txType = tx.subcategory?.transaction_type
  if (txType === 'income') return 'entrada'
  if (txType === 'expense') return 'salida'
  if (txType === 'transfer') return 'transfer'
  return (tx.payments?.[0]?.type as 'entrada' | 'salida') ?? 'entrada'
}

export function TransactionsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [parentCategoryFilter, setParentCategoryFilter] = useState('')
  const [currencyFilter, setCurrencyFilter] = useState<Currency | ''>('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('')
  const [from, setFrom] = useState(() => currentMonthRange().from)
  const [to, setTo] = useState(() => currentMonthRange().to)
  const [showVoided, setShowVoided] = useState(false)
  const [pendingOnly, setPendingOnly] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [editForm, setEditForm] = useState<TransactionDraft>(EMPTY_DRAFT)
  const [formError, setFormError] = useState('')

  const { data: txCategories = [] } = useTransactionCategories()
  const { data: professionals = [] } = useProfessionals()
  const { data: products = [] } = useProducts()
  const { data: unrefundedAnticipos = [] } = useUnrefundedAnticipos()
  const updateTx = useUpdateTransaction()
  const voidTx = useVoidTransaction()
  const { data: lockedPeriods = [] } = useLockedPeriods()
  const { data: paymentBalances = [] } = usePaymentMethodBalances({ currency: currencyFilter || undefined })
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
    pendingOnly,
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
      else if (dir === 'salida') acc[cur].salida += tx.amount
      return acc
    }, {} as Record<string, { entrada: number; salida: number }>)

  const refundedAntipoIds = new Set(
    transactions.filter(t => t.refunds_anticipo_id !== null).map(t => t.refunds_anticipo_id as string)
  )

  const editSubcategory = subcategories.find(c => c.id === editForm.subcategory_id)
  const isEditServiceCategory = editSubcategory?.name.toLowerCase() === 'servicio'
  const isEditInventoryCategory = !!editSubcategory?.deducts_inventory || editSubcategory?.name.toLowerCase() === 'producto'

  const productLabel = (p: Product) => p.unit ? `${p.name} ${p.unit}` : p.name

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
      product_id: tx.product_id ?? null,
      product_quantity: 1,
      inventory_items: [],
    })
    setFormError('')
    setModalOpen(true)
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
    const editSubcat = subcategories.find(c => c.id === editForm.subcategory_id)
    const editSubcatTriggersInventory = !!(editSubcat?.deducts_inventory) || editSubcat?.name.toLowerCase() === 'producto'
    const { data: { user } } = await supabase.auth.getUser()

    let runFifo = false
    let inventoryPending = editing!.inventory_pending ?? false
    if (editSubcatTriggersInventory && editForm.product_id) {
      const { data: existingMovement } = await supabase
        .from('inventory_movements')
        .select('id')
        .eq('reference_id', editing!.id)
        .eq('reference_type', 'transaction')
        .limit(1)
        .maybeSingle()
      if (existingMovement) {
        inventoryPending = false
      } else if ((products.find(p => p.id === editForm.product_id)?.stock ?? 0) >= 1) {
        runFifo = true
        inventoryPending = false
      } else {
        inventoryPending = true
      }
    } else {
      inventoryPending = false
    }

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
      product_id: editForm.product_id,
      inventory_pending: inventoryPending,
    })

    if (runFifo && editForm.product_id) {
      const { error: fifoError } = await supabase.rpc('consume_inventory_fifo', {
        p_product_id: editForm.product_id,
        p_quantity: 1,
        p_transaction_id: editing!.id,
        p_unit_sale_price: total,
        p_created_by: user!.id,
      })
      if (fifoError) throw new Error(fifoError.message)
    }

    qc.invalidateQueries({ queryKey: ['products'] })
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
            {tx.inventory_pending && !tx.voided_at && <Badge variant="warning">Sin descontar</Badge>}
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
      key: 'monto',
      header: 'Monto',
      className: 'text-right',
      render: (tx: Transaction) => {
        const dir = getTxDirection(tx)
        const sym = CURRENCY_SYMBOL[tx.currency]
        const voidedStyle = tx.voided_at ? { opacity: 0.5, textDecoration: 'line-through' as const } : undefined
        if (dir === 'entrada') return <span className="font-semibold tabular-nums" style={{ color: 'var(--color-success)', ...voidedStyle }}>+{sym}{tx.amount.toLocaleString('es-CO')}</span>
        if (dir === 'salida') return <span className="font-semibold tabular-nums" style={{ color: 'var(--color-danger)', ...voidedStyle }}>-{sym}{tx.amount.toLocaleString('es-CO')}</span>
        return <span className="font-semibold tabular-nums" style={{ color: 'var(--color-muted)', ...voidedStyle }}>{sym}{tx.amount.toLocaleString('es-CO')}</span>
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
            <Button variant="secondary" size="sm" onClick={() => setReconcileOpen(true)}>
              <Link size={14} />
              Reconciliar productos
            </Button>
            <Button onClick={() => navigate('/transactions/cargar')} size="sm">
              <Zap size={14} />
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
          <label className="flex items-center gap-1.5 cursor-pointer text-sm" style={{ color: 'var(--color-muted)' }}>
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={e => setPendingOnly(e.target.checked)}
              style={{ accentColor: 'var(--color-accent)' }}
            />
            Solo pendientes de descuento
          </label>
          {(from || to || parentCategoryFilter || paymentMethodFilter || pendingOnly) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setParentCategoryFilter(''); setFrom(''); setTo(''); setPaymentMethodFilter(''); setPendingOnly(false) }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {paymentBalances.filter(b => b.method.toLowerCase() !== 'inventario').map(b => (
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
            appendRow={
              Object.keys(totals).length > 0 ? (
                <>
                  {Object.entries(totals).map(([currency, { entrada, salida }]) => (
                    <tr key={currency} className="border-t-2 border-[var(--color-border)]" style={{ background: 'var(--color-bg)' }}>
                      <td colSpan={6} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                        Total {Object.keys(totals).length > 1 ? currency : ''}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-semibold tabular-nums" style={{ color: 'var(--color-success)' }}>
                            +{CURRENCY_SYMBOL[currency as Currency] ?? ''}{entrada.toLocaleString('es-CO')}
                          </span>
                          <span className="font-semibold tabular-nums" style={{ color: 'var(--color-danger)' }}>
                            -{CURRENCY_SYMBOL[currency as Currency] ?? ''}{salida.toLocaleString('es-CO')}
                          </span>
                        </div>
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

          {isEditInventoryCategory ? (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Producto</label>
              <ProductCombobox
                value={editForm.product_id}
                onChange={(productId, product) => setEditForm(f => ({ ...f, product_id: productId, description: product ? productLabel(product) : '' }))}
                products={products}
                productLabel={productLabel}
                placeholder="Buscar producto"
                ariaLabel="Producto"
              />
              {editForm.product_id && (products.find(p => p.id === editForm.product_id)?.stock ?? 0) <= 0 && (
                <p style={{ marginTop: '6px', fontSize: '0.8125rem', color: 'var(--color-warning)' }}>
                  Este producto no tiene stock. Se guardará pendiente de descuento.
                </p>
              )}
            </div>
          ) : (
            <Input
              label="Descripción"
              value={editForm.description}
              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Opcional"
            />
          )}

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
