import { useState, useMemo } from 'react'
import { Trash2, Plus, ArrowRight, Pencil } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { usePaymentMethodBalances } from '@/hooks/useTransactions'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useLockedPeriods } from '@/hooks/useLockedPeriods'
import { useReserveAccounts, useCreateReserveAccount, useDeleteReserveAccount } from '@/hooks/useReserveAccounts'
import { useReserveMovements, useCreateReserveMovement, useUpdateReserveMovement } from '@/hooks/useReserveMovements'
import type { ReserveMovement } from '@/types'
import { todayLocal } from '@/lib/dateRange'
import { formatMoney } from '@/lib/money'

function fmtAmount(amount: number) {
  return formatMoney(amount)
}


export function FondosPage() {
  const { data: paymentBalances = [] } = usePaymentMethodBalances()
  const [selectedMethod, setSelectedMethod] = useState<string>('')
  const { data: reserves = [] } = useReserveAccounts()
  const { data: movements = [] } = useReserveMovements()
  const createReserve = useCreateReserveAccount()
  const deleteReserve = useDeleteReserveAccount()
  const createMovement = useCreateReserveMovement()
  const updateMovement = useUpdateReserveMovement()
  const { data: lockedPeriods = [] } = useLockedPeriods()
  const { data: paymentMethodsData = [] } = usePaymentMethods()
  const activeMethods = useMemo(() => paymentMethodsData.filter(m => m.active).map(m => m.name), [paymentMethodsData])

  const [direction, setDirection] = useState<'to_reserve' | 'to_main'>('to_reserve')
  const [selectedReserve, setSelectedReserve] = useState('')
  const [transferMethod, setTransferMethod] = useState('')

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)

  const [editing, setEditing] = useState<ReserveMovement | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [editNotice, setEditNotice] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [addingReserve, setAddingReserve] = useState(false)

  const effectiveTransferMethod = transferMethod || activeMethods[0] || ''

  const arsBalanceByMethod = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of paymentBalances) {
      const ars = b.currencies.find(c => c.currency === 'ARS')
      map.set(b.method, ars?.balance ?? 0)
    }
    return map
  }, [paymentBalances])

  const baseBalance = useMemo(() => {
    if (!selectedMethod) return [...arsBalanceByMethod.values()].reduce((s, v) => s + v, 0)
    return arsBalanceByMethod.get(selectedMethod) ?? 0
  }, [selectedMethod, arsBalanceByMethod])

  const reserveBalances = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of movements) {
      map.set(m.reserve_id, (map.get(m.reserve_id) ?? 0) + Number(m.amount))
    }
    return map
  }, [movements])

  const totalReserved = useMemo(() => {
    let sum = 0
    for (const v of reserveBalances.values()) sum += v
    return sum
  }, [reserveBalances])

  // Cada movimiento de reserva escribe su fila de pago, así que baseBalance ya
  // excluye lo reservado: restarlo de nuevo lo descontaría dos veces.
  const mainBalance = baseBalance
  const netBalance = baseBalance + totalReserved

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault()
    const parsedAmount = parseFloat(amount)
    if (!parsedAmount || parsedAmount <= 0 || !selectedReserve || !date || !effectiveTransferMethod) return
    const finalAmount = direction === 'to_reserve' ? parsedAmount : -parsedAmount
    const reserve = reserves.find(r => r.id === selectedReserve)
    if (!reserve) return
    setSubmitting(true)
    setTransferError(null)
    try {
      await createMovement.mutateAsync({ reserve_id: selectedReserve, reserve_name: reserve.name, amount: finalAmount, date, payment_method: effectiveTransferMethod, note: note || null })
      setAmount('')
      setNote('')
      setDate(todayLocal())
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSubmitting(false)
    }
  }

  function isDateLocked(value: string) {
    const d = new Date(value + 'T00:00:00')
    return lockedPeriods.some(p => p.year === d.getFullYear() && p.month === d.getMonth() + 1)
  }

  function openEdit(m: ReserveMovement) {
    setEditing(m)
    setEditAmount(String(Math.abs(m.amount)))
    setEditDate(m.date)
    setEditError(null)
    setEditNotice(null)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    const parsed = parseFloat(editAmount)
    if (!parsed || parsed <= 0) {
      setEditError('El monto debe ser mayor a cero.')
      return
    }
    if (!editDate) {
      setEditError('La fecha es obligatoria.')
      return
    }
    if (isDateLocked(editDate)) {
      setEditError('El período de la fecha nueva está cerrado. Elegí otra fecha o reabrilo en Ajustes.')
      return
    }
    setSavingEdit(true)
    setEditError(null)
    try {
      const result = await updateMovement.mutateAsync({ id: editing.id, amount: parsed, date: editDate })
      if (result.mirror_updated) {
        setEditing(null)
      } else {
        setEditNotice('Se actualizó el movimiento, pero no tiene una transacción asociada activa: revisá la lista de transacciones si esperabas verla ahí.')
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleAddReserve(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    await createReserve.mutateAsync({ name, description: newDesc.trim() || null })
    setNewName('')
    setNewDesc('')
    setAddingReserve(false)
  }

  return (
    <div className="flex flex-col min-h-0 h-full">
      <TopBar title="Fondos" subtitle="Vista de cuentas y reservas" />

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-8">

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
              Saldos actuales
            </h2>
            <select
              value={selectedMethod}
              onChange={e => setSelectedMethod(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <option value="">Todos los métodos</option>
              {paymentBalances.map(b => (
                <option key={b.method} value={b.method}>{b.method}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-3">
            <div
              className="rounded-xl border p-5 min-w-[180px]"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
            >
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Cuenta principal</p>
              <p
                className="text-2xl font-semibold"
                style={{ color: mainBalance >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}
              >
                {fmtAmount(mainBalance)}
              </p>
            </div>

            {reserves.map(r => {
              const bal = reserveBalances.get(r.id) ?? 0
              return (
                <div
                  key={r.id}
                  className="rounded-xl border p-5 min-w-[180px]"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                >
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>
                    {r.name}
                  </p>
                  <p className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
                    {fmtAmount(bal)}
                  </p>
                  {r.description && (
                    <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>{r.description}</p>
                  )}
                </div>
              )
            })}

            <div
              className="rounded-xl border p-5 min-w-[180px]"
              style={{ background: 'var(--color-accent-light)', borderColor: 'var(--color-accent)' }}
            >
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-accent)' }}>Total</p>
              <p className="text-2xl font-semibold" style={{ color: 'var(--color-accent)' }}>
                {fmtAmount(netBalance)}
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-muted)' }}>
            Registrar transfer
          </h2>
          {reserves.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Creá una reserva primero para poder registrar transferencias.
            </p>
          ) : (
            <>
            <form onSubmit={handleTransfer} className="flex flex-wrap gap-3 items-end">
              <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setDirection('to_reserve')}
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={direction === 'to_reserve'
                    ? { background: 'var(--color-accent)', color: '#fff' }
                    : { background: 'var(--color-surface)', color: 'var(--color-muted)' }
                  }
                >
                  Principal → Reserva
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('to_main')}
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={direction === 'to_main'
                    ? { background: 'var(--color-accent)', color: '#fff' }
                    : { background: 'var(--color-surface)', color: 'var(--color-muted)' }
                  }
                >
                  Reserva → Principal
                </button>
              </div>

              <select
                value={selectedReserve}
                onChange={e => setSelectedReserve(e.target.value)}
                required
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                <option value="">Reserva...</option>
                {reserves.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>

              <select
                value={effectiveTransferMethod}
                onChange={e => setTransferMethod(e.target.value)}
                required
                title={direction === 'to_reserve' ? 'Cuenta de la que sale' : 'Cuenta a la que vuelve'}
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                {activeMethods.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Monto"
                required
                min="0.01"
                step="0.01"
                className="rounded-lg border px-3 py-2 text-sm w-32"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />

              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />

              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Nota (opcional)"
                className="rounded-lg border px-3 py-2 text-sm w-48"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />

              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--color-accent)', color: '#fff' }}
              >
                <ArrowRight size={14} />
                Registrar
              </button>
            </form>
            {transferError && (
              <p className="mt-2 text-sm" style={{ color: 'var(--color-danger)' }}>{transferError}</p>
            )}
          </>
          )}
        </section>

        {movements.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-muted)' }}>
              Historial
            </h2>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Fecha</th>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Movimiento</th>
                    <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Monto</th>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Cuenta</th>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Nota</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => {
                    const reserve = reserves.find(r => r.id === m.reserve_id)
                    const reserveName = reserve?.name ?? '—'
                    const isDeposit = m.amount > 0
                    return (
                      <tr
                        key={m.id}
                        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}
                      >
                        <td className="px-4 py-3" style={{ color: 'var(--color-muted)' }}>
                          {new Date(m.date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>
                          {isDeposit ? `Principal → ${reserveName}` : `${reserveName} → Principal`}
                        </td>
                        <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--color-text)' }}>
                          {fmtAmount(Math.abs(m.amount))}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--color-muted)' }}>
                          {m.payment_method}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--color-muted)' }}>
                          {m.note ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!isDateLocked(m.date) && (
                            <button
                              type="button"
                              onClick={() => openEdit(m)}
                              title="Editar fecha y monto"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: '2px' }}
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
              Reservas
            </h2>
            <button
              onClick={() => setAddingReserve(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)', background: 'var(--color-accent-light)' }}
            >
              <Plus size={12} />
              Nueva reserva
            </button>
          </div>

          {addingReserve && (
            <form
              onSubmit={handleAddReserve}
              className="flex gap-2 items-end mb-3 p-3 rounded-xl border"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
            >
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nombre *"
                required
                autoFocus
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
              <input
                type="text"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Descripción (opcional)"
                className="rounded-lg border px-3 py-2 text-sm flex-1"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
              <button
                type="submit"
                disabled={createReserve.isPending}
                className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--color-accent)', color: '#fff' }}
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => { setAddingReserve(false); setNewName(''); setNewDesc('') }}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ color: 'var(--color-muted)' }}
              >
                Cancelar
              </button>
            </form>
          )}

          {reserves.length === 0 && !addingReserve ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              No hay reservas todavía. Creá una para empezar.
            </p>
          ) : (
            <div className="rounded-xl border overflow-hidden divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {reserves.map(r => (
                <div
                  key={r.id}
                  className="flex items-center justify-between px-4 py-3"
                  style={{ background: 'var(--color-bg)' }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{r.name}</p>
                    {r.description && (
                      <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{r.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      const bal = reserveBalances.get(r.id) ?? 0
                      if (bal !== 0) {
                        alert(`No podés eliminar "${r.name}" porque tiene saldo de ${fmtAmount(bal)}. Transferí el saldo a la cuenta principal primero.`)
                        return
                      }
                      deleteReserve.mutate(r.id)
                    }}
                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--color-danger-light)]"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar reserva">
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Fecha"
              type="date"
              value={editDate}
              onChange={e => setEditDate(e.target.value)}
            />
            <Input
              label="Monto"
              type="number"
              step="0.01"
              min="0"
              value={editAmount}
              onChange={e => setEditAmount(e.target.value)}
            />
          </div>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            La dirección del movimiento no se edita. Para cambiarla, eliminá el movimiento y cargalo de nuevo.
          </p>
          {editError && (
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{editError}</p>
          )}
          {editNotice && (
            <p className="text-sm" style={{ color: 'var(--color-warning)' }}>{editNotice}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              {editNotice ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!editNotice && (
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? 'Guardando…' : 'Guardar'}
              </Button>
            )}
          </div>
        </form>
      </Modal>
    </div>
  )
}
