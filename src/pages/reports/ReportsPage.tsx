import { useState, useMemo } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Table } from '@/components/ui/Table'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useFinancialReport, useInventoryValuation, useProfitReport } from '@/hooks/useReports'
import { useCommissionsReport } from '@/hooks/useCommissionsReport'
import type { FinancialCategoryRow, InventoryValuationRow, ProfitMonthRow } from '@/hooks/useReports'
import type { CommissionDetailRow } from '@/hooks/useCommissionsReport'
import type { Currency } from '@/types'
import { formatDate } from '@/lib/formatDate'

type Tab = 'financiero' | 'comisiones' | 'utilidad'

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
    render: (r: InventoryValuationRow) => r.total_units,
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
    key: 'date',
    header: 'Fecha',
    render: (r: CommissionDetailRow) => (
      <span className="text-[var(--color-muted)]">{formatDate(r.date)}</span>
    ),
  },
  {
    key: 'total_amount',
    header: 'Monto servicio',
    render: (r: CommissionDetailRow) => fmtAmount(r.total_amount),
    className: 'text-right',
  },
  {
    key: 'commission_rate',
    header: '% comisión',
    render: (r: CommissionDetailRow) => `${r.commission_rate}%`,
    className: 'text-right',
  },
  {
    key: 'commission_amount',
    header: 'Comisión',
    render: (r: CommissionDetailRow) => fmtAmount(r.commission_amount),
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
  const [commProfFilter, setCommProfFilter] = useState('')
  const [profitFrom, setProfitFrom] = useState('')
  const [profitTo, setProfitTo] = useState('')

  const financial = useFinancialReport({ from: from || undefined, to: to || undefined, currency: currency || undefined })
  const valuation = useInventoryValuation()
  const commissions = useCommissionsReport({ from: commFrom || undefined, to: commTo || undefined })
  const profit = useProfitReport({ from: profitFrom || undefined, to: profitTo || undefined })

  const { summary } = financial.data ?? { summary: { total_income: 0, total_expense: 0, balance: 0 } }
  const totalInventoryValue = valuation.data?.reduce((s, r) => s + r.total_value, 0) ?? 0

  const filteredCommissions = useMemo(() => {
    if (!commissions.data) return []
    const rows = commProfFilter
      ? commissions.data.filter(r => r.professional_id === commProfFilter)
      : [...commissions.data]
    return rows.sort((a, b) => b.date.localeCompare(a.date))
  }, [commissions.data, commProfFilter])

  const totalCommissions = filteredCommissions.reduce((s, r) => s + r.commission_amount, 0)

  const commissionsByProfessional = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>()
    for (const r of (commissions.data ?? [])) {
      const existing = map.get(r.professional_id)
      if (existing) {
        existing.total += r.commission_amount
        existing.count += 1
      } else {
        map.set(r.professional_id, { name: r.professional_name, total: r.commission_amount, count: 1 })
      }
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [commissions.data])

  const professionalOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of (commissions.data ?? [])) seen.set(r.professional_id, r.professional_name)
    return [
      { value: '', label: 'Todos los profesionales' },
      ...Array.from(seen.entries()).map(([id, name]) => ({ value: id, label: name })),
    ]
  }, [commissions.data])

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
          <button
            onClick={() => setActiveTab('utilidad')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'utilidad'
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Utilidad
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
                  pageSize={500}
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
                  pageSize={500}
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
              <Select
                label="Profesional"
                options={professionalOptions}
                value={commProfFilter}
                onChange={e => setCommProfFilter(e.target.value)}
                className="w-52"
              />
            </div>

            <div className="flex flex-wrap gap-4 items-start">
              <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Total comisiones</p>
                <p className="text-2xl font-semibold text-[var(--color-text)] mt-1">{fmtAmount(totalCommissions)}</p>
              </div>
              {commissionsByProfessional.map(p => (
                <div key={p.id} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
                  <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">{p.name}</p>
                  <p className="text-2xl font-semibold text-[var(--color-text)] mt-1">{fmtAmount(p.total)}</p>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">{p.count} {p.count === 1 ? 'servicio' : 'servicios'}</p>
                </div>
              ))}
            </div>

            <section>
              <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                <Table<CommissionDetailRow>
                  columns={commissionColumns}
                  data={filteredCommissions}
                  keyField="transaction_id"
                  loading={commissions.isLoading}
                  emptyMessage="Sin comisiones en el período"
                  pageSize={500}
                />
              </div>
            </section>
          </>
        )}
        {activeTab === 'utilidad' && (
          <>
            <div className="flex flex-wrap gap-3 items-end">
              <Input label="Desde" type="date" value={profitFrom} onChange={e => setProfitFrom(e.target.value)} className="w-40" />
              <Input label="Hasta" type="date" value={profitTo} onChange={e => setProfitTo(e.target.value)} className="w-40" />
            </div>

            {profit.isLoading ? (
              <div className="flex justify-center py-12">
                <span className="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
                    <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Utilidad productos</p>
                    <p className={`text-2xl font-semibold mt-1 ${(profit.data?.totals.product_profit ?? 0) >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                      {fmtAmount(profit.data?.totals.product_profit ?? 0)}
                    </p>
                    <p className="text-xs text-[var(--color-muted)] mt-1">
                      Rev. {fmtAmount(profit.data?.totals.product_revenue ?? 0)} · COGS -{fmtAmount(profit.data?.totals.product_cogs ?? 0)}
                    </p>
                  </div>
                  <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
                    <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Utilidad servicios</p>
                    <p className={`text-2xl font-semibold mt-1 ${(profit.data?.totals.service_income ?? 0) >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                      {fmtAmount(profit.data?.totals.service_income ?? 0)}
                    </p>
                  </div>
                  <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
                    <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Utilidad total negocio</p>
                    <p className={`text-2xl font-semibold mt-1 ${(profit.data?.totals.total_profit ?? 0) >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                      {fmtAmount(profit.data?.totals.total_profit ?? 0)}
                    </p>
                    <p className="text-xs text-[var(--color-muted)] mt-1">
                      Gastos -{fmtAmount(profit.data?.totals.total_expenses ?? 0)}
                    </p>
                  </div>
                </div>

                <section>
                  <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border)]">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Mes</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Utilidad productos</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Utilidad servicios</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Gastos</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profit.data?.rows ?? []).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-muted)] text-xs">Sin datos en el período</td>
                          </tr>
                        ) : (
                          <>
                            {(profit.data?.rows ?? []).map((row: ProfitMonthRow) => (
                              <tr key={row.month} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
                                <td className="px-4 py-3 font-medium text-[var(--color-text)] capitalize">{row.month_label}</td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                  <span className={row.product_profit >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}>
                                    {fmtAmount(row.product_profit)}
                                  </span>
                                  <span className="block text-xs text-[var(--color-muted)]">rev {fmtAmount(row.product_revenue)} · cogs -{fmtAmount(row.product_cogs)}</span>
                                </td>
                                <td className={`px-4 py-3 text-right tabular-nums ${row.service_income >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                                  {fmtAmount(row.service_income)}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-[var(--color-danger)]">
                                  -{fmtAmount(row.total_expenses)}
                                </td>
                                <td className={`px-4 py-3 text-right tabular-nums font-semibold ${row.total_profit >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                                  {fmtAmount(row.total_profit)}
                                </td>
                              </tr>
                            ))}
                            <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]">
                              <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Total</td>
                              <td className={`px-4 py-3 text-right tabular-nums font-semibold ${(profit.data?.totals.product_profit ?? 0) >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                                {fmtAmount(profit.data?.totals.product_profit ?? 0)}
                              </td>
                              <td className={`px-4 py-3 text-right tabular-nums font-semibold ${(profit.data?.totals.service_income ?? 0) >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                                {fmtAmount(profit.data?.totals.service_income ?? 0)}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums font-semibold text-[var(--color-danger)]">
                                -{fmtAmount(profit.data?.totals.total_expenses ?? 0)}
                              </td>
                              <td className={`px-4 py-3 text-right tabular-nums font-semibold ${(profit.data?.totals.total_profit ?? 0) >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                                {fmtAmount(profit.data?.totals.total_profit ?? 0)}
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
