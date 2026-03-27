import { useState, useMemo } from 'react'
import { Trash2, Plus, ArrowRight } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { useFinancialReport } from '@/hooks/useReports'
import { useReserveAccounts, useCreateReserveAccount, useDeleteReserveAccount } from '@/hooks/useReserveAccounts'
import { useReserveMovements, useCreateReserveMovement } from '@/hooks/useReserveMovements'

function fmtAmount(amount: number) {
  return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function FondosPage() {
  const financial = useFinancialReport()
  const { data: reserves = [] } = useReserveAccounts()
  const { data: movements = [] } = useReserveMovements()
  const createReserve = useCreateReserveAccount()
  const deleteReserve = useDeleteReserveAccount()
  const createMovement = useCreateReserveMovement()

  const [direction, setDirection] = useState<'to_reserve' | 'to_main'>('to_reserve')
  const [selectedReserve, setSelectedReserve] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [addingReserve, setAddingReserve] = useState(false)

  const { summary } = financial.data ?? { summary: { total_income: 0, total_expense: 0, balance: 0 } }

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

  const netBalance = summary.total_income - summary.total_expense
  const mainBalance = netBalance - totalReserved

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault()
    const parsedAmount = parseFloat(amount)
    if (!parsedAmount || parsedAmount <= 0 || !selectedReserve || !date) return
    const finalAmount = direction === 'to_reserve' ? parsedAmount : -parsedAmount
    setSubmitting(true)
    try {
      await createMovement.mutateAsync({ reserve_id: selectedReserve, amount: finalAmount, date, note: note || null })
      setAmount('')
      setNote('')
      setDate(today())
    } finally {
      setSubmitting(false)
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
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-muted)' }}>
            Saldos actuales
          </h2>
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
                    <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Nota</th>
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
                          {m.note ?? '—'}
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
                    onClick={() => deleteReserve.mutate(r.id)}
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
    </div>
  )
}
