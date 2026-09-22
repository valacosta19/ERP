import { useState, useEffect, useRef, type DragEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, X, Link, Ban, Zap, Download, GripVertical, Unlink, Layers, Search, ChevronDown, ReceiptText } from 'lucide-react'
import { formatDate } from '@/lib/formatDate'
import { currentMonthRange, todayLocal } from '@/lib/dateRange'
import { readDateParam, readCurrencyParam } from '@/lib/transactionFilters'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Table } from '@/components/ui/Table'
import { Modal } from '@/components/ui/Modal'
import { useTransactions, useUpdateTransaction, useVoidTransaction, usePaymentMethodBalances, useUnrefundedAnticipos } from '@/hooks/useTransactions'
import { useReorderTransactions, applyOptimisticReorder } from '@/hooks/useTransactionOrder'
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
import { useHairdresserServices } from '@/hooks/useHairdresserServices'
import { useProducts } from '@/hooks/useProducts'
import { useAuth } from '@/hooks/useAuth'
import { useFiscalDocuments } from '@/hooks/useIntegrations'
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
import { confirmDialog } from '@/lib/confirm'
import { showToast } from '@/lib/toast'
import { transactionCashMovements, transactionCashTotals } from '@/lib/transactionCashFlow'
import { fiscalDocumentStatusLabel, fiscalGroupInvoiceState, fiscalTransactionEligibility } from '@/lib/integrations'
import { FiscalInvoiceModal, type FiscalSourceTransaction } from '@/components/integrations/FiscalInvoiceModal'
import {
  internalTransferAmount,
  internalTransferValidationError,
  isInternalTransferCategory,
  normalizeInternalTransferPayments,
} from '@/lib/internalTransfer'

const FLUSH_DELAY_MS = 450
const SEARCH_DEBOUNCE_MS = 300

const CURRENCY_FILTER_OPTIONS = [
  { value: '', label: 'Todas las monedas' },
  ...CURRENCY_OPTIONS,
]

type TxRow =
  | { kind: 'single'; id: string; date: string; tx: Transaction }
  | { kind: 'group'; id: string; date: string; group: TransactionGroupWithMembers; visibleCount: number }

interface FiscalTarget {
  label: string
  transactions: FiscalSourceTransaction[]
}

function signedAmount(tx: DirectionInput & { amount: number }) {
  return getTxDirection(tx) === 'salida' ? -tx.amount : tx.amount
}

function groupTotals(group: TransactionGroupWithMembers) {
  return group.members
    .filter(m => !m.voided_at)
    .reduce(
      (acc, m) => {
        if (m.is_seña) {
          acc.señas += signedAmount(m)
        } else {
          acc.services += signedAmount(m)
          acc.señas += m.seña_amount ?? 0
        }
        return acc
      },
      { señas: 0, services: 0 },
    )
}

function formatSigned(amount: number, sym: string) {
  return `${amount >= 0 ? '+' : '-'}${sym}${Math.abs(amount).toLocaleString('es-CO')}`
}

