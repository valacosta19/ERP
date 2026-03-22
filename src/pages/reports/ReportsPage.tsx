import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Table } from '@/components/ui/Table'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useFinancialReport, useInventoryValuation } from '@/hooks/useReports'
import { useCommissionsReport } from '@/hooks/useCommissionsReport'
import type { FinancialCategoryRow, InventoryValuationRow } from '@/hooks/useReports'
import type { CommissionRow } from '@/hooks/useCommissionsReport'
import type { Currency } from '@/types'

type Tab = 'financiero' | 'comisiones'

const CURRENCY_OPTIONS = [
  { value: '', label: 'Todas las monedas' },
  { value: 'ARS', label: 'ARS' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
]

const CURRENCY_SYMBOL: Record<string, string> = { ARS: '$', USD: 'U$D', EUR: '€' }

function fmtAmount(amount: number, currency?: string) {
  const sym = currency ? (CURRENCY_SYMBOL[currency] ?? '$') : '$'
  return `${sym}${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const financialColumns = [
  { key: 'category_name', header: 'Categoría' },
  {
    key: 'income',
    header: 'Ingresos',
    className: 'text-right',
    render: (r: FinancialCategoryRow) => (
      <span className="text-[var(--color-success)]">{r.income > 0 ? fmtAmount(r.income) : '—'}</span>
    ),
  },
  {
    key: 'expense',
    header: 'Gastos',
    className: 'text-right',
    render: (r: FinancialCategoryRow) => (
      <span className="text-[var(--color-danger)]">{r.expense > 0 ? fmtAmount(r.expense) : '—'}</span>
    ),
  },
  {
    key: 'balance',
    header: 'Balance',
    className: 'text-right font-semibold',
    render: (r: FinancialCategoryRow) => (
      <span className={r.balance >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}>
        {fmtAmount(r.balance)}
      </span>
    ),
  },
]

const valuationColumns = [
  { key: 'product_name', header: 'Producto' },
  {
    key: 'total_units',
    header: 'Unidades en stock',
    render: (r: InventoryValuationRow) => r.total_units.toFixed(2),
    className: 'text-right',
  },
  {
    key: 'total_value',
    header: 'Valor total',
    render: (r: InventoryValuationRow) => fmtAmount(r.total_value),
    className: 'text-right',
  },
]

const commissionColumns = [
  { key: 'professional_name', header: 'Profesional' },
  {
    key: 'transaction_count',
    header: 'Transacciones',
    render: (r: CommissionRow) => r.transaction_count,
    className: 'text-right',
  },
  {
    key: 'total_amount',
    header: 'Total facturado',
    render: (r: CommissionRow) => fmtAmount(r.total_amount),
    className: 'text-right',
  },
  {
    key: 'effective_rate',
    header: 'Tasa efectiva',
    render: (r: CommissionRow) => `${(r.effective_rate * 100).toFixed(1)}%`,
    className: 'text-right',
  },
  {
    key: 'commission_amount',
    header: 'Comisión',
    render: (r: CommissionRow) => fmtAmount(r.commission_amount),
    className: 'text-right font-semibold',
  },
]

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('financiero')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [currency, setCurrency] = useState<Currency | ''>('')
  const [commFrom, setCommFrom] = useState('')
  const [commTo, setCommTo] = useState('')

  const financial = useFinancialReport({ from: from || undefined, to: to || undefined, currency: currency || undefined })
  const valuation = useInventoryValuation()
  const commissions = useCommissionsReport({ from: commFrom || undefined, to: commTo || undefined })

  const { summary } = financial.data ?? { summary: { total_income: 0, total_expense: 0, balance: 0 } }
  const totalInventoryValue = valuation.data?.reduce((s, r) => s + r.total_value, 0) ?? 0
  const totalCommissions = commissions.data?.reduce((s, r) => s + r.commission_amount, 0) ?? 0

  return (
    <div className="animate-fade-in flex-1 min-h-0 flex flex-col">
      <TopBar title="Reportes" />
      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        <div className="flex gap-1 border-b border-[var(--color-border)]">
          <button
            onClick={() => setActiveTab('financiero')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'financiero'
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Financiero
          </button>
          <button
            onClick={() => setActiveTab('comisiones')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'comisiones'
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Comisiones
          </button>
        </div>

        {activeTab === 'financiero' && (
          <>
            <div className="flex flex-wrap gap-3 items-end">
              <Input label="Desde" type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
              <Input label="Hasta" type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
              <Select
                label="Moneda"
                options={CURRENCY_OPTIONS}
                value={currency}
                onChange={e => setCurrency(e.target.value as Currency | '')}
                className="w-40"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Ingresos totales</p>
                <p className="text-2xl font-semibold text-[var(--color-success)] mt-1">{fmtAmount(summary.total_income)}</p>
              </div>
              <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Gastos totales</p>
                <p className="text-2xl font-semibold text-[var(--color-danger)] mt-1">{fmtAmount(summary.total_expense)}</p>
              </div>
              <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Balance neto</p>
                <p className={`text-2xl font-semibold mt-1 ${summary.balance >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                  {fmtAmount(summary.balance)}
                </p>
              </div>
            </div>

            <section>
              <h2 className="text-base font-semibold text-[var(--color-text)] mb-3">Por categoría</h2>
              <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                <Table<FinancialCategoryRow>
                  columns={financialColumns}
                  data={financial.data?.categories ?? []}
                  keyField="category_name"
                  loading={financial.isLoading}
                  emptyMessage="Sin transacciones en el período"
                />
              </div>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[var(--color-text)] mb-3">Valorización de inventario</h2>
              <div className="flex items-center gap-4 mb-3">
                <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
                  <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Valor de inventario</p>
                  <p className="text-2xl font-semibold text-[var(--color-text)] mt-1">{fmtAmount(totalInventoryValue)}</p>
                </div>
              </div>
              <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                <Table<InventoryValuationRow>
                  columns={valuationColumns}
                  data={valuation.data ?? []}
                  keyField="product_id"
                  loading={valuation.isLoading}
                  emptyMessage="Sin lotes en inventario"
                />
              </div>
            </section>
          </>
        )}

        {activeTab === 'comisiones' && (
          <>
            <div className="flex flex-wrap gap-3 items-end">
              <Input label="Desde" type="date" value={commFrom} onChange={e => setCommFrom(e.target.value)} className="w-40" />
              <Input label="Hasta" type="date" value={commTo} onChange={e => setCommTo(e.target.value)} className="w-40" />
            </div>

            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4 w-fit">
              <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Total comisiones</p>
              <p className="text-2xl font-semibold text-[var(--color-text)] mt-1">{fmtAmount(totalCommissions)}</p>
            </div>

            <section>
              <h2 className="text-base font-semibold text-[var(--color-text)] mb-3">Comisiones por profesional</h2>
              <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                <Table<CommissionRow>
                  columns={commissionColumns}
                  data={commissions.data ?? []}
                  keyField="professional_id"
                  loading={commissions.isLoading}
                  emptyMessage="Sin transacciones con profesionales en el período"
                />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
