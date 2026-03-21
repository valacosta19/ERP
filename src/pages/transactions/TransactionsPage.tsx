import { useState } from 'react'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Table } from '@/components/ui/Table'
import { Modal } from '@/components/ui/Modal'
import { useTransactions, useCreateTransaction, useUpdateTransaction, useDeleteTransaction } from '@/hooks/useTransactions'
import { useCategories } from '@/hooks/useCategories'
import { useProfessionals } from '@/hooks/useProfessionals'
import type { Transaction, TransactionType, PaymentMethod, PaymentInstrument, PaymentDirection } from '@/types'
import type { PaymentRow } from '@/hooks/useTransactions'

const TYPE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'income', label: 'Ingreso' },
  { value: 'expense', label: 'Gasto' },
]

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'Efectivo', label: 'Efectivo' },
  { value: 'MP', label: 'MP' },
  { value: 'PPY', label: 'PPY' },
  { value: 'Santander', label: 'Santander' },
]

const INSTRUMENT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Sin instrumento' },
  { value: 'Transferencia', label: 'Transferencia' },
  { value: 'Tarjeta', label: 'Tarjeta' },
]

const DIRECTION_OPTIONS: { value: PaymentDirection; label: string }[] = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'salida', label: 'Salida' },
]

function makeEmptyPayment(): PaymentRow {
  return { payment_method: 'Efectivo', instrument: null, amount: 0, type: 'entrada' }
}

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  type: 'income' as TransactionType,
  category_id: '',
  description: '',
  is_seña: false,
  seña_amount: '',
  payments: [makeEmptyPayment()] as PaymentRow[],
  professional_ids: [] as string[],
}

