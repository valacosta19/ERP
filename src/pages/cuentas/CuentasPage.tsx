import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useSupplierDebts, useRecordSupplierDebtPayment } from '@/hooks/useSupplierDebts'
import { useReceivables, useCreateReceivable, useRecordReceivableCollection } from '@/hooks/useReceivables'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { formatDate } from '@/lib/formatDate'
import type { Currency, SupplierDebt, Receivable } from '@/types'
import { todayLocal } from '@/lib/dateRange'
import { formatMoney, CURRENCY_SYMBOL } from '@/lib/money'

function fmtCurrency(amount: number, currency: Currency = 'ARS') {
  return formatMoney(amount, currency)
}


function pendingAmount(total: number, paid: number) {
  return Math.max(0, total - paid)
}

function debtStatus(debt: SupplierDebt): 'paid' | 'overdue' | 'open' {
  const pending = pendingAmount(debt.total_amount, debt.paid_amount)
  if (pending <= 0) return 'paid'
  if (debt.due_date && debt.due_date < todayLocal()) return 'overdue'
  return 'open'
}

function receivableStatus(r: Receivable): 'collected' | 'overdue' | 'open' {
  const pending = pendingAmount(r.total_amount, r.collected_amount)
  if (pending <= 0) return 'collected'
  if (r.due_date && r.due_date < todayLocal()) return 'overdue'
  return 'open'
}

const STATUS_BADGE: Record<string, 'success' | 'danger' | 'warning' | 'default'> = {
  paid: 'success',
  collected: 'success',
  overdue: 'danger',
  open: 'warning',
}

const STATUS_LABEL: Record<string, string> = {
  paid: 'Pagado',
  collected: 'Cobrado',
  overdue: 'Vencida',
  open: 'Pendiente',
}