export function TransactionsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const { data: fiscalDocuments = [] } = useFiscalDocuments(isAdmin)
  const [searchParams, setSearchParams] = useSearchParams()
  const defaultRange = { ...currentMonthRange(), to: todayLocal() }
  const parentCategoryFilter = searchParams.get('cat') ?? ''
  const currencyFilter = readCurrencyParam(searchParams)
  const paymentMethodFilter = searchParams.get('method') ?? ''
  const from = readDateParam(searchParams, 'from', defaultRange.from)
  const to = readDateParam(searchParams, 'to', defaultRange.to)
  const showVoided = searchParams.get('voided') === '1'
  const pendingOnly = searchParams.get('pending') === '1'
  const search = searchParams.get('q') ?? ''
  const [searchInput, setSearchInput] = useState(search)
  const hasActiveFilters = ['cat', 'cur', 'method', 'from', 'to', 'voided', 'pending', 'q'].some(k => searchParams.has(k))

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
  const clearFilters = () => {
    setSearchInput('')
    setSearchParams(new URLSearchParams(), { replace: true })
  }

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
  const paymentBalancesQuery = usePaymentMethodBalances({
    to: to || undefined,
    currency: currencyFilter || undefined,
  })
  const paymentBalances = paymentBalancesQuery.data ?? []
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [activeRowId, setActiveRowId] = useState<string | null>(null)
  const reorderTransactions = useReorderTransactions()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [groupLabel, setGroupLabel] = useState('')
  const [groupError, setGroupError] = useState('')
  const [fiscalTarget, setFiscalTarget] = useState<FiscalTarget | null>(null)

  const { data: txGroups = [] } = useTransactionGroups()
  const createGroup = useCreateTransactionGroup()
  const deleteGroup = useDeleteTransactionGroup()
  const removeGroupMember = useRemoveGroupMember()

  const { data: paymentMethodsData = [] } = usePaymentMethods()
  const paymentMethodOptions = paymentMethodsData
    .filter(pm => pm.active)
    .map(pm => ({ value: pm.name, label: pm.name }))
  const activePaymentMethodNames = paymentMethodOptions.map(option => option.value)

  const activeProfessionals = professionals.filter(h => h.active)
  const { data: assignments = [] } = useHairdresserServices()
  const assignedRate = (hairdresserId: string, catalogItemId: string | null | undefined) =>
    assignments.find(a => a.hairdresser_id === hairdresserId && a.catalog_item_id === catalogItemId)?.commission_rate

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

  const transactionsQuery = useTransactions({
    subcategoryIds: filterSubcatIds,
    currency: currencyFilter || undefined,
    from: from || undefined,
    to: to || undefined,
    showVoided,
    pendingOnly,
    search: search || undefined,
  })
  const transactions = transactionsQuery.data ?? []
  const isLoading = transactionsQuery.isLoading
  const accountingQueryError = transactionsQuery.error ?? paymentBalancesQuery.error
  const fiscalDocumentByTransactionId = new Map(
    fiscalDocuments.flatMap(document => (document.transaction_ids ?? []).map(transactionId => [transactionId, document] as const)),
  )

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
  const draggedRow = dragId ? rows.find(row => row.id === dragId) ?? null : null
  const activeRow = activeRowId ? rows.find(row => row.id === activeRowId) ?? null : null

  function rowDateIds(row: TxRow): string[] {
    if (row.kind === 'single') return [row.tx.id]
    return row.group.members.filter(m => m.date === row.date && !m.voided_at).map(m => m.id)
  }

  function applyReorder(source: TxRow, target: TxRow) {
    if (source.id === target.id || source.date !== target.date) return

    const dayRows = rows.filter(row => row.date === source.date)
    const fromIndex = dayRows.findIndex(row => row.id === source.id)
    const toIndex = dayRows.findIndex(row => row.id === target.id)
    if (fromIndex === -1 || toIndex === -1) return

    const movedIds = rowDateIds(source)
    const anchorIds = rowDateIds(target)
    if (movedIds.length === 0 || anchorIds.length === 0) return

    reorderTransactions.mutate({
      date: source.date,
      movedIds,
      anchorIds,
      position: toIndex > fromIndex ? 'after' : 'before',
    })
  }

  function handleReorderDrop(target: TxRow) {
    const source = draggedRow
    setDragId(null)
    setOverId(null)
    if (source) applyReorder(source, target)
  }

  const rowsRef = useRef(rows)
  useEffect(() => {
    rowsRef.current = rows
  })

  useEffect(() => {
    if (searchInput === search) return
    const timer = setTimeout(() => setFilterParam('q', searchInput || null), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  })
  const pendingMoveRef = useRef<{ date: string; movedIds: string[] } | null>(null)
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function flushPendingMove() {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    const move = pendingMoveRef.current
    pendingMoveRef.current = null
    if (!move) return

    const dayRows = rowsRef.current.filter(row => row.date === move.date)
    const index = dayRows.findIndex(row => rowDateIds(row).some(id => move.movedIds.includes(id)))
    if (index === -1) return

    const previous = dayRows[index - 1]
    const next = dayRows[index + 1]
    if (previous) {
      reorderTransactions.mutate({ date: move.date, movedIds: move.movedIds, anchorIds: rowDateIds(previous), position: 'after' })
    } else if (next) {
      reorderTransactions.mutate({ date: move.date, movedIds: move.movedIds, anchorIds: rowDateIds(next), position: 'before' })
    }
  }

  function moveRow(row: TxRow, delta: 1 | -1) {
    const dayRows = rows.filter(candidate => candidate.date === row.date)
    const index = dayRows.findIndex(candidate => candidate.id === row.id)
    const target = dayRows[index + delta]
    if (!target) return

    const movedIds = rowDateIds(row)
    const anchorIds = rowDateIds(target)
    if (movedIds.length === 0 || anchorIds.length === 0) return

    applyOptimisticReorder(qc, {
      date: row.date,
      movedIds,
      anchorIds,
      position: delta === 1 ? 'after' : 'before',
    })

    pendingMoveRef.current = { date: row.date, movedIds }
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    flushTimerRef.current = setTimeout(flushPendingMove, FLUSH_DELAY_MS)
  }

  function moveActiveRow(delta: 1 | -1) {
    if (activeRow) moveRow(activeRow, delta)
  }

  const flushRef = useRef(flushPendingMove)
  useEffect(() => {
    flushRef.current = flushPendingMove
  })
  useEffect(() => () => flushRef.current(), [])

  useEffect(() => {
    if (!activeRowId) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setActiveRowId(null)
        flushPendingMove()
        return
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      e.preventDefault()
      moveActiveRow(e.key === 'ArrowDown' ? 1 : -1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const cashMovements = transactionCashMovements(filteredTransactions, paymentMethodFilter || undefined)
  const totals = transactionCashTotals(cashMovements)

  const refundedAntipoIds = new Set(
    transactions.filter(t => t.refunds_anticipo_id !== null).map(t => t.refunds_anticipo_id as string)
  )

  const editSubcategory = subcategories.find(c => c.id === editForm.subcategory_id)
  const isEditInternalTransfer = isInternalTransferCategory(editSubcategory)
  const isEditServiceCategory = editSubcategory?.name.toLowerCase() === 'servicio'
  const isEditInventoryCategory = !!editSubcategory?.deducts_inventory || editSubcategory?.name.toLowerCase() === 'producto'

  const productLabel = (p: Product) => p.unit ? `${p.name} ${p.unit}` : p.name

  function openEdit(tx: Transaction) {
    const mappedPayments = tx.payments && tx.payments.length > 0
      ? tx.payments.map(p => {
          const validMethod = paymentMethodsData.some(pm => pm.active && pm.name === p.payment_method)
          return {
            payment_method: validMethod ? p.payment_method : (paymentMethodsData.find(pm => pm.active)?.name ?? p.payment_method),
            instrument: p.instrument,
            amount: p.amount,
            type: p.type,
          }
        })
      : [makeEmptyPayment()]
    const editPayments = isInternalTransferCategory(tx.subcategory)
      ? normalizeInternalTransferPayments(mappedPayments, activePaymentMethodNames)
      : mappedPayments.map(payment => ({
          payment_method: payment.payment_method,
          instrument: payment.instrument,
          amount: payment.amount,
          ...(tx.subcategory?.transaction_type === 'transfer' ? { type: payment.type } : {}),
        }))

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
      payments: editPayments,
      professionals: tx.professionals?.map(h => ({ id: h.id, commission_rate: h.commission_rate })) ?? [],
      product_id: tx.product_id ?? null,
      product_quantity: 1,
      inventory_items: [],
    })
    setFormError('')
    setModalOpen(true)
  }

  async function handleUpdate() {
    const editTransactionType = typeFromParent(editForm.category_parent_id)
    const total = isEditInternalTransfer
      ? internalTransferAmount(editForm.payments)
      : calcTotal(editForm.payments)
    if (!editForm.date || total <= 0) {
      setFormError('Fecha y al menos un pago con monto son obligatorios.')
      return
    }
    if (isEditInternalTransfer) {
      const transferError = internalTransferValidationError(editForm.payments)
      if (transferError) {
        setFormError(transferError)
        return
      }
    } else {
      const paymentMethodKeys = editForm.payments.map(payment => payment.payment_method.trim().toLocaleLowerCase())
      if (paymentMethodKeys.some(method => !method) || new Set(paymentMethodKeys).size !== paymentMethodKeys.length) {
        setFormError('Cada método de pago debe estar completo y no puede repetirse.')
        return
      }
    }
    if (isDateLocked(editForm.date)) {
      setFormError('El período de esa fecha está cerrado. No se pueden editar transacciones en períodos cerrados.')
      return
    }
    const editDesc = editForm.description.trim().toLowerCase()
    const isEditAnticipo = editDesc === 'anticipo'
    const isEditDevolución = editDesc === 'devolución de anticipo'
    try {
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
        payments: editForm.payments.map(p => ({ ...p, instrument: p.instrument || null, amount: Number(p.amount) })),
        professionals: editForm.professionals,
        product_id: editForm.product_id,
        transfer_direction: editTransactionType === 'transfer' && !isEditInternalTransfer
          ? (editForm.payments[0]?.type === 'entrada' ? 'entrada' : 'salida')
          : undefined,
      })
      setModalOpen(false)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo actualizar la transacción.')
    }
  }

  function changeEditParent(categoryParentId: string) {
    setEditForm(form => {
      let payments = form.payments

      const previousSubcategory = subcategories.find(category => category.id === form.subcategory_id)
      if (isInternalTransferCategory(previousSubcategory)) {
        const origin = payments.find(payment => payment.type === 'salida') ?? payments[0] ?? makeEmptyPayment()
        payments = [{
          payment_method: origin.payment_method,
          instrument: origin.instrument,
          amount: internalTransferAmount(payments),
        }]
      }

      return { ...form, category_parent_id: categoryParentId, subcategory_id: '', payments }
    })
  }

  function changeEditSubcategory(subcategoryId: string) {
    setEditForm(form => {
      const nextSubcategory = subcategories.find(category => category.id === subcategoryId)
      const previousSubcategory = subcategories.find(category => category.id === form.subcategory_id)
      let payments = form.payments

      if (isInternalTransferCategory(nextSubcategory)) {
        payments = normalizeInternalTransferPayments(payments, activePaymentMethodNames)
      } else if (isInternalTransferCategory(previousSubcategory)) {
        const origin = payments.find(payment => payment.type === 'salida') ?? payments[0] ?? makeEmptyPayment()
        payments = [{
          payment_method: origin.payment_method,
          instrument: origin.instrument,
          amount: internalTransferAmount(payments),
          type: origin.type,
        }]
      }

      return { ...form, subcategory_id: subcategoryId, payments }
    })
  }

  async function exportCSV() {
    const movements = transactionCashMovements(filteredTransactions, paymentMethodFilter || undefined)
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
    const rows = movements.map(movement => {
      const signed = movement.type === 'entrada' ? movement.amount : -movement.amount
      balance += signed
      return [
        movement.date,
        `"${(movement.description ?? '').replace(/"/g, '""')}"`,
        `"${movement.paymentMethod.replace(/"/g, '""')}"`,
        fmt(signed),
        fmt(balance),
      ].join(';')
    })

    const totalCredits = movements.reduce((sum, movement) =>
      movement.type === 'entrada' ? sum + movement.amount : sum, 0)
    const totalDebits = movements.reduce((sum, movement) =>
      movement.type === 'salida' ? sum - movement.amount : sum, 0)

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
      showToast('El período de esa transacción está cerrado. No se pueden anular transacciones en períodos cerrados.', 'warning')
      return
    }
    if (!(await confirmDialog({ message: '¿Anular esta transacción? La acción quedará registrada.', danger: true }))) return
    await voidTx.mutateAsync(id)
  }


  function renderFiscalAction(tx: FiscalSourceTransaction) {
    if (!isAdmin) return null
    const document = fiscalDocumentByTransactionId.get(tx.id)
    const eligibility = fiscalTransactionEligibility(tx, document?.status)
    if (!eligibility.canCreate && !eligibility.canOpenExisting) return null
    const label = document ? `Ver factura · ${fiscalDocumentStatusLabel(document.status)}` : 'Facturar'
    return (
      <button
        type="button"
        onClick={() => setFiscalTarget({ label: tx.description || 'Transacción', transactions: [tx] })}
        title={document ? `Abrir comprobante existente (${fiscalDocumentStatusLabel(document.status)})` : 'Facturar esta transacción'}
        aria-label={`${label}: ${tx.description || 'transacción'}`}
        className="transaction-touch-action inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-bg)]"
      >
        <ReceiptText size={14} aria-hidden="true" />
        <span>{document ? 'Ver factura' : 'Facturar'}</span>
      </button>
    )
  }

  function renderActions(tx: Transaction, includeFiscal = true) {
    const canModify = !tx.voided_at && !isDateLocked(tx.date)
    return (
      <>
        {includeFiscal && renderFiscalAction(tx)}
        {canModify && <>
        <button
          type="button"
          onClick={() => openEdit(tx)}
          title="Editar"
          aria-label="Editar"
          className="transaction-touch-action p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button
          type="button"
          onClick={() => handleVoid(tx.id)}
          title="Anular"
          aria-label="Anular"
          className="transaction-touch-action p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
        >
          <Ban size={14} />
        </button>
        </>}
      </>
    )
  }

  function renderGroupActions(group: TransactionGroupWithMembers) {
    const state = fiscalGroupInvoiceState(group.members, fiscalDocuments)
    const existingDocument = state.kind === 'existing'
      ? fiscalDocuments.find(document => document.id === state.document.id)
      : undefined
    const label = existingDocument ? 'Ver factura' : 'Facturar'
    const explanation = state.reason
      ?? (existingDocument ? `Abrir comprobante existente (${fiscalDocumentStatusLabel(existingDocument.status)})` : `Facturar el grupo completo por ${CURRENCY_SYMBOL[group.currency]}${state.total.toLocaleString('es-CO')}`)

    return (
      <>
        {isAdmin && <button
          type="button"
          aria-disabled={state.kind === 'blocked'}
          aria-label={`${label} grupo ${group.label}. ${explanation}`}
          title={explanation}
          onClick={() => {
            if (state.kind === 'blocked') {
              showToast(state.reason ?? 'Este grupo no se puede facturar.', 'warning')
              return
            }
            setFiscalTarget({ label: group.label, transactions: group.members })
          }}
          className={`transaction-touch-action inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs font-semibold transition-colors ${state.kind === 'blocked' ? 'cursor-not-allowed text-[var(--color-muted)] opacity-60' : 'text-[var(--color-accent)] hover:bg-[var(--color-bg)]'}`}
        >
          <ReceiptText size={14} aria-hidden="true" />
          <span>{label}</span>
        </button>}
        <button
          type="button"
          onClick={() => deleteGroup.mutate(group.id)}
          title="Desagrupar"
          aria-label={`Desagrupar ${group.label}`}
          className="transaction-touch-action rounded-lg p-1.5 text-[var(--color-muted)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
        >
          <Unlink size={14} />
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
            <div key={member.id} style={member.voided_at ? { opacity: 0.5 } : undefined}>
              <div className="hidden md:grid grid-cols-[7rem_1fr_10rem_9rem_6rem] items-center gap-3 py-2 text-sm">
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
                  {full && renderActions(full, false)}
                  <button
                    type="button"
                    onClick={() => removeGroupMember.mutate({ groupId: group.id, transactionId: member.id })}
                    title="Quitar del grupo"
                    aria-label="Quitar del grupo"
                    className="transaction-touch-action p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
                  >
                    <Unlink size={14} />
                  </button>
                </div>
              </div>
              <div className="transaction-group-member md:hidden py-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="break-words font-medium text-[var(--color-text)]">{member.description || '—'}</span>
                      {member.voided_at && <Badge variant="danger">Anulada</Badge>}
                      {outOfFilter && <Badge variant="default">Fuera del filtro</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
                      <span>{formatDate(member.date)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{member.subcategory?.name || 'Sin subcategoría'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{member.voided_at ? 'Anulada' : 'Registrada'}</span>
                    </div>
                  </div>
                  <span
                    className="shrink-0 text-right font-semibold tabular-nums"
                    style={{ color: dir === 'entrada' ? 'var(--color-success)' : dir === 'salida' ? 'var(--color-danger)' : 'var(--color-muted)' }}
                  >
                    {dir === 'entrada' ? '+' : dir === 'salida' ? '-' : ''}{sym}{member.amount.toLocaleString('es-CO')}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-end gap-1">
                  {full && renderActions(full, false)}
                  <button
                    type="button"
                    onClick={() => removeGroupMember.mutate({ groupId: group.id, transactionId: member.id })}
                    title="Quitar del grupo"
                    aria-label="Quitar del grupo"
                    className="transaction-touch-action p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
                  >
                    <Unlink size={16} />
                  </button>
                </div>
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
      render: (row: TxRow) => (
        <button
          type="button"
          draggable
          onDragStart={e => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', row.id)
            setDragId(row.id)
          }}
          onDragEnd={() => {
            setDragId(null)
            setOverId(null)
          }}
          onClick={() => {
            flushPendingMove()
            setActiveRowId(current => (current === row.id ? null : row.id))
          }}
          title={activeRowId === row.id ? 'Movela con ↑ y ↓ (Esc para soltarla)' : 'Arrastrar para reordenar, o clic para moverla con las flechas'}
          className={`inline-flex cursor-grab active:cursor-grabbing ${activeRowId === row.id ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
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
        if (row.kind === 'group') {
          const { señas } = groupTotals(row.group)
          return señas !== 0
            ? <span className="tabular-nums text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>{formatSigned(señas, CURRENCY_SYMBOL[row.group.currency])}</span>
            : <span style={{ color: 'var(--color-muted)' }}>—</span>
        }
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
          const { services } = groupTotals(row.group)
          return (
            <span className="font-semibold tabular-nums" style={{ color: services >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
              {formatSigned(services, CURRENCY_SYMBOL[row.group.currency])}
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
      className: 'w-[11rem] min-w-[11rem]',
      render: (row: TxRow) => (
        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
          {row.kind === 'group' ? renderGroupActions(row.group) : renderActions(row.tx)}
        </div>
      ),
    },
  ]

  function renderColumn(key: string, row: TxRow) {
    return columns.find(column => column.key === key)?.render(row)
  }

  function mobileRowStatus(row: TxRow) {
    if (row.kind === 'group') {
      return `${row.group.members.filter(member => !member.voided_at).length} activas`
    }
    if (row.tx.voided_at) return 'Anulada'
    if (row.tx.inventory_pending) return 'Sin descontar'
    if (row.tx.is_seña && row.tx.description?.trim().toLowerCase() === 'anticipo' && refundedAntipoIds.has(row.tx.id)) return 'Devuelta'
    return 'Registrada'
  }

  function renderMobileTransactionCard(row: TxRow, { isOpen, toggle }: { isOpen: boolean; toggle: () => void }) {
    const label = row.kind === 'group' ? row.group.label : row.tx.description || 'Transacción'
    const dayRows = rows.filter(candidate => candidate.date === row.date)
    const rowIndex = dayRows.findIndex(candidate => candidate.id === row.id)
    const canMoveUp = rowIndex > 0
    const canMoveDown = rowIndex >= 0 && rowIndex < dayRows.length - 1
    const detailId = `mobile-transaction-${row.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`

    return (
      <article className="transaction-mobile-card data-card" data-row-kind={row.kind} data-row-id={row.id}>
        <div className="transaction-mobile-card__header">
          {row.kind === 'single' && !row.tx.voided_at ? (
            <label className="transaction-mobile-card__select" title={`Seleccionar ${label}`}>
              <input
                type="checkbox"
                checked={selected.has(row.tx.id)}
                onChange={() => toggleSelected(row.tx.id)}
                aria-label={`Seleccionar ${label}`}
                style={{ accentColor: 'var(--color-accent)' }}
              />
            </label>
          ) : (
            <span className="transaction-mobile-card__select" aria-hidden="true"><Layers size={18} /></span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start gap-2">
              <span className="min-w-0 flex-1 break-words font-semibold text-[var(--color-text)]">{label}</span>
              {row.kind === 'group' && <Badge variant="default">Grupo</Badge>}
            </div>
            <div className="transaction-mobile-card__meta">
              <span>{formatDate(row.date)}</span>
              <span aria-hidden="true">·</span>
              <span>{renderColumn('subcategory', row)}</span>
              <span aria-hidden="true">·</span>
              <span>{mobileRowStatus(row)}</span>
            </div>
          </div>
          <div className="transaction-mobile-card__amount">{renderColumn('monto', row)}</div>
          <button
            type="button"
            className="transaction-mobile-card__toggle"
            onClick={toggle}
            aria-expanded={isOpen}
            aria-controls={detailId}
            aria-label={isOpen ? `Contraer ${label}` : `Ver detalle de ${label}`}
          >
            <ChevronDown size={18} aria-hidden="true" />
          </button>
        </div>
        {isOpen && (
          <div id={detailId} className="transaction-mobile-card__details">
            <div className="transaction-mobile-card__field">
              <span>Categoría</span>
              <div>{renderColumn('category', row)}</div>
            </div>
            <div className="transaction-mobile-card__field">
              <span>Métodos</span>
              <div>{renderColumn('payments', row)}</div>
            </div>
            <div className="transaction-mobile-card__field">
              <span>Anticipo</span>
              <div>{renderColumn('seña_amount', row)}</div>
            </div>
            {row.kind === 'group' && (
              <div className="transaction-mobile-card__group-detail">{renderGroupDetail(row.group)}</div>
            )}
            <div className="transaction-mobile-card__reorder" role="group" aria-label={`Ordenar ${label}`}>
              <span className="text-xs font-semibold text-[var(--color-muted)]">Orden en {formatDate(row.date)}</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="transaction-mobile-card__reorder-button"
                  onClick={() => moveRow(row, -1)}
                  disabled={!canMoveUp}
                  aria-label={`Mover ${label} hacia arriba`}
                >
                  <ArrowUp size={16} />
                  Subir
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="transaction-mobile-card__reorder-button"
                  onClick={() => moveRow(row, 1)}
                  disabled={!canMoveDown}
                  aria-label={`Mover ${label} hacia abajo`}
                >
                  <ArrowDown size={16} />
                  Bajar
                </Button>
              </div>
            </div>
            <div className="transaction-mobile-card__actions flex-wrap">
              {row.kind === 'group' ? (
                renderGroupActions(row.group)
              ) : renderActions(row.tx)}
            </div>
          </div>
        )}
      </article>
    )
  }

  return (
    <div className="transactions-page animate-fade-in flex-1 min-h-0 flex flex-col">
      <TopBar
        title="Transacciones"
        subtitle={`${filteredTransactions.length} registros`}
        actions={
          <div className="transactions-toolbar w-full md:w-auto">
            <div className="transactions-mobile-toolbar md:hidden">
              <Button
                className="transactions-mobile-toolbar__primary"
                onClick={() => {
                  const back = searchParams.toString()
                  navigate({ pathname: '/transactions/cargar', search: back ? `back=${encodeURIComponent(back)}` : '' })
                }}
                size="sm"
              >
                <Zap size={16} />
                Nueva transacción
              </Button>
              <div className="transactions-mobile-toolbar__secondary">
                <Button variant="secondary" size="sm" onClick={() => setReconcileOpen(true)}>
                  <Link size={14} />
                  Reconciliar productos
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={exportCSV}
                  disabled={!!search}
                  title={search ? 'El CSV lleva un balance corrido por período: limpiá la búsqueda para exportar' : undefined}
                >
                  <Download size={14} />
                  Exportar CSV
                </Button>
              </div>
            </div>
            <div className="hidden md:flex gap-2">
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
              <Button
                variant="secondary"
                size="sm"
                onClick={exportCSV}
                disabled={!!search}
                title={search ? 'El CSV lleva un balance corrido por período: limpiá la búsqueda para exportar' : undefined}
              >
                <Download size={14} />
                Exportar CSV
              </Button>
              <Button
                onClick={() => {
                  const back = searchParams.toString()
                  navigate({ pathname: '/transactions/cargar', search: back ? `back=${encodeURIComponent(back)}` : '' })
                }}
                size="sm"
              >
                <Zap size={14} />
                Nueva transacción
              </Button>
            </div>
          </div>
        }
      />

      <div className="responsive-page-body flex-1 min-h-0 flex flex-col p-4 md:p-6 gap-4">
        <div className="responsive-filters flex flex-wrap gap-3">
          <Input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar por descripción"
            prefix={<Search size={14} />}
            className="w-64"
          />
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
            disabled={!!search}
            title={search ? 'La búsqueda mira todo el histórico, sin rango de fechas' : undefined}
          />
          <Input
            type="date"
            value={to}
            onChange={e => setDateParam('to', e.target.value)}
            placeholder="Hasta"
            className="w-40"
            disabled={!!search}
            title={search ? 'La búsqueda mira todo el histórico, sin rango de fechas' : undefined}
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

        {accountingQueryError && (
          <div
            role="alert"
            className="rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)', background: 'var(--color-danger-light)' }}
          >
            No se pudieron actualizar los datos contables: {accountingQueryError.message}
          </div>
        )}

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

        {activeRow && (
          <div className="active-row-controls hidden md:flex items-center justify-between gap-3 px-4 py-2 rounded-xl border border-[var(--color-accent)] bg-[var(--color-surface)]">
            <span className="text-xs text-[var(--color-text)]">
              Moviendo <strong>{activeRow.kind === 'single' ? activeRow.tx.description || 'transacción' : activeRow.group.label}</strong> dentro del {formatDate(activeRow.date)} — usá ↑ y ↓ para colocarla.
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => moveActiveRow(-1)} aria-label="Mover hacia arriba">
                <ArrowUp size={16} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => moveActiveRow(1)} aria-label="Mover hacia abajo">
                <ArrowDown size={16} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setActiveRowId(null); flushPendingMove() }}>Soltar</Button>
            </div>
          </div>
        )}

        <div className="responsive-data-surface flex-1 min-h-0 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
          <Table
            columns={columns}
            data={rows}
            keyField="id"
            mobileTitleKey="description"
            mobileSummaryKeys={['date', 'monto']}
            renderMobileCard={renderMobileTransactionCard}
            loading={isLoading}
            emptyMessage="No hay transacciones para los filtros seleccionados"
            paginate={false}
            renderExpanded={(row: TxRow) => row.kind === 'group' ? renderGroupDetail(row.group) : null}
            rowProps={(row: TxRow) => {
              const isDropTarget = draggedRow !== null && draggedRow.id !== row.id && draggedRow.date === row.date
              const outline = 'outline outline-2 -outline-offset-2 outline-[var(--color-accent)]'
              return {
                onDragOver: (e: DragEvent<HTMLTableRowElement>) => {
                  if (!isDropTarget) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setOverId(row.id)
                },
                onDragLeave: () => setOverId(current => (current === row.id ? null : current)),
                onDrop: (e: DragEvent<HTMLTableRowElement>) => {
                  e.preventDefault()
                  handleReorderDrop(row)
                },
                className: [
                  isDropTarget && overId === row.id ? outline : '',
                  activeRowId === row.id ? `${outline} outline-dashed` : '',
                ].filter(Boolean).join(' '),
              }
            }}
            appendRow={
              !search && Object.keys(totals).length > 0 ? (
                <>
                  {Object.entries(totals).map(([currency, { entrada, salida }]) => (
                    <tr key={currency} className="border-t-2 border-[var(--color-border)]" style={{ background: 'var(--color-bg)' }}>
                      <td colSpan={columns.length - 1} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                        Flujo de caja del período {Object.keys(totals).length > 1 ? currency : ''}
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

      {selected.size > 0 && (
        <div className="transactions-selection-bar md:hidden" role="region" aria-label="Acciones de selección">
          <span className="transactions-selection-bar__count">{selected.size} seleccionada{selected.size === 1 ? '' : 's'}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Cancelar
          </Button>
          {selected.size >= 2 && (
            <Button
              type="button"
              size="sm"
              onClick={() => { setGroupError(''); setGroupModalOpen(true) }}
            >
              <Layers size={16} />
              Agrupar
            </Button>
          )}
        </div>
      )}

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
              onChange={e => changeEditParent(e.target.value)}
            />
            <Select
              label="Subcategoría"
              options={[
                { value: '', label: 'Seleccionar...' },
                ...subcatsForParent(editForm.category_parent_id).map(c => ({ value: c.id, label: c.name })),
              ]}
              value={editForm.subcategory_id}
              onChange={e => changeEditSubcategory(e.target.value)}
            />
          </div>

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

          {isEditInternalTransfer ? (
            <div className="space-y-3">
              <span className="text-sm font-medium text-[var(--color-text)]">Transferencia interna</span>
              {editForm.payments.map((payment, index) => (
                <div key={payment.type} className="grid grid-cols-2 gap-3">
                  <Select
                    label={payment.type === 'salida' ? 'Cuenta de origen' : 'Cuenta de destino'}
                    options={paymentMethodOptions}
                    value={payment.payment_method}
                    onChange={e => setEditForm(form => ({
                      ...form,
                      payments: form.payments.map((row, rowIndex) => rowIndex === index
                        ? { ...row, payment_method: e.target.value as PaymentMethod }
                        : row),
                    }))}
                  />
                  <Select
                    label="Instrumento"
                    options={INSTRUMENT_OPTIONS}
                    value={payment.instrument ?? ''}
                    onChange={e => setEditForm(form => ({
                      ...form,
                      payments: form.payments.map((row, rowIndex) => rowIndex === index
                        ? { ...row, instrument: (e.target.value as PaymentInstrument) || null }
                        : row),
                    }))}
                  />
                </div>
              ))}
              <Input
                label="Importe transferido"
                type="number"
                min="0"
                step="0.01"
                value={internalTransferAmount(editForm.payments) || ''}
                onChange={e => {
                  const amount = parseFloat(e.target.value) || 0
                  setEditForm(form => ({
                    ...form,
                    payments: form.payments.map(payment => ({ ...payment, amount })),
                  }))
                }}
                prefix={CURRENCY_SYMBOL[editForm.currency]}
              />
              <p className="text-xs text-[var(--color-muted)]">
                La salida y la entrada usan la misma moneda e importe. El movimiento neto es cero.
              </p>
            </div>
          ) : (
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
          )}



          {isEditServiceCategory && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[var(--color-text)]">Profesionales</span>
                {activeProfessionals.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditForm(f => ({ ...f, professionals: [...f.professionals, { id: activeProfessionals[0].id, commission_rate: assignedRate(activeProfessionals[0].id, f.catalog_item_id) ?? 0 }] }))}
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
                        onChange={e => setEditForm(f => ({ ...f, professionals: f.professionals.map((p, ii) => ii === i ? { ...p, id: e.target.value, commission_rate: assignedRate(e.target.value, f.catalog_item_id) ?? p.commission_rate } : p) }))}
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
      {fiscalTarget && <FiscalInvoiceModal key={fiscalTarget.transactions.map(transaction => transaction.id).join(':')} open onClose={() => setFiscalTarget(null)} sourceLabel={fiscalTarget.label} transactions={fiscalTarget.transactions} />}
    </div>
  )
}
