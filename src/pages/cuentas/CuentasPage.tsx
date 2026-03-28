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
import type { SupplierDebt, Receivable } from '@/types'

function fmtCurrency(amount: number) {
  return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function pendingAmount(total: number, paid: number) {
  return Math.max(0, total - paid)
}

function debtStatus(debt: SupplierDebt): 'paid' | 'overdue' | 'open' {
  const pending = pendingAmount(debt.total_amount, debt.paid_amount)
  if (pending <= 0) return 'paid'
  if (debt.due_date && debt.due_date < today()) return 'overdue'
  return 'open'
}

function receivableStatus(r: Receivable): 'collected' | 'overdue' | 'open' {
  const pending = pendingAmount(r.total_amount, r.collected_amount)
  if (pending <= 0) return 'collected'
  if (r.due_date && r.due_date < today()) return 'overdue'
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
  const [payModal, setPayModal] = useState<{ debt: SupplierDebt } | null>(null)
  const [payForm, setPayForm] = useState({ amount: '', payment_method: '', date: today(), notes: '' })
  const [payError, setPayError] = useState('')

  const activePaymentMethods = paymentMethods.filter(m => m.active)

  function openPayModal(debt: SupplierDebt) {
    setPayForm({
      amount: String(pendingAmount(debt.total_amount, debt.paid_amount)),
      payment_method: activePaymentMethods[0]?.name ?? '',
      date: today(),
      notes: '',
    })
    setPayError('')
    setPayModal({ debt })
  }

  async function handlePay() {
    if (!payModal) return
    const amount = parseFloat(payForm.amount)
    if (!amount || amount <= 0) { setPayError('Ingresá un monto válido.'); return }
    if (!payForm.payment_method) { setPayError('Seleccioná un método de pago.'); return }
    const maxPending = pendingAmount(payModal.debt.total_amount, payModal.debt.paid_amount)
    if (amount > maxPending + 0.001) { setPayError(`El monto no puede superar el saldo pendiente (${fmtCurrency(maxPending)}).`); return }

    await recordPayment.mutateAsync({
      debt_id: payModal.debt.id,
      amount,
      payment_method: payForm.payment_method,
      date: payForm.date,
      transaction_id: null,
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

function ARTab() {
  const { data: receivables = [], isLoading } = useReceivables()
  const { data: paymentMethods = [] } = usePaymentMethods()
  const createReceivable = useCreateReceivable()
  const recordCollection = useRecordReceivableCollection()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ debtor_name: '', concept: '', total_amount: '', due_date: '', notes: '' })
  const [createError, setCreateError] = useState('')

  const [collectModal, setCollectModal] = useState<{ receivable: Receivable } | null>(null)
  const [collectForm, setCollectForm] = useState({ amount: '', payment_method: '', date: today(), notes: '' })
  const [collectError, setCollectError] = useState('')

  const activePaymentMethods = paymentMethods.filter(m => m.active)

  function openCreate() {
    setCreateForm({ debtor_name: '', concept: '', total_amount: '', due_date: '', notes: '' })
    setCreateError('')
    setCreateOpen(true)
  }

  async function handleCreate() {
    if (!createForm.debtor_name.trim()) { setCreateError('El deudor es obligatorio.'); return }
    if (!createForm.concept.trim()) { setCreateError('El concepto es obligatorio.'); return }
    const amount = parseFloat(createForm.total_amount)
    if (!amount || amount <= 0) { setCreateError('Ingresá un monto válido.'); return }
    await createReceivable.mutateAsync({
      debtor_name: createForm.debtor_name.trim(),
      concept: createForm.concept.trim(),
      total_amount: amount,
      due_date: createForm.due_date || null,
      notes: createForm.notes || null,
    })
    setCreateOpen(false)
  }

  function openCollectModal(r: Receivable) {
    setCollectForm({
      amount: String(pendingAmount(r.total_amount, r.collected_amount)),
      payment_method: activePaymentMethods[0]?.name ?? '',
      date: today(),
      notes: '',
    })
    setCollectError('')
    setCollectModal({ receivable: r })
  }

  async function handleCollect() {
    if (!collectModal) return
    const amount = parseFloat(collectForm.amount)
    if (!amount || amount <= 0) { setCollectError('Ingresá un monto válido.'); return }
    if (!collectForm.payment_method) { setCollectError('Seleccioná un método de pago.'); return }
    const maxPending = pendingAmount(collectModal.receivable.total_amount, collectModal.receivable.collected_amount)
    if (amount > maxPending + 0.001) { setCollectError(`El monto no puede superar el saldo (${fmtCurrency(maxPending)}).`); return }

    await recordCollection.mutateAsync({
      receivable_id: collectModal.receivable.id,
      amount,
      payment_method: collectForm.payment_method,
      date: collectForm.date,
      transaction_id: null,
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
          <td className="px-3 py-3 text-sm tabular-nums text-[var(--color-text)]">{fmtCurrency(r.total_amount)}</td>
          <td className="px-3 py-3 text-sm tabular-nums font-semibold text-[var(--color-text)]">{fmtCurrency(pending)}</td>
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
                        <td className="py-1 text-right tabular-nums text-[var(--color-text)]">{fmtCurrency(c.amount)}</td>
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
            placeholder="Seña, préstamo, etc."
            value={createForm.concept}
            onChange={e => setCreateForm(f => ({ ...f, concept: e.target.value }))}
          />
          <Input
            label="Monto total"
            type="number"
            min="0.01"
            step="0.01"
            value={createForm.total_amount}
            onChange={e => setCreateForm(f => ({ ...f, total_amount: e.target.value }))}
            prefix="$"
          />
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
              {' · '}Saldo: <span className="font-medium">{fmtCurrency(pendingAmount(collectModal.receivable.total_amount, collectModal.receivable.collected_amount))}</span>
            </p>
            <Input
              label="Monto"
              type="number"
              min="0.01"
              step="0.01"
              value={collectForm.amount}
              onChange={e => setCollectForm(f => ({ ...f, amount: e.target.value }))}
              prefix="$"
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