function formatAmount(type: TransactionType, amount: number) {
  const sign = type === 'income' ? '+' : '-'
  return `${sign}$${amount.toLocaleString('es-CO')}`
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function calcTotal(payments: PaymentRow[]) {
  return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
}

export function TransactionsPage() {
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const { data: transactions = [], isLoading } = useTransactions({
    type: typeFilter,
    categoryId: categoryFilter || undefined,
    from: from || undefined,
    to: to || undefined,
  })
  const { data: categories = [] } = useCategories()
  const { data: professionals = [] } = useProfessionals()
  const createTx = useCreateTransaction()
  const updateTx = useUpdateTransaction()
  const deleteTx = useDeleteTransaction()

  const filteredCategories = categories.filter(c =>
    typeFilter === 'all' ? true : c.type === typeFilter
  )

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(tx: Transaction) {
    setEditing(tx)
    setForm({
      date: tx.date,
      type: tx.type,
      category_id: tx.category_id ?? '',
      description: tx.description ?? '',
      is_seña: tx.is_seña,
      seña_amount: tx.seña_amount != null ? String(tx.seña_amount) : '',
      payments: tx.payments && tx.payments.length > 0
        ? tx.payments.map(p => ({ payment_method: p.payment_method, instrument: p.instrument, amount: p.amount, type: p.type }))
        : [makeEmptyPayment()],
      professional_ids: tx.professionals?.map(h => h.id) ?? [],
    })
    setFormError('')
    setModalOpen(true)
  }

  function addPaymentRow() {
    setForm(f => ({ ...f, payments: [...f.payments, makeEmptyPayment()] }))
  }

  function removePaymentRow(index: number) {
    setForm(f => ({ ...f, payments: f.payments.filter((_, i) => i !== index) }))
  }

  function updatePaymentRow(index: number, patch: Partial<PaymentRow>) {
    setForm(f => ({
      ...f,
      payments: f.payments.map((p, i) => i === index ? { ...p, ...patch } : p),
    }))
  }

  function toggleProfessional(id: string) {
    setForm(f => ({
      ...f,
      professional_ids: f.professional_ids.includes(id)
        ? f.professional_ids.filter(hid => hid !== id)
        : [...f.professional_ids, id],
    }))
  }

  async function handleSubmit() {
    const total = calcTotal(form.payments)
    if (!form.date || !form.type || total <= 0) {
      setFormError('Fecha, tipo y al menos un pago con monto son obligatorios.')
      return
    }

    if (editing) {
      await updateTx.mutateAsync({
        id: editing.id,
        date: form.date,
        type: form.type,
        amount: total,
        category_id: form.category_id || null,
        description: form.description || null,
        is_seña: form.is_seña,
        seña_amount: form.is_seña ? total : (form.seña_amount ? parseFloat(form.seña_amount) : null),
      })
    } else {
      await createTx.mutateAsync({
        date: form.date,
        type: form.type,
        category_id: form.category_id || null,
        description: form.description || null,
        is_seña: form.is_seña,
        seña_amount: form.is_seña ? total : (form.seña_amount ? parseFloat(form.seña_amount) : null),
        payments: form.payments.map(p => ({
          ...p,
          instrument: p.instrument || null,
          amount: Number(p.amount),
        })),
        professional_ids: form.professional_ids,
      })
    }
    setModalOpen(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta transacción?')) return
    await deleteTx.mutateAsync(id)
  }

  const categoryOptions = [
    { value: '', label: 'Sin categoría' },
    ...filteredCategories.map(c => ({ value: c.id, label: c.name })),
  ]

  const allCategoryOptions = [
    { value: '', label: 'Todas las categorías' },
    ...categories.map(c => ({ value: c.id, label: c.name })),
  ]

  const activeProfessionals = professionals.filter(h => h.active)

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
          {tx.is_seña && <Badge variant="warning">Seña</Badge>}
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
      key: 'type',
      header: 'Tipo',
      render: (tx: Transaction) => (
        <Badge variant={tx.type === 'income' ? 'success' : 'danger'}>
          {tx.type === 'income' ? 'Ingreso' : 'Gasto'}
        </Badge>
      ),
    },
    {
      key: 'amount',
      header: 'Monto',
      className: 'text-right',
      render: (tx: Transaction) => (
        <span className={`font-semibold tabular-nums ${tx.type === 'income' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
          {formatAmount(tx.type, tx.amount)}
        </span>
      ),
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
            <Pencil size={14} />
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
    <div className="animate-fade-in">
      <TopBar
        title="Transacciones"
        subtitle={`${transactions.length} registros`}
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus size={14} />
            Nueva transacción
          </Button>
        }
      />

      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-3">
          <Select
            options={TYPE_OPTIONS}
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

        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
          <Table
            columns={columns}
            data={transactions}
            keyField="id"
            loading={isLoading}
            emptyMessage="No hay transacciones para los filtros seleccionados"
          />
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar transacción' : 'Nueva transacción'}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Fecha"
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
            <Select
              label="Tipo"
              options={[
                { value: 'income', label: 'Ingreso' },
                { value: 'expense', label: 'Gasto' },
              ]}
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as TransactionType, category_id: '' }))}
            />
          </div>

          <Select
            label="Categoría"
            options={categoryOptions}
            value={form.category_id}
            onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
            placeholder="Sin categoría"
          />

          <Input
            label="Descripción"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Opcional"
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[var(--color-text)]">Métodos de pago</span>
              <button
                type="button"
                onClick={addPaymentRow}
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                + Agregar fila
              </button>
            </div>
            <div className="space-y-2">
              {form.payments.map((p, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Select
                      options={PAYMENT_METHOD_OPTIONS}
                      value={p.payment_method}
                      onChange={e => updatePaymentRow(i, { payment_method: e.target.value as PaymentMethod })}
                    />
                  </div>
                  <div className="flex-1">
                    <Select
                      options={INSTRUMENT_OPTIONS}
                      value={p.instrument ?? ''}
                      onChange={e => updatePaymentRow(i, { instrument: (e.target.value as PaymentInstrument) || null })}
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={p.amount === 0 ? '' : String(p.amount)}
                      onChange={e => updatePaymentRow(i, { amount: parseFloat(e.target.value) || 0 })}
                      placeholder="Monto"
                      prefix="$"
                    />
                  </div>
                  <div className="w-24">
                    <Select
                      options={DIRECTION_OPTIONS}
                      value={p.type}
                      onChange={e => updatePaymentRow(i, { type: e.target.value as PaymentDirection })}
                    />
                  </div>
                  {form.payments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePaymentRow(i)}
                      className="p-1.5 mb-0.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 text-right text-sm font-semibold text-[var(--color-text)]">
              Total: ${calcTotal(form.payments).toLocaleString('es-CO')}
            </div>
          </div>

          {activeProfessionals.length > 0 && (
            <div>
              <span className="text-sm font-medium text-[var(--color-text)] block mb-2">Profesionales</span>
              <div className="flex flex-wrap gap-2">
                {activeProfessionals.map(hd => (
                  <button
                    key={hd.id}
                    type="button"
                    onClick={() => toggleProfessional(hd.id)}
                    className={`px-3 py-1 rounded-lg text-sm border transition-colors ${
                      form.professional_ids.includes(hd.id)
                        ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                        : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-accent)]'
                    }`}
                  >
                    {hd.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_seña}
                onChange={e => setForm(f => ({ ...f, is_seña: e.target.checked, seña_amount: '' }))}
                className="w-4 h-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
              />
              <span className="text-sm text-[var(--color-text)]">Es una seña</span>
            </label>
            {!form.is_seña && (
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.seña_amount}
                onChange={e => setForm(f => ({ ...f, seña_amount: e.target.value }))}
                placeholder="Seña cobrada previamente"
                prefix="$"
                className="w-40"
              />
            )}
          </div>

          {formError && <p className="text-xs text-[var(--color-danger)]">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              loading={createTx.isPending || updateTx.isPending}
            >
              {editing ? 'Guardar cambios' : 'Crear transacción'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
