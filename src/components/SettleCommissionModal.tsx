import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useStaffReceivables, useSettleCommissionPayout } from '@/hooks/useStaffReceivables'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useTransactionCategories } from '@/hooks/useTransactionCategories'
import { formatDate } from '@/lib/formatDate'

interface Props {
  open: boolean
  onClose: () => void
  hairdresserId: string
  hairdresserName: string
  periodStart: string
  periodEnd: string
  grossAmount: number
  alreadySettled: number
}

function fmt(amount: number) {
  return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function SettleCommissionModal({
  open, onClose, hairdresserId, hairdresserName, periodStart, periodEnd, grossAmount, alreadySettled,
}: Props) {
  const receivablesQuery = useStaffReceivables()
  const paymentMethodsQuery = usePaymentMethods()
  const categoriesQuery = useTransactionCategories()
  const settle = useSettleCommissionPayout()

  const allPending = useMemo(
    () => (receivablesQuery.data ?? [])
      .filter(r => r.hairdresser_id === hairdresserId && (r.total_amount - r.collected_amount) > 0.001),
    [receivablesQuery.data, hairdresserId],
  )
  const pending = useMemo(
    () => allPending
      .filter(r => r.currency === 'ARS')
      .map(r => ({ ...r, remaining: r.total_amount - r.collected_amount })),
    [allPending],
  )
  const foreignPending = allPending.filter(r => r.currency !== 'ARS')

  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null)
  const [clientUuid] = useState(() => crypto.randomUUID())
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [installmentAmount, setInstallmentAmount] = useState(() => Math.max(0, grossAmount - alreadySettled).toFixed(2))
  const [subcategoryId, setSubcategoryId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const activePaymentMethods = useMemo(
    () => (paymentMethodsQuery.data ?? []).filter(m => m.active),
    [paymentMethodsQuery.data],
  )
  const expenseSubcategories = useMemo(
    () => (categoriesQuery.data ?? [])
      .filter(c => c.parent_id != null && c.transaction_type === 'expense')
      .map(c => ({ value: c.id, label: c.name })),
    [categoriesQuery.data],
  )
  const remainingAmount = Math.max(0, grossAmount - alreadySettled)
  const defaultCommissionCategoryId = useMemo(
    () => (categoriesQuery.data ?? []).find(c =>
      c.parent_id != null
      && c.transaction_type === 'expense'
      && c.name.toLocaleLowerCase('es-AR').includes('comisi'),
    )?.id ?? '',
    [categoriesQuery.data],
  )
  const effectivePaymentMethod = paymentMethod || activePaymentMethods[0]?.name || ''
  const effectiveSubcategoryId = subcategoryId || defaultCommissionCategoryId

  const offset = useMemo(
    () => pending
      .filter(r => selectedIds === null || selectedIds.has(r.id))
      .reduce((s, r) => s + r.remaining, 0),
    [pending, selectedIds],
  )

  const installment = Number(installmentAmount) || 0
  const net = Math.max(0, installment - offset)

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev ?? pending.map(r => r.id))
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    setError(null)
    if (installment <= 0) return setError('Ingresá un importe a liquidar mayor que cero.')
    if (installment > remainingAmount + 0.001) return setError(`El importe no puede superar el saldo pendiente (${fmt(remainingAmount)}).`)
    if (!effectivePaymentMethod) return setError('Seleccioná un método de pago.')
    if (!paymentDate) return setError('Seleccioná una fecha de pago.')
    if (offset > installment + 0.001) return setError('Los retiros seleccionados superan el importe de esta liquidación. Reducí el importe aplicado desmarcando retiros o aumentá el pago.')
    if (net > 0 && !effectiveSubcategoryId) return setError('Seleccioná una categoría de gasto para el pago neto.')

    try {
      await settle.mutateAsync({
        client_uuid: clientUuid,
        hairdresser_id: hairdresserId,
        period_start: periodStart,
        period_end: periodEnd,
        installment_amount: installment,
        receivable_ids: selectedIds === null ? pending.map(r => r.id) : Array.from(selectedIds),
        payment_method: effectivePaymentMethod,
        payment_date: paymentDate,
        subcategory_id: effectiveSubcategoryId || null,
        notes: notes.trim() || null,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al liquidar')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Liquidar comisión — ${hairdresserName}`} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="bg-[var(--color-bg)] rounded-lg p-3">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Bruta</p>
            <p className="text-lg font-semibold tabular-nums">{fmt(grossAmount)}</p>
          </div>
          <div className="bg-[var(--color-bg)] rounded-lg p-3">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Ya liquidado</p>
            <p className="text-lg font-semibold tabular-nums">{fmt(alreadySettled)}</p>
          </div>
          <div className="bg-[var(--color-bg)] rounded-lg p-3">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Saldo pendiente</p>
            <p className="text-lg font-semibold tabular-nums text-[var(--color-accent)]">{fmt(remainingAmount)}</p>
          </div>
        </div>

        <Input
          label="Importe a liquidar"
          type="number"
          min="0.01"
          max={remainingAmount}
          step="0.01"
          value={installmentAmount}
          onChange={e => setInstallmentAmount(e.target.value)}
          prefix="$"
        />

        <div>
          <h4 className="text-sm font-semibold text-[var(--color-text)] mb-2">Retiros pendientes</h4>
          {foreignPending.length > 0 && (
            <p className="text-xs text-[var(--color-warning)] mb-2">
              {foreignPending.length} retiro(s) en moneda extranjera no se pueden descontar de una comisión en ARS sin una cotización persistida.
            </p>
          )}
          {pending.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)] py-3">No hay retiros pendientes en ARS para este empleado.</p>
          ) : (
            <div className="border border-[var(--color-border)] rounded-lg overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-bg)] sticky top-0">
                  <tr>
                    <th className="w-10 px-2 py-2"></th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Fecha</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Concepto</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map(r => (
                    <tr key={r.id} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds === null || selectedIds.has(r.id)}
                          onChange={() => toggle(r.id)}
                        />
                      </td>
                      <td className="px-3 py-2 text-[var(--color-muted)]">{formatDate(r.created_at.slice(0, 10))}</td>
                      <td className="px-3 py-2 text-[var(--color-text)]">{r.concept}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(r.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-[var(--color-bg)] rounded-lg p-3">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Retiros aplicados</p>
            <p className="text-base font-semibold tabular-nums text-[var(--color-danger)]">−{fmt(offset)}</p>
          </div>
          <div className="bg-[var(--color-bg)] rounded-lg p-3">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Neto a pagar ahora</p>
            <p className="text-base font-semibold tabular-nums text-[var(--color-success)]">{fmt(net)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Método de pago"
            options={activePaymentMethods.map(m => ({ value: m.name, label: m.name }))}
            value={effectivePaymentMethod}
            onChange={e => setPaymentMethod(e.target.value)}
            placeholder="Seleccionar..."
          />
          <Input
            label="Fecha de pago"
            type="date"
            value={paymentDate}
            onChange={e => setPaymentDate(e.target.value)}
          />
        </div>

        <Select
          label={net > 0 ? 'Categoría de gasto *' : 'Categoría de gasto'}
          options={expenseSubcategories}
          value={effectiveSubcategoryId}
          onChange={e => setSubcategoryId(e.target.value)}
          placeholder="Sin categoría"
        />

        <Input
          label="Notas"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Opcional"
        />

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={settle.isPending}>
            Confirmar liquidación
          </Button>
        </div>
      </div>
    </Modal>
  )
}
