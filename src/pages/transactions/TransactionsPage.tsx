import { useState, useEffect, type DragEvent, type MouseEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { X, Link, Ban, Zap, Download, GripVertical, Unlink, Layers } from 'lucide-react'
import { formatDate } from '@/lib/formatDate'
import { currentMonthRange } from '@/lib/dateRange'
import { readDateParam, readCurrencyParam } from '@/lib/transactionFilters'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Table } from '@/components/ui/Table'
import { Modal } from '@/components/ui/Modal'
import { useTransactions, useUpdateTransaction, useVoidTransaction, usePaymentMethodBalances, useUnrefundedAnticipos } from '@/hooks/useTransactions'
import { useReorderTransactions } from '@/hooks/useTransactionOrder'
import {
  useTransactionGroups,
  useCreateTransactionGroup,
  useDeleteTransactionGroup,
  useRemoveGroupMember,
} from '@/hooks/useTransactionGroups'
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
  getTxDirection,
  type TransactionDraft,
  type DirectionInput,
} from '@/components/transactions/transactionDraft'
import type { Transaction, TransactionType, Currency, PaymentMethod, PaymentInstrument, Product, TransactionGroupWithMembers } from '@/types'

const CURRENCY_FILTER_OPTIONS = [
  { value: '', label: 'Todas las monedas' },
  ...CURRENCY_OPTIONS,
]

type TxRow =
  | { kind: 'single'; id: string; date: string; tx: Transaction }
  | { kind: 'group'; id: string; date: string; group: TransactionGroupWithMembers; visibleCount: number }

function signedAmount(tx: DirectionInput & { amount: number }) {
  return getTxDirection(tx) === 'salida' ? -tx.amount : tx.amount
}

function groupTotal(group: TransactionGroupWithMembers) {
  return group.members.filter(m => !m.voided_at).reduce((sum, m) => sum + signedAmount(m), 0)
}

