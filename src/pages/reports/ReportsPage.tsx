import { useState, useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { TopBar } from '@/components/layout/TopBar'
import { Table } from '@/components/ui/Table'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useFinancialReport, useInventoryValuation, useProfitReport } from '@/hooks/useReports'
import { useCommissionsReport } from '@/hooks/useCommissionsReport'
import { useFixedCosts } from '@/hooks/useFixedCosts'
import { useProducts } from '@/hooks/useProducts'
import { useCatalogItems } from '@/hooks/useCatalogItems'
import { useCategories } from '@/hooks/useCategories'
import { supabase } from '@/lib/supabaseClient'
import type { FinancialCategoryRow, InventoryValuationRow, ProfitMonthRow } from '@/hooks/useReports'
import type { CommissionDetailRow } from '@/hooks/useCommissionsReport'
import type { Currency, ServiceRecipe, ServiceCostRow } from '@/types'
import { formatDate } from '@/lib/formatDate'

type Tab = 'financiero' | 'comisiones' | 'utilidad' | 'costos'
type CommViewMode = 'detalle' | 'quincenal'

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function getBiweeklyPeriod(dateStr: string): { key: string; label: string } {
  const date = new Date(dateStr + 'T00:00:00')
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDate()
  const isFirstHalf = day <= 15
  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}-${isFirstHalf ? '1' : '2'}`,
    label: isFirstHalf ? `1–15 ${MONTH_NAMES[month]} ${year}` : `16–fin ${MONTH_NAMES[month]} ${year}`,
  }
}

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


export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('financiero')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [currency, setCurrency] = useState<Currency | ''>('')
  const [commFrom, setCommFrom] = useState('')
  const [commTo, setCommTo] = useState('')
  const [commProfFilter, setCommProfFilter] = useState('')
  const [commViewMode, setCommViewMode] = useState<CommViewMode>('detalle')
  const [profitFrom, setProfitFrom] = useState('')
  const [profitTo, setProfitTo] = useState('')

  const { data: dolarBlue } = useQuery<{ venta: number; fechaActualizacion: string }>({
    queryKey: ['dolar-blue'],
    queryFn: async () => {
      const res = await fetch('https://dolarapi.com/v1/dolares/blue')
      if (!res.ok) throw new Error('No se pudo obtener el dólar blue')
      return res.json()
    },
    staleTime: 1000 * 60 * 30,
  })

  const financial = useFinancialReport({ from: from || undefined, to: to || undefined, currency: currency || undefined })
  const valuation = useInventoryValuation()
  const commissions = useCommissionsReport({ from: commFrom || undefined, to: commTo || undefined, usdRate: dolarBlue?.venta })
  const profit = useProfitReport({ from: profitFrom || undefined, to: profitTo || undefined, usdRate: dolarBlue?.venta })

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
    const map = new Map<string, { name: string; total: number; count: number; periods: Map<string, { label: string; amount: number }> }>()
    for (const r of (commissions.data ?? [])) {
      const { key, label } = getBiweeklyPeriod(r.date)
      const existing = map.get(r.professional_id)
      if (existing) {
        existing.total += r.commission_amount
        existing.count += 1
        const period = existing.periods.get(key)
        if (period) period.amount += r.commission_amount
        else existing.periods.set(key, { label, amount: r.commission_amount })
      } else {
        const periods = new Map<string, { label: string; amount: number }>()
        periods.set(key, { label, amount: r.commission_amount })
        map.set(r.professional_id, { name: r.professional_name, total: r.commission_amount, count: 1, periods })
      }
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({
        id,
        name: v.name,
        total: v.total,
        count: v.count,
        periods: Array.from(v.periods.entries())
          .map(([key, p]) => ({ key, label: p.label, amount: p.amount }))
          .sort((a, b) => b.key.localeCompare(a.key)),
      }))
      .sort((a, b) => b.total - a.total)
  }, [commissions.data])

  const quincenalGroups = useMemo(() => {
    const source = commProfFilter
      ? (commissions.data ?? []).filter(r => r.professional_id === commProfFilter)
      : (commissions.data ?? [])

    const map = new Map<string, {
      periodKey: string
      periodLabel: string
      byProfessional: Map<string, { name: string; count: number; total_amount: number; commission_amount: number }>
    }>()

    for (const r of source) {
      const { key, label } = getBiweeklyPeriod(r.date)
      if (!map.has(key)) map.set(key, { periodKey: key, periodLabel: label, byProfessional: new Map() })
      const period = map.get(key)!
      const existing = period.byProfessional.get(r.professional_id)
      if (existing) {
        existing.count += 1
        existing.total_amount += r.total_amount
        existing.commission_amount += r.commission_amount
      } else {
        period.byProfessional.set(r.professional_id, { name: r.professional_name, count: 1, total_amount: r.total_amount, commission_amount: r.commission_amount })
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.periodKey.localeCompare(a.periodKey))
      .map(group => ({
        ...group,
        rows: Array.from(group.byProfessional.entries())
          .map(([id, v]) => ({ id, ...v }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        periodTotal: Array.from(group.byProfessional.values()).reduce((s, v) => s + v.commission_amount, 0),
      }))
  }, [commissions.data, commProfFilter])

  const detailGroups = useMemo(() => {
    const map = new Map<string, { periodKey: string; periodLabel: string; rows: CommissionDetailRow[] }>()
    for (const r of filteredCommissions) {
      const { key, label } = getBiweeklyPeriod(r.date)
      if (!map.has(key)) map.set(key, { periodKey: key, periodLabel: label, rows: [] })
      map.get(key)!.rows.push(r)
    }
    return Array.from(map.values()).sort((a, b) => b.periodKey.localeCompare(a.periodKey))
  }, [filteredCommissions])

  const professionalOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of (commissions.data ?? [])) seen.set(r.professional_id, r.professional_name)
    return [
      { value: '', label: 'Todos los profesionales' },
      ...Array.from(seen.entries()).map(([id, name]) => ({ value: id, label: name })),
    ]
  }, [commissions.data])

  const { data: fixedCosts = [] } = useFixedCosts()
  const { data: products = [] } = useProducts()
  const { data: allCatalogItems = [] } = useCatalogItems()
  const { data: categories = [] } = useCategories()

  const { data: allRecipes = [] } = useQuery<ServiceRecipe[]>({
    queryKey: ['service-recipes-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('service_recipes').select('*')
      if (error) throw new Error(error.message)
      return data as ServiceRecipe[]
    },
  })

  const { data: txRevenue = [] } = useQuery<{ catalog_item_id: string; amount: number; currency: string }[]>({
    queryKey: ['tx-revenue-by-catalog-item'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('catalog_item_id, amount, currency')
        .eq('type', 'income')
        .not('catalog_item_id', 'is', null)
      if (error) throw new Error(error.message)
      return data as { catalog_item_id: string; amount: number; currency: string }[]
    },
  })

  const totalMonthlyFixed = useMemo(
    () => fixedCosts.filter(fc => fc.active).reduce((s, fc) => s + fc.monthly_amount, 0),
    [fixedCosts]
  )

  const costRows = useMemo<ServiceCostRow[]>(() => {
    const serviceCategory = categories.find(c => c.name.toLowerCase() === 'servicio')
    const services = serviceCategory
      ? allCatalogItems.filter(ci => ci.category_id === serviceCategory.id)
      : []

    return services.map(service => {
      const recipes = allRecipes.filter(r => r.catalog_item_id === service.id)
      const materialCost = recipes.reduce((s, r) => {
        const product = products.find(p => p.id === r.product_id)
        if (!product?.unit_size) return s
        const min = product.min_cost ?? 0
        const max = product.max_cost ?? min
        const avg = (min + max) / 2
        const costPerGram = avg / product.unit_size
        return s + r.quantity_grams * costPerGram
      }, 0)
      const txForService = txRevenue.filter(t => t.catalog_item_id === service.id)
      const usdRate = dolarBlue?.venta ?? 1
      const avgRevenue = txForService.length > 0
        ? txForService.reduce((s, t) => s + (t.currency === 'USD' ? t.amount * usdRate : t.amount), 0) / txForService.length
        : service.price ?? 0
      const salePrice = avgRevenue
      const margin = salePrice - materialCost
      const marginPct = salePrice > 0 ? (margin / salePrice) * 100 : 0
      const hasWarning = recipes.length === 0 || txForService.length === 0
      return { service, materialCost, salePrice, margin, marginPct, hasWarning }
    })
  }, [categories, allCatalogItems, allRecipes, products, txRevenue, dolarBlue])

  function marginColor(pct: number): string {
    if (pct > 30) return 'var(--color-success)'
    if (pct >= 10) return 'var(--color-warning)'
    return 'var(--color-danger)'
  }

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
          <button
            onClick={() => setActiveTab('costos')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'costos'
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Costos
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
            <div className="flex flex-wrap gap-3 items-end justify-between">
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
                {dolarBlue && (
                  <span className="text-xs text-[var(--color-muted)] self-end pb-1">
                    USD blue: ${dolarBlue.venta.toLocaleString('es-AR')}
                  </span>
                )}
              </div>
              <div className="flex gap-1 rounded-lg border border-[var(--color-border)] p-0.5 self-end">
                <button
                  onClick={() => setCommViewMode('detalle')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${commViewMode === 'detalle' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
                >
                  Detalle
                </button>
                <button
                  onClick={() => setCommViewMode('quincenal')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${commViewMode === 'quincenal' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
                >
                  Quincenal
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 items-start">
              <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Total comisiones</p>
                <p className="text-2xl font-semibold text-[var(--color-text)] mt-1">{fmtAmount(totalCommissions)}</p>
              </div>
              {commissionsByProfessional.map(p => (
                <div key={p.id} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4 min-w-[180px]">
                  <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)] mb-2">{p.name}</p>
                  <div className="flex flex-col gap-1">
                    {p.periods.map(period => (
                      <div key={period.key} className="flex items-baseline justify-between gap-3">
                        <span className="text-xs text-[var(--color-muted)] capitalize">{period.label}</span>
                        <span className="text-base font-bold tabular-nums text-[var(--color-text)]">{fmtAmount(period.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {commViewMode === 'detalle' ? (
              <section>
                <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                  {commissions.isLoading ? (
                    <div className="flex justify-center py-12">
                      <span className="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : detailGroups.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[var(--color-muted)] text-xs">Sin comisiones en el período</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border)]">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Profesional</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Fecha</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Monto servicio</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">% comisión</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Comisión</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailGroups.map(group => (
                          <>
                            <tr key={`header-${group.periodKey}`} className="border-t border-[var(--color-border)] bg-[var(--color-bg)]">
                              <td colSpan={5} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] capitalize">
                                {group.periodLabel}
                              </td>
                            </tr>
                            {group.rows.map(row => (
                              <tr key={row.transaction_id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
                                <td className="px-4 py-3 text-[var(--color-text)]">{row.professional_name}</td>
                                <td className="px-4 py-3 text-[var(--color-muted)]">{formatDate(row.date)}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{fmtAmount(row.total_amount)}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-[var(--color-muted)]">{row.commission_rate}%</td>
                                <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtAmount(row.commission_amount)}</td>
                              </tr>
                            ))}
                            <tr key={`subtotal-${group.periodKey}`} className="border-t border-[var(--color-border)] bg-[var(--color-bg)]">
                              <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] text-right">
                                Subtotal
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums font-semibold text-[var(--color-accent)]">
                                {fmtAmount(group.rows.reduce((s, r) => s + r.commission_amount, 0))}
                              </td>
                            </tr>
                          </>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            ) : (
              <section>
                <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                  {commissions.isLoading ? (
                    <div className="flex justify-center py-12">
                      <span className="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : quincenalGroups.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[var(--color-muted)] text-xs">Sin comisiones en el período</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border)]">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Período</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Profesional</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Servicios</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Monto servicios</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Comisión</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quincenalGroups.map(group => (
                          <>
                            {group.rows.map((row, i) => (
                              <tr key={`${group.periodKey}-${row.id}`} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
                                <td className="px-4 py-3 text-[var(--color-muted)] capitalize">
                                  {i === 0 ? group.periodLabel : ''}
                                </td>
                                <td className="px-4 py-3 text-[var(--color-text)]">{row.name}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-[var(--color-muted)]">{row.count}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{fmtAmount(row.total_amount)}</td>
                                <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtAmount(row.commission_amount)}</td>
                              </tr>
                            ))}
                            <tr key={`${group.periodKey}-total`} className="border-t border-[var(--color-border)] bg-[var(--color-bg)]">
                              <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] text-right">
                                Total {group.periodLabel}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums font-semibold text-[var(--color-accent)]">
                                {fmtAmount(group.periodTotal)}
                              </td>
                            </tr>
                          </>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            )}
          </>
        )}
        {activeTab === 'utilidad' && (
          <>
            <div className="flex flex-wrap gap-3 items-end justify-between">
              <div className="flex flex-wrap gap-3 items-end">
                <Input label="Desde" type="date" value={profitFrom} onChange={e => setProfitFrom(e.target.value)} className="w-40" />
                <Input label="Hasta" type="date" value={profitTo} onChange={e => setProfitTo(e.target.value)} className="w-40" />
              </div>
              {dolarBlue && (
                <span className="text-xs text-[var(--color-muted)] self-end pb-1">
                  USD blue: ${dolarBlue.venta.toLocaleString('es-AR')} · {new Date(dolarBlue.fechaActualizacion).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              )}
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
        {activeTab === 'costos' && (
          <>
            {costRows.length > 0 && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
                  <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Total insumos (catálogo)</p>
                  <p className="text-2xl font-semibold text-[var(--color-text)] mt-1">
                    {fmtAmount(costRows.reduce((s, r) => s + r.materialCost, 0))}
                  </p>
                  <p className="text-xs text-[var(--color-muted)] mt-1">suma de insumos por servicio</p>
                </div>
                <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
                  <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Gastos fijos mensuales</p>
                  <p className="text-2xl font-semibold text-[var(--color-text)] mt-1">
                    {fmtAmount(totalMonthlyFixed)}
                  </p>
                  <p className="text-xs text-[var(--color-muted)] mt-1">se resta 1 vez de la utilidad del mes</p>
                </div>
                <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
                  <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Margen promedio s/insumos</p>
                  {(() => {
                    const withPrice = costRows.filter(r => r.salePrice > 0)
                    const avg = withPrice.length > 0 ? withPrice.reduce((s, r) => s + r.marginPct, 0) / withPrice.length : 0
                    return (
                      <>
                        <p className="text-2xl font-semibold mt-1" style={{ color: marginColor(avg) }}>
                          {avg.toFixed(1)}%
                        </p>
                        {costRows.some(r => r.hasWarning) && (
                          <p className="text-xs text-[var(--color-muted)] mt-1 flex items-center gap-1">
                            <AlertTriangle size={11} style={{ color: 'var(--color-warning)' }} />
                            {costRows.filter(r => r.hasWarning).length} sin datos completos
                          </p>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
            )}
          <section>
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              {costRows.length === 0 ? (
                <p className="px-4 py-8 text-center text-[var(--color-muted)] text-xs">Sin servicios en el catálogo</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Servicio</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Costo insumos</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Precio venta</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Margen s/insumos $</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Margen %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costRows.map(row => (
                      <tr key={row.service.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
                        <td className="px-4 py-3 text-[var(--color-text)]">
                          {row.hasWarning && (
                            <AlertTriangle size={12} className="inline-block mr-1.5 mb-0.5" style={{ color: 'var(--color-warning)' }} />
                          )}
                          {row.service.name}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--color-muted)]">{fmtAmount(row.materialCost)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtAmount(row.salePrice)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: row.margin >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          {fmtAmount(row.margin)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: marginColor(row.marginPct) }}>
                          {row.marginPct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]">
                      <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Total</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtAmount(costRows.reduce((s, r) => s + r.materialCost, 0))}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtAmount(costRows.reduce((s, r) => s + r.salePrice, 0))}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtAmount(costRows.reduce((s, r) => s + r.margin, 0))}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--color-muted)]">—</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </section>
          </>
        )}
      </div>
    </div>
  )
}
