import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Table } from '@/components/ui/Table'
import { Modal } from '@/components/ui/Modal'
import { useTransactions, useCreateTransaction, useUpdateTransaction, useDeleteTransaction } from '@/hooks/useTransactions'
import { useCategories } from '@/hooks/useCategories'
import type { Transaction, TransactionType } from '@/types'

const TYPE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'income', label: 'Ingreso' },
  { value: 'expense', label: 'Gasto' },
]

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  type: 'income' as TransactionType,
  amount: '',
  category_id: '',
  description: '',
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
      amount: String(tx.amount),
      category_id: tx.category_id ?? '',
      description: tx.description ?? '',
    })
    setFormError('')
    setModalOpen(true)
  }

  async function handleSubmit() {
    const amount = parseFloat(form.amount)
    if (!form.date || !form.type || isNaN(amount) || amount <= 0) {
      setFormError('Fecha, tipo y monto son obligatorios.')
      return
    }

    const payload = {
      date: form.date,
      type: form.type,
      amount,
      category_id: form.category_id || null,
      description: form.description || null,
    }

    if (editing) {
      await updateTx.mutateAsync({ id: editing.id, ...payload })
    } else {
      await createTx.mutateAsync(payload)
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
        <span className="text-[var(--color-text)]">{tx.description || '—'}</span>
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
          <Input
            label="Monto"
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            prefix="$"
          />
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