export function TransactionsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const defaultRange = currentMonthRange()
  const parentCategoryFilter = searchParams.get('cat') ?? ''
  const currencyFilter = readCurrencyParam(searchParams)
  const paymentMethodFilter = searchParams.get('method') ?? ''
  const from = readDateParam(searchParams, 'from', defaultRange.from)
  const to = readDateParam(searchParams, 'to', defaultRange.to)
  const showVoided = searchParams.get('voided') === '1'
  const pendingOnly = searchParams.get('pending') === '1'
  const hasActiveFilters = ['cat', 'cur', 'method', 'from', 'to', 'voided', 'pending'].some(k => searchParams.has(k))

  const setFilterParam = (key: string, value: string | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value === null) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }
  const setDateParam = (key: 'from' | 'to', value: string) =>
    setFilterParam(key, value === defaultRange[key] ? null : value)
  const setFlagParam = (key: 'voided' | 'pending', checked: boolean) =>
    setFilterParam(key, checked ? '1' : null)
  const clearFilters = () => setSearchParams(new URLSearchParams(), { replace: true })

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
  const { data: paymentBalances = [] } = usePaymentMethodBalances({
    to: to || undefined,
    currency: currencyFilter || undefined,
  })
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const reorderTransactions = useReorderTransactions()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [groupLabel, setGroupLabel] = useState('')
  const [groupError, setGroupError] = useState('')

  const { data: txGroups = [] } = useTransactionGroups()
  const createGroup = useCreateTransactionGroup()
  const deleteGroup = useDeleteTransactionGroup()
  const removeGroupMember = useRemoveGroupMember()

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

  const normalizedPaymentMethodFilter = paymentMethodFilter.toLowerCase()
  const filteredTransactions = paymentMethodFilter
    ? transactions.filter(tx => tx.payments?.some(p => p.payment_method.toLowerCase() === normalizedPaymentMethodFilter))
    : transactions

  const groupById = new Map(txGroups.map(g => [g.id, g]))
  const groupIdByTx = new Map<string, string>()
  txGroups.forEach(g => g.members.forEach(m => groupIdByTx.set(m.id, g.id)))

  const txById = new Map(transactions.map(tx => [tx.id, tx]))
  const filteredIds = new Set(filteredTransactions.map(tx => tx.id))

  const rows: TxRow[] = []
  const seenGroups = new Set<string>()
  for (const tx of filteredTransactions) {
    const groupId = groupIdByTx.get(tx.id)
    const group = groupId ? groupById.get(groupId) : undefined
    if (!group) {
      rows.push({ kind: 'single', id: tx.id, date: tx.date, tx })
      continue
    }
    if (seenGroups.has(group.id)) continue
    seenGroups.add(group.id)
    rows.push({
      kind: 'group',
      id: `group:${group.id}`,
      date: group.members.reduce((max, m) => (m.date > max ? m.date : max), tx.date),
      group,
      visibleCount: group.members.filter(m => filteredIds.has(m.id)).length,
    })
  }

  const selectedTransactions = filteredTransactions.filter(tx => selected.has(tx.id))
  const selectionCurrencies = new Set(selectedTransactions.map(tx => tx.currency))
  const selectionTotal = selectedTransactions.reduce((sum, tx) => sum + signedAmount(tx), 0)

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreateGroup() {
    if (selectedTransactions.length < 2) {
      setGroupError('Elegí al menos dos transacciones.')
      return
    }
    if (selectionCurrencies.size > 1) {
      setGroupError('Todas las transacciones tienen que estar en la misma moneda: un total en monedas mezcladas no significa nada.')
      return
    }
    if (selectedTransactions.some(tx => tx.voided_at)) {
      setGroupError('No se puede agrupar una transacción anulada.')
      return
    }
    if (!groupLabel.trim()) {
      setGroupError('Poné un nombre al grupo.')
      return
    }
    await createGroup.mutateAsync({
      label: groupLabel.trim(),
      currency: selectedTransactions[0].currency,
      transactionIds: selectedTransactions.map(tx => tx.id),
    })
    setSelected(new Set())
    setGroupLabel('')
    setGroupError('')
    setGroupModalOpen(false)
  }
  const draggedTransaction = dragId ? filteredTransactions.find(tx => tx.id === dragId) ?? null : null
  const movingTransaction = movingId ? filteredTransactions.find(tx => tx.id === movingId) ?? null : null

  function applyReorder(source: Transaction, target: Transaction) {
    if (source.id === target.id || source.date !== target.date) return

    const group = filteredTransactions.filter(tx => tx.date === source.date).map(tx => tx.id)
    const fromIndex = group.indexOf(source.id)
    const toIndex = group.indexOf(target.id)
    if (fromIndex === -1 || toIndex === -1) return

    group.splice(fromIndex, 1)
    group.splice(toIndex, 0, source.id)
    reorderTransactions.mutate({ date: source.date, orderedIds: group })
  }

  function handleReorderDrop(target: Transaction) {
    const source = draggedTransaction
    setDragId(null)
    setOverId(null)
    if (source) applyReorder(source, target)
  }

  function handleReorderPlace(target: Transaction) {
    const source = movingTransaction
    setMovingId(null)
    if (source) applyReorder(source, target)
  }

  useEffect(() => {
    if (!movingId) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMovingId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [movingId])

  const totals = filteredTransactions
    .filter(tx => !tx.voided_at)
    .reduce((acc, tx) => {
      const cur = tx.currency
      if (!acc[cur]) acc[cur] = { entrada: 0, salida: 0 }

      if (paymentMethodFilter) {
        tx.payments
          ?.filter(payment => payment.payment_method.toLowerCase() === normalizedPaymentMethodFilter)
          .forEach(payment => {
            if (payment.type === 'entrada') acc[cur].entrada += payment.amount
            else if (payment.type === 'salida') acc[cur].salida += payment.amount
          })
      } else {
        const dir = getTxDirection(tx)
        if (dir === 'entrada') acc[cur].entrada += tx.amount
        else if (dir === 'salida') acc[cur].salida += tx.amount
      }
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

  async function exportCSV() {
    const active = filteredTransactions
      .filter(tx => !tx.voided_at)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))

    const fmt = (n: number) => n.toFixed(2).replace('.', ',')

    let startingBalance = 0
    if (from) {
      const { data, error } = await supabase.rpc('get_opening_balance', {
        p_before_date: from,
        p_payment_method: paymentMethodFilter || null,
        p_currency: currencyFilter || null,
      })
      if (error) throw new Error(error.message)
      startingBalance = data ?? 0
    }

    let balance = startingBalance
    const rows = active.map(tx => {
      const dir = getTxDirection(tx)
      const signed = dir === 'entrada' ? tx.amount : dir === 'salida' ? -tx.amount : tx.amount
      balance += signed
      const methods = tx.payments && tx.payments.length > 0
        ? tx.payments.map(p => p.payment_method).join(' / ')
        : ''
      return [
        tx.date,
        `"${(tx.description ?? '').replace(/"/g, '""')}"`,
        `"${methods}"`,
        fmt(signed),
        fmt(balance),
      ].join(';')
    })

    const totalCredits = active.reduce((s, tx) => {
      const dir = getTxDirection(tx)
      return dir === 'entrada' ? s + tx.amount : s
    }, 0)
    const totalDebits = active.reduce((s, tx) => {
      const dir = getTxDirection(tx)
      return dir === 'salida' ? s - tx.amount : s
    }, 0)

    const summary = `BALANCE_INICIAL;CREDITOS;DEBITOS;BALANCE_FINAL\n${fmt(startingBalance)};${fmt(totalCredits)};${fmt(totalDebits)};${fmt(balance)}`
    const header = 'FECHA;DESCRIPCION;METODO_PAGO;MONTO_NETO;BALANCE_PARCIAL'
    const csv = [summary, '', header, ...rows].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transacciones_${from || 'todo'}_${to || 'todo'}.csv`
    a.click()
    URL.revokeObjectURL(url)
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


  function renderActions(tx: Transaction) {
    if (tx.voided_at || isDateLocked(tx.date)) return null
    return (
      <>
        <button
          onClick={() => openEdit(tx)}
          className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button
          onClick={() => handleVoid(tx.id)}
          title="Anular"
          className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
        >
          <Ban size={14} />
        </button>
      </>
    )
  }

  function renderGroupDetail(group: TransactionGroupWithMembers) {
    return (
      <div className="flex flex-col divide-y divide-[var(--color-border)]">
        {group.members.map(member => {
          const full = txById.get(member.id)
          const dir = getTxDirection(member)
          const sym = CURRENCY_SYMBOL[member.currency]
          const outOfFilter = !filteredIds.has(member.id)
          return (
            <div
              key={member.id}
              className="grid grid-cols-[7rem_1fr_10rem_9rem_6rem] items-center gap-3 py-2 text-sm"
              style={member.voided_at ? { opacity: 0.5 } : undefined}
            >
              <span className="text-[var(--color-muted)] text-xs">{formatDate(member.date)}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--color-text)]">{member.description || '—'}</span>
                {member.voided_at && <Badge variant="danger">Anulada</Badge>}
                {outOfFilter && <Badge variant="default">Fuera del filtro</Badge>}
              </div>
              <span className="text-[var(--color-muted)] text-xs">{member.subcategory?.name || '—'}</span>
              <span
                className="text-right font-semibold tabular-nums"
                style={{ color: dir === 'entrada' ? 'var(--color-success)' : dir === 'salida' ? 'var(--color-danger)' : 'var(--color-muted)' }}
              >
                {dir === 'entrada' ? '+' : dir === 'salida' ? '-' : ''}{sym}{member.amount.toLocaleString('es-CO')}
              </span>
              <div className="flex items-center gap-1 justify-end">
                {full && renderActions(full)}
                <button
                  onClick={() => removeGroupMember.mutate({ groupId: group.id, transactionId: member.id })}
                  title="Quitar del grupo"
                  className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
                >
                  <Unlink size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const columns = [
    {
      key: 'drag',
      header: '',
      className: 'w-6 px-1!',
      render: (row: TxRow) => row.kind !== 'single' ? null : (
        <button
          type="button"
          draggable
          onDragStart={e => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', row.tx.id)
            setDragId(row.tx.id)
          }}
          onDragEnd={() => {
            setDragId(null)
            setOverId(null)
          }}
          onClick={() => setMovingId(current => (current === row.tx.id ? null : row.tx.id))}
          title={movingId === row.tx.id ? 'Elegí la fila del mismo día donde colocarla (Esc para cancelar)' : 'Arrastrar para reordenar, o clic para moverla a otra página'}
          className={`inline-flex cursor-grab active:cursor-grabbing ${movingId === row.tx.id ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
        >
          <GripVertical size={14} />
        </button>
      ),
    },
    {
      key: 'select',
      header: '',
      className: 'w-8',
      render: (row: TxRow) => row.kind !== 'single' || row.tx.voided_at ? null : (
        <input
          type="checkbox"
          checked={selected.has(row.tx.id)}
          onChange={() => toggleSelected(row.tx.id)}
          aria-label={`Seleccionar ${row.tx.description ?? 'transacción'}`}
          style={{ accentColor: 'var(--color-accent)' }}
        />
      ),
    },
    {
      key: 'date',
      header: 'Fecha',
      render: (row: TxRow) => {
        if (row.kind === 'group') {
          const dates = row.group.members.map(m => m.date)
          const min = dates.reduce((a, b) => (a < b ? a : b), row.date)
          return (
            <div className="flex flex-col gap-0.5 text-[var(--color-muted)]">
              <span>{formatDate(row.date)}</span>
              {min !== row.date && <span className="text-xs">desde {formatDate(min)}</span>}
            </div>
          )
        }
        const tx = row.tx
        return <span className="text-[var(--color-muted)]" style={tx.voided_at ? { opacity: 0.5 } : undefined}>{formatDate(tx.date)}</span>
      },
    },
    {
      key: 'description',
      header: 'Descripción',
      render: (row: TxRow) => {
        if (row.kind === 'group') {
          const activeCount = row.group.members.filter(m => !m.voided_at).length
          return (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <Layers size={14} className="text-[var(--color-muted)]" />
                <span className="text-[var(--color-text)]">{row.group.label}</span>
                <Badge variant="default">{activeCount} transacciones</Badge>
              </div>
              {row.visibleCount < row.group.members.length && (
                <span className="text-xs text-[var(--color-muted)]">
                  {row.visibleCount} de {row.group.members.length} en el filtro
                </span>
              )}
            </div>
          )
        }
        const tx = row.tx
        return (
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
        )
      },
    },
    {
      key: 'category',
      header: 'Categoría',
      render: (row: TxRow) => {
        if (row.kind === 'group') {
          const names = new Set(row.group.members.map(m => txCategories.find(c => c.id === m.subcategory?.parent_id)?.name ?? '—'))
          return <span className="text-[var(--color-muted)] text-xs">{names.size === 1 ? [...names][0] : 'Varias'}</span>
        }
        const tx = row.tx
        const parent = tx.subcategory ? txCategories.find(c => c.id === tx.subcategory!.parent_id) : null
        return <span className="text-[var(--color-muted)] text-xs" style={tx.voided_at ? { opacity: 0.5 } : undefined}>{parent?.name || '—'}</span>
      },
    },
    {
      key: 'subcategory',
      header: 'Subcategoría',
      render: (row: TxRow) => {
        if (row.kind === 'group') {
          const names = new Set(row.group.members.map(m => m.subcategory?.name ?? '—'))
          return <span className="text-[var(--color-muted)] text-xs">{names.size === 1 ? [...names][0] : 'Varias'}</span>
        }
        const tx = row.tx
        return <span className="text-[var(--color-muted)] text-xs" style={tx.voided_at ? { opacity: 0.5 } : undefined}>{tx.subcategory?.name || '—'}</span>
      },
    },
    {
      key: 'payments',
      header: 'Métodos',
      render: (row: TxRow) => {
        const methods = row.kind === 'group'
          ? [...new Set(row.group.members.flatMap(m => m.payments.map(p => p.payment_method)))]
          : [...new Set((row.tx.payments ?? []).map(p => p.payment_method))]
        return (
          <div className="flex flex-wrap gap-1" style={row.kind === 'single' && row.tx.voided_at ? { opacity: 0.5 } : undefined}>
            {methods.length > 0
              ? methods.map(method => <Badge key={method} variant="default">{method}</Badge>)
              : <span className="text-[var(--color-muted)] text-xs">—</span>
            }
          </div>
        )
      },
    },
    {
      key: 'seña_amount',
      header: 'Anticipo',
      className: 'text-right',
      render: (row: TxRow) => {
        if (row.kind === 'group') return <span style={{ color: 'var(--color-muted)' }}>—</span>
        const tx = row.tx
        return tx.seña_amount != null && tx.seña_amount > 0
          ? <span className="tabular-nums text-xs" style={{ color: 'var(--color-muted)', ...(tx.voided_at ? { opacity: 0.5 } : {}) }}>${tx.seña_amount.toLocaleString('es-CO')}</span>
          : <span style={{ color: 'var(--color-muted)', ...(tx.voided_at ? { opacity: 0.5 } : {}) }}>—</span>
      },
    },
    {
      key: 'monto',
      header: 'Monto',
      className: 'text-right',
      render: (row: TxRow) => {
        if (row.kind === 'group') {
          const total = groupTotal(row.group)
          const sym = CURRENCY_SYMBOL[row.group.currency]
          return (
            <span className="font-semibold tabular-nums" style={{ color: total >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
              {total >= 0 ? '+' : '-'}{sym}{Math.abs(total).toLocaleString('es-CO')}
            </span>
          )
        }
        const tx = row.tx
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
      render: (row: TxRow) => (
        <div className="flex items-center gap-1 justify-end">
          {row.kind === 'group' ? (
            <button
              onClick={() => deleteGroup.mutate(row.group.id)}
              title="Desagrupar"
              className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
            >
              <Unlink size={14} />
            </button>
          ) : renderActions(row.tx)}
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
            {selected.size >= 2 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setGroupError(''); setGroupModalOpen(true) }}
              >
                <Layers size={14} />
                Agrupar ({selected.size})
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setReconcileOpen(true)}>
              <Link size={14} />
              Reconciliar productos
            </Button>
            <Button variant="secondary" size="sm" onClick={exportCSV}>
              <Download size={14} />
              Exportar CSV
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
            onChange={e => setFilterParam('cat', e.target.value || null)}
            className="w-48"
          />
          <Select
            options={CURRENCY_FILTER_OPTIONS}
            value={currencyFilter}
            onChange={e => setFilterParam('cur', e.target.value || null)}
            className="w-40"
          />
          <Select
            options={[
              { value: '', label: 'Todos los métodos' },
              ...paymentMethodOptions,
            ]}
            value={paymentMethodFilter}
            onChange={e => setFilterParam('method', e.target.value || null)}
            className="w-44"
          />
          <Input
            type="date"
            value={from}
            onChange={e => setDateParam('from', e.target.value)}
            placeholder="Desde"
            className="w-40"
          />
          <Input
            type="date"
            value={to}
            onChange={e => setDateParam('to', e.target.value)}
            placeholder="Hasta"
            className="w-40"
          />
          <label className="flex items-center gap-1.5 cursor-pointer text-sm" style={{ color: 'var(--color-muted)' }}>
            <input
              type="checkbox"
              checked={showVoided}
              onChange={e => setFlagParam('voided', e.target.checked)}
              style={{ accentColor: 'var(--color-accent)' }}
            />
            Mostrar anuladas
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-sm" style={{ color: 'var(--color-muted)' }}>
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={e => setFlagParam('pending', e.target.checked)}
              style={{ accentColor: 'var(--color-accent)' }}
            />
            Solo pendientes de descuento
          </label>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
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
              <div className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>
                {to ? `Saldo al ${to.split('-').reverse().join('/')}` : 'Saldo acumulado'}
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

        {movingTransaction && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-xl border border-[var(--color-accent)] bg-[var(--color-surface)]">
            <span className="text-xs text-[var(--color-text)]">
              Moviendo <strong>{movingTransaction.description || 'transacción'}</strong> — elegí la fila del {formatDate(movingTransaction.date)} donde colocarla. Podés cambiar de página.
            </span>
            <Button variant="ghost" size="sm" onClick={() => setMovingId(null)}>Cancelar</Button>
          </div>
        )}

        <div className="flex-1 min-h-0 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
          <Table
            columns={columns}
            data={rows}
            keyField="id"
            loading={isLoading}
            emptyMessage="No hay transacciones para los filtros seleccionados"
            renderExpanded={(row: TxRow) => row.kind === 'group' ? renderGroupDetail(row.group) : null}
            rowProps={(row: TxRow) => {
              if (row.kind !== 'single') return {}
              const tx = row.tx
              const isDropTarget = draggedTransaction !== null && draggedTransaction.id !== tx.id && draggedTransaction.date === tx.date
              const isPlaceTarget = movingTransaction !== null && movingTransaction.id !== tx.id && movingTransaction.date === tx.date
              const outline = 'outline outline-2 -outline-offset-2 outline-[var(--color-accent)]'
              return {
                onDragOver: (e: DragEvent<HTMLTableRowElement>) => {
                  if (!isDropTarget) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setOverId(tx.id)
                },
                onDragLeave: () => setOverId(current => (current === tx.id ? null : current)),
                onDrop: (e: DragEvent<HTMLTableRowElement>) => {
                  e.preventDefault()
                  handleReorderDrop(tx)
                },
                onClick: isPlaceTarget
                  ? (e: MouseEvent<HTMLTableRowElement>) => {
                      if ((e.target as HTMLElement).closest('input, button, a, select, textarea')) return
                      handleReorderPlace(tx)
                    }
                  : undefined,
                className: [
                  isDropTarget && overId === tx.id ? outline : '',
                  movingTransaction?.id === tx.id ? `${outline} outline-dashed` : '',
                  isPlaceTarget ? 'cursor-pointer hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-[var(--color-accent)]' : '',
                ].filter(Boolean).join(' '),
              }
            }}
            appendRow={
              Object.keys(totals).length > 0 ? (
                <>
                  {Object.entries(totals).map(([currency, { entrada, salida }]) => (
                    <tr key={currency} className="border-t-2 border-[var(--color-border)]" style={{ background: 'var(--color-bg)' }}>
                      <td colSpan={columns.length - 1} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                        Flujo neto del período {Object.keys(totals).length > 1 ? currency : ''}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold tabular-nums" style={{ color: entrada - salida >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          {entrada - salida >= 0 ? '+' : '-'}{CURRENCY_SYMBOL[currency as Currency] ?? ''}{Math.abs(entrada - salida).toLocaleString('es-CO')}
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
            <div>
              <Select
                label="Moneda"
                options={CURRENCY_OPTIONS}
                value={editForm.currency}
                onChange={e => setEditForm(f => ({ ...f, currency: e.target.value as Currency }))}
                disabled={editing != null && groupIdByTx.has(editing.id)}
              />
              {editing != null && groupIdByTx.has(editing.id) && (
                <p style={{ marginTop: '6px', fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                  Está en un grupo. Para cambiar la moneda hay que desagruparla primero.
                </p>
              )}
            </div>
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

      <Modal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        title="Agrupar transacciones"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-muted)]">
            Las {selectedTransactions.length} transacciones se van a mostrar como una sola fila con el total.
            Cada una conserva su categoría y su importe: agrupar no cambia ningún reporte ni ningún saldo.
          </p>
          <Input
            label="Nombre del grupo"
            value={groupLabel}
            onChange={e => setGroupLabel(e.target.value)}
            placeholder="Transferencia de Ana"
          />
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-[var(--color-muted)]">Total del grupo</span>
            <span
              className="font-semibold tabular-nums"
              style={{ color: selectionTotal >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}
            >
              {selectionTotal >= 0 ? '+' : '-'}
              {CURRENCY_SYMBOL[selectedTransactions[0]?.currency ?? 'ARS']}
              {Math.abs(selectionTotal).toLocaleString('es-CO')}
            </span>
          </div>
          {groupError && <p className="text-xs text-[var(--color-danger)]">{groupError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setGroupModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateGroup} loading={createGroup.isPending}>
              Agrupar
            </Button>
          </div>
        </div>
      </Modal>

      <ReconcileModal open={reconcileOpen} onClose={() => setReconcileOpen(false)} />
    </div>
  )
}