function APTab() {
  const { data: debts = [], isLoading } = useSupplierDebts()
  const { data: paymentMethods = [] } = usePaymentMethods()
  const recordPayment = useRecordSupplierDebtPayment()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [payModal, setPayModal] = useState<{ debt: SupplierDebt; clientUuid: string } | null>(null)
  const [payForm, setPayForm] = useState({ amount: '', payment_method: '', date: todayLocal(), notes: '' })
  const [payError, setPayError] = useState('')

  const activePaymentMethods = paymentMethods.filter(m => m.active)

  function openPayModal(debt: SupplierDebt) {
    setPayForm({
      amount: String(pendingAmount(debt.total_amount, debt.paid_amount)),
      payment_method: activePaymentMethods[0]?.name ?? '',
      date: todayLocal(),
      notes: '',
    })
    setPayError('')
    setPayModal({ debt, clientUuid: crypto.randomUUID() })
  }

  async function handlePay() {
    if (!payModal) return
    const amount = parseFloat(payForm.amount)
    if (!amount || amount <= 0) { setPayError('Ingresá un monto válido.'); return }
    if (!payForm.payment_method) { setPayError('Seleccioná un método de pago.'); return }
    const maxPending = pendingAmount(payModal.debt.total_amount, payModal.debt.paid_amount)
    if (amount > maxPending + 0.001) { setPayError(`El monto no puede superar el saldo pendiente (${fmtCurrency(maxPending)}).`); return }

    await recordPayment.mutateAsync({
      client_uuid: payModal.clientUuid,
      debt_id: payModal.debt.id,
      amount,
      payment_method: payForm.payment_method,
      date: payForm.date,
      notes: payForm.notes || null,
    })
    setPayModal(null)
  }

  const openDebts = debts.filter(d => pendingAmount(d.total_amount, d.paid_amount) > 0)
  const closedDebts = debts.filter(d => pendingAmount(d.total_amount, d.paid_amount) <= 0)

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-block w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  function DebtRow({ debt }: { debt: SupplierDebt }) {
    const status = debtStatus(debt)
    const pending = pendingAmount(debt.total_amount, debt.paid_amount)
    const isExpanded = expandedId === debt.id

    return (
      <>
        <tr className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
          <td className="w-8 px-2 py-3">
            <button
              onClick={() => setExpandedId(isExpanded ? null : debt.id)}
              className="p-1 text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          </td>
          <td className="px-3 py-3 text-sm text-[var(--color-text)]">{debt.supplier?.name ?? '—'}</td>
          <td className="px-3 py-3 text-sm tabular-nums text-[var(--color-text)]">{fmtCurrency(debt.total_amount)}</td>
          <td className="px-3 py-3 text-sm tabular-nums font-semibold text-[var(--color-text)]">{fmtCurrency(pending)}</td>
          <td className="px-3 py-3 text-sm text-[var(--color-muted)]">{debt.due_date ? formatDate(debt.due_date) : '—'}</td>
          <td className="px-3 py-3">
            <Badge variant={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge>
          </td>
          <td className="px-3 py-3 text-right">
            {pending > 0 && (
              <Button size="sm" variant="secondary" onClick={() => openPayModal(debt)}>
                Registrar pago
              </Button>
            )}
          </td>
        </tr>
        {isExpanded && (
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            <td colSpan={7} className="px-6 py-3">
              {!debt.payments || debt.payments.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">Sin pagos registrados</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[var(--color-muted)] uppercase tracking-wider">
                      <th className="text-left py-1 font-semibold">Fecha</th>
                      <th className="text-left py-1 font-semibold">Método</th>
                      <th className="text-right py-1 font-semibold">Monto</th>
                      <th className="text-left py-1 font-semibold">Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debt.payments.map(p => (
                      <tr key={p.id} className="border-t border-[var(--color-border)]">
                        <td className="py-1 text-[var(--color-muted)]">{formatDate(p.date)}</td>
                        <td className="py-1 text-[var(--color-text)]">{p.payment_method}</td>
                        <td className="py-1 text-right tabular-nums text-[var(--color-text)]">{fmtCurrency(p.amount)}</td>
                        <td className="py-1 text-[var(--color-muted)]">{p.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </td>
          </tr>
        )}
      </>
    )
  }

  return (
    <div className="space-y-4">
      {debts.length === 0 ? (
        <p className="text-center text-[var(--color-muted)] py-12 text-sm">No hay deudas con proveedores registradas</p>
      ) : (
        <>
          {openDebts.length > 0 && (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    <th className="w-8 px-2 py-2" />
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Proveedor</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Total</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Pendiente</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Vencimiento</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Estado</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {openDebts.map(debt => <DebtRow key={debt.id} debt={debt} />)}
                </tbody>
              </table>
            </div>
          )}

          {closedDebts.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors select-none py-1">
                Ver pagadas ({closedDebts.length})
              </summary>
              <div className="mt-2 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden opacity-70">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                      <th className="w-8 px-2 py-2" />
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Proveedor</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Total</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Pendiente</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Vencimiento</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Estado</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {closedDebts.map(debt => <DebtRow key={debt.id} debt={debt} />)}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="Registrar pago" size="sm">
        {payModal && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-muted)]">
              Proveedor: <span className="text-[var(--color-text)] font-medium">{payModal.debt.supplier?.name ?? '—'}</span>
              {' · '}Saldo: <span className="font-medium">{fmtCurrency(pendingAmount(payModal.debt.total_amount, payModal.debt.paid_amount))}</span>
            </p>
            <Input
              label="Monto"
              type="number"
              min="0.01"
              step="0.01"
              value={payForm.amount}
              onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
              prefix="$"
            />
            <Select
              label="Método de pago"
              options={activePaymentMethods.map(m => ({ value: m.name, label: m.name }))}
              value={payForm.payment_method}
              onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}
            />
            <Input
              label="Fecha"
              type="date"
              value={payForm.date}
              onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))}
            />
            <Input
              label="Notas (opcional)"
              value={payForm.notes}
              onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
            />
            {payError && <p className="text-xs text-[var(--color-danger)]">{payError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setPayModal(null)}>Cancelar</Button>
              <Button onClick={handlePay} loading={recordPayment.isPending}>Confirmar pago</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function StaffWithdrawalsSummary({ receivables }: { receivables: Receivable[] }) {
  const staffEntries = receivables.filter(r => r.hairdresser_id != null)
  if (staffEntries.length === 0) return null

  const byHairdresserAndCurrency = new Map<string, { name: string; currency: Currency; pending: number; count: number }>()
  for (const r of staffEntries) {
    const pending = pendingAmount(r.total_amount, r.collected_amount)
    const key = `${r.hairdresser_id}:${r.currency}`
    const existing = byHairdresserAndCurrency.get(key) ?? { name: r.debtor_name, currency: r.currency, pending: 0, count: 0 }
    existing.pending += pending
    existing.count += 1
    byHairdresserAndCurrency.set(key, existing)
  }

  const rows = Array.from(byHairdresserAndCurrency.values())
    .filter(entry => entry.pending > 0)
    .sort((a, b) => a.name.localeCompare(b.name) || a.currency.localeCompare(b.currency))
  if (rows.length === 0) return null

  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Retiros de staff</h3>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Saldos pendientes a descontar de comisión o cobrar manualmente.</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Empleado</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Retiros</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Saldo pendiente</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={`${r.name}:${r.currency}`} className="border-b border-[var(--color-border)] last:border-b-0">
              <td className="px-3 py-2 text-[var(--color-text)]">{r.name}</td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted)]">{r.count}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--color-text)]">{fmtCurrency(r.pending, r.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ARTab() {
  const { data: receivables = [], isLoading } = useReceivables()
  const { data: paymentMethods = [] } = usePaymentMethods()
  const createReceivable = useCreateReceivable()
  const recordCollection = useRecordReceivableCollection()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createUuid, setCreateUuid] = useState('')
  const [createForm, setCreateForm] = useState({ debtor_name: '', concept: '', total_amount: '', currency: 'ARS' as Currency, due_date: '', notes: '', payout_method: '', payout_date: todayLocal() })
  const [createError, setCreateError] = useState('')

  const [collectModal, setCollectModal] = useState<{ receivable: Receivable; clientUuid: string } | null>(null)
  const [collectForm, setCollectForm] = useState({ amount: '', payment_method: '', date: todayLocal(), notes: '' })
  const [collectError, setCollectError] = useState('')

  const activePaymentMethods = paymentMethods.filter(m => m.active)

  function openCreate() {
    setCreateForm({ debtor_name: '', concept: '', total_amount: '', currency: 'ARS', due_date: '', notes: '', payout_method: '', payout_date: todayLocal() })
    setCreateError('')
    setCreateUuid(crypto.randomUUID())
    setCreateOpen(true)
  }

  async function handleCreate() {
    if (!createForm.debtor_name.trim()) { setCreateError('El deudor es obligatorio.'); return }
    if (!createForm.concept.trim()) { setCreateError('El concepto es obligatorio.'); return }
    const amount = parseFloat(createForm.total_amount)
    if (!amount || amount <= 0) { setCreateError('Ingresá un monto válido.'); return }
    if (createForm.payout_method && !createForm.payout_date) { setCreateError('Ingresá la fecha de la salida de dinero.'); return }
    await createReceivable.mutateAsync({
      debtor_name: createForm.debtor_name.trim(),
      concept: createForm.concept.trim(),
      total_amount: amount,
      currency: createForm.currency,
      due_date: createForm.due_date || null,
      notes: createForm.notes || null,
      payout: createForm.payout_method
        ? { payment_method: createForm.payout_method, date: createForm.payout_date, client_uuid: createUuid }
        : null,
    })
    setCreateOpen(false)
  }

  function openCollectModal(r: Receivable) {
    setCollectForm({
      amount: String(pendingAmount(r.total_amount, r.collected_amount)),
      payment_method: activePaymentMethods[0]?.name ?? '',
      date: todayLocal(),
      notes: '',
    })
    setCollectError('')
    setCollectModal({ receivable: r, clientUuid: crypto.randomUUID() })
  }

  async function handleCollect() {
    if (!collectModal) return
    const amount = parseFloat(collectForm.amount)
    if (!amount || amount <= 0) { setCollectError('Ingresá un monto válido.'); return }
    if (!collectForm.payment_method) { setCollectError('Seleccioná un método de pago.'); return }
    const maxPending = pendingAmount(collectModal.receivable.total_amount, collectModal.receivable.collected_amount)
    if (amount > maxPending + 0.001) { setCollectError(`El monto no puede superar el saldo (${fmtCurrency(maxPending, collectModal.receivable.currency)}).`); return }

    await recordCollection.mutateAsync({
      client_uuid: collectModal.clientUuid,
      receivable_id: collectModal.receivable.id,
      amount,
      payment_method: collectForm.payment_method,
      date: collectForm.date,
      notes: collectForm.notes || null,
    })
    setCollectModal(null)
  }

  const openReceivables = receivables.filter(r => pendingAmount(r.total_amount, r.collected_amount) > 0)
  const closedReceivables = receivables.filter(r => pendingAmount(r.total_amount, r.collected_amount) <= 0)

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-block w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  function ReceivableRow({ r }: { r: Receivable }) {
    const status = receivableStatus(r)
    const pending = pendingAmount(r.total_amount, r.collected_amount)
    const isExpanded = expandedId === r.id

    return (
      <>
        <tr className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
          <td className="w-8 px-2 py-3">
            <button
              onClick={() => setExpandedId(isExpanded ? null : r.id)}
              className="p-1 text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          </td>
          <td className="px-3 py-3 text-sm text-[var(--color-text)]">{r.debtor_name}</td>
          <td className="px-3 py-3 text-sm text-[var(--color-muted)]">{r.concept}</td>
          <td className="px-3 py-3 text-sm tabular-nums text-[var(--color-text)]">{fmtCurrency(r.total_amount, r.currency)}</td>
          <td className="px-3 py-3 text-sm tabular-nums font-semibold text-[var(--color-text)]">{fmtCurrency(pending, r.currency)}</td>
          <td className="px-3 py-3 text-sm text-[var(--color-muted)]">{r.due_date ? formatDate(r.due_date) : '—'}</td>
          <td className="px-3 py-3">
            <Badge variant={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge>
          </td>
          <td className="px-3 py-3 text-right">
            {pending > 0 && (
              <Button size="sm" variant="secondary" onClick={() => openCollectModal(r)}>
                Registrar cobro
              </Button>
            )}
          </td>
        </tr>
        {isExpanded && (
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            <td colSpan={8} className="px-6 py-3">
              {!r.collections || r.collections.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">Sin cobros registrados</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[var(--color-muted)] uppercase tracking-wider">
                      <th className="text-left py-1 font-semibold">Fecha</th>
                      <th className="text-left py-1 font-semibold">Método</th>
                      <th className="text-right py-1 font-semibold">Monto</th>
                      <th className="text-left py-1 font-semibold">Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.collections.map(c => (
                      <tr key={c.id} className="border-t border-[var(--color-border)]">
                        <td className="py-1 text-[var(--color-muted)]">{formatDate(c.date)}</td>
                        <td className="py-1 text-[var(--color-text)]">{c.payment_method}</td>
                        <td className="py-1 text-right tabular-nums text-[var(--color-text)]">{fmtCurrency(c.amount, r.currency)}</td>
                        <td className="py-1 text-[var(--color-muted)]">{c.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </td>
          </tr>
        )}
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} />
          Nueva cuenta por cobrar
        </Button>
      </div>

      <StaffWithdrawalsSummary receivables={receivables} />

      {receivables.length === 0 ? (
        <p className="text-center text-[var(--color-muted)] py-12 text-sm">No hay cuentas por cobrar registradas</p>
      ) : (
        <>
          {openReceivables.length > 0 && (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    <th className="w-8 px-2 py-2" />
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Deudor</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Concepto</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Total</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Pendiente</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Vencimiento</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Estado</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {openReceivables.map(r => <ReceivableRow key={r.id} r={r} />)}
                </tbody>
              </table>
            </div>
          )}

          {closedReceivables.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors select-none py-1">
                Ver cobradas ({closedReceivables.length})
              </summary>
              <div className="mt-2 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden opacity-70">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                      <th className="w-8 px-2 py-2" />
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Deudor</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Concepto</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Total</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Pendiente</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Vencimiento</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Estado</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {closedReceivables.map(r => <ReceivableRow key={r.id} r={r} />)}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nueva cuenta por cobrar" size="sm">
        <div className="space-y-3">
          <Input
            label="Deudor"
            placeholder="Nombre del cliente o empleado"
            value={createForm.debtor_name}
            onChange={e => setCreateForm(f => ({ ...f, debtor_name: e.target.value }))}
          />
          <Input
            label="Concepto"
            placeholder="Anticipo, préstamo, etc."
            value={createForm.concept}
            onChange={e => setCreateForm(f => ({ ...f, concept: e.target.value }))}
          />
          <Select
            label="Moneda"
            options={(['ARS', 'USD', 'EUR'] as Currency[]).map(currency => ({ value: currency, label: currency }))}
            value={createForm.currency}
            onChange={e => setCreateForm(f => ({ ...f, currency: e.target.value as Currency }))}
          />
          <Input
            label="Monto total"
            type="number"
            min="0.01"
            step="0.01"
            value={createForm.total_amount}
            onChange={e => setCreateForm(f => ({ ...f, total_amount: e.target.value }))}
            prefix={CURRENCY_SYMBOL[createForm.currency]}
          />
          <Select
            label="Salida de dinero (opcional)"
            options={[
              { value: '', label: 'No salió dinero de ninguna cuenta' },
              ...activePaymentMethods.map(m => ({ value: m.name, label: `Sale de ${m.name}` })),
            ]}
            value={createForm.payout_method}
            onChange={e => setCreateForm(f => ({ ...f, payout_method: e.target.value }))}
          />
          {createForm.payout_method && (
            <Input
              label="Fecha de la salida"
              type="date"
              value={createForm.payout_date}
              onChange={e => setCreateForm(f => ({ ...f, payout_date: e.target.value }))}
            />
          )}
          <Input
            label="Fecha de vencimiento (opcional)"
            type="date"
            value={createForm.due_date}
            onChange={e => setCreateForm(f => ({ ...f, due_date: e.target.value }))}
          />
          <Input
            label="Notas (opcional)"
            value={createForm.notes}
            onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
          />
          {createError && <p className="text-xs text-[var(--color-danger)]">{createError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} loading={createReceivable.isPending}>Crear</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!collectModal} onClose={() => setCollectModal(null)} title="Registrar cobro" size="sm">
        {collectModal && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-muted)]">
              Deudor: <span className="text-[var(--color-text)] font-medium">{collectModal.receivable.debtor_name}</span>
              {' · '}Saldo: <span className="font-medium">{fmtCurrency(pendingAmount(collectModal.receivable.total_amount, collectModal.receivable.collected_amount), collectModal.receivable.currency)}</span>
            </p>
            <Input
              label="Monto"
              type="number"
              min="0.01"
              step="0.01"
              value={collectForm.amount}
              onChange={e => setCollectForm(f => ({ ...f, amount: e.target.value }))}
              prefix={CURRENCY_SYMBOL[collectModal.receivable.currency]}
            />
            <Select
              label="Método de pago"
              options={activePaymentMethods.map(m => ({ value: m.name, label: m.name }))}
              value={collectForm.payment_method}
              onChange={e => setCollectForm(f => ({ ...f, payment_method: e.target.value }))}
            />
            <Input
              label="Fecha"
              type="date"
              value={collectForm.date}
              onChange={e => setCollectForm(f => ({ ...f, date: e.target.value }))}
            />
            <Input
              label="Notas (opcional)"
              value={collectForm.notes}
              onChange={e => setCollectForm(f => ({ ...f, notes: e.target.value }))}
            />
            {collectError && <p className="text-xs text-[var(--color-danger)]">{collectError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setCollectModal(null)}>Cancelar</Button>
              <Button onClick={handleCollect} loading={recordCollection.isPending}>Confirmar cobro</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

const TABS = [
  { id: 'pagar', label: 'Cuentas por Pagar' },
  { id: 'cobrar', label: 'Cuentas por Cobrar' },
]

export function CuentasPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') ?? 'pagar') as 'pagar' | 'cobrar'

  function setTab(id: string) {
    setSearchParams({ tab: id })
  }

  return (
    <div className="animate-fade-in flex-1 min-h-0 flex flex-col">
      <TopBar title="Cuentas" subtitle="Por pagar y por cobrar" />

      <div className="flex-1 min-h-0 flex flex-col p-6 space-y-4">
        <div className="flex gap-1 border-b border-[var(--color-border)]">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'pagar' && <APTab />}
        {tab === 'cobrar' && <ARTab />}
      </div>
    </div>
  )
}
