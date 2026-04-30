import { useEffect, useMemo, useState } from 'react'
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
}

function fmt(amount: number) {
  return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function SettleCommissionModal({
  open, onClose, hairdresserId, hairdresserName, periodStart, periodEnd, grossAmount,
}: Props) {
  const { data: receivables = [] } = useStaffReceivables()
  const { data: paymentMethods = [] } = usePaymentMethods()
  const { data: categories = [] } = useTransactionCategories()
  const settle = useSettleCommissionPayout()

  const pending = useMemo(
    () => receivables
      .filter(r => r.hairdresser_id === hairdresserId && (r.total_amount - r.collected_amount) > 0.001)
      .map(r => ({ ...r, remaining: r.total_amount - r.collected_amount })),
    [receivables, hairdresserId],
  )

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [subcategoryId, setSubcategoryId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const activePaymentMethods = paymentMethods.filter(m => m.active)
  const expenseSubcategories = useMemo(
    () => categories
      .filter(c => c.parent_id != null && c.transaction_type === 'expense')
      .map(c => ({ value: c.id, label: c.name })),
    [categories],
  )

  useEffect(() => {
    if (!open) return
    setSelectedIds(new Set(pending.map(r => r.id)))
    setPaymentMethod(activePaymentMethods[0]?.name ?? '')
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setSubcategoryId('')
    setNotes('')
    setError(null)
  }, [open, hairdresserId])

  const offset = useMemo(
    () => pending.filter(r => selectedIds.has(r.id)).reduce((s, r) => s + r.remaining, 0),
    [pending, selectedIds],
  )

  const net = Math.max(0, grossAmount - offset)

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    setError(null)
    if (net > 0 && !paymentMethod) return setError('Seleccioná un método de pago para el neto.')
    if (offset > grossAmount + 0.001) return setError('Los retiros seleccionados superan la comisión bruta. Reducí la selección o liquidalos en otro período.')

    try {
      await settle.mutateAsync({
        hairdresser_id: hairdresserId,
        period_start: periodStart,
        period_end: periodEnd,
        gross_amount: grossAmount,
        receivable_ids: Array.from(selectedIds),
        net_amount: net,
        payment_method: paymentMethod || 'Efectivo',
        payment_date: paymentDate,
        subcategory_id: subcategoryId || null,
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
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-[var(--color-bg)] rounded-lg p-3">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Bruta</p>
            <p className="text-lg font-semibold tabular-nums">{fmt(grossAmount)}</p>
          </div>
          <div className="bg-[var(--color-bg)] rounded-lg p-3">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Retiros aplicados</p>
            <p className="text-lg font-semibold tabular-nums text-[var(--color-danger)]">−{fmt(offset)}</p>
          </div>
          <div className="bg-[var(--color-bg)] rounded-lg p-3">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Neto a pagar</p>
            <p className="text-lg font-semibold tabular-nums text-[var(--color-success)]">{fmt(net)}</p>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-[var(--color-text)] mb-2">Retiros pendientes</h4>
          {pending.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)] py-3">No hay retiros pendientes para este empleado.</p>
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
                          checked={selectedIds.has(r.id)}
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

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Método de pago (neto)"
            options={activePaymentMethods.map(m => ({ value: m.name, label: m.name }))}
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value)}
            placeholder="Seleccionar..."
            disabled={net <= 0}
          />
          <Input
            label="Fecha de pago"
            type="date"
            value={paymentDate}
            onChange={e => setPaymentDate(e.target.value)}
          />
        </div>

        <Select
          label="Categoría de gasto"
          options={expenseSubcategories}
          value={subcategoryId}
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
