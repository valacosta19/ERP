import { useMemo, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Check } from 'lucide-react'
import { Select } from '@/components/ui/Select'
import { useFixedCosts, useAllFixedCostRates } from '@/hooks/useFixedCosts'
import { useExpenseBenchmarks, useCategoryBenchmarkKeys } from '@/hooks/useExpenseBenchmarks'
import { useProfitReport } from '@/hooks/useReports'
import { formatLocalDate } from '@/lib/dateRange'
import { formatMoney } from '@/lib/money'
import {
  monthsInRange,
  buildExpenseShareRows,
  fixedCostConcepts,
  sumByBenchmarkKey,
  buildBenchmarkRows,
  buildIncomeAllocation,
  type ExpenseShareRow,
  type BenchmarkRow,
} from '@/lib/expenseShare'

// Paleta categórica validada para 4 sectores adyacentes en superficie clara
// (CVD ΔE 9.2 · visión normal ΔE 16.3). "Otros" usa el neutro de la app, que
// no compite por identidad. No agregar un quinto tono sin revalidar.
const SLICE_COLORS = ['#2a78d6', '#eb6834', '#4a3aa7']
const OTHER_COLOR = '#6B7280'
const REST_COLOR = '#1baf7a'
const NAMED_SLICES = 3

const WINDOW_OPTIONS = [
  { value: '3', label: 'Últimos 3 meses' },
  { value: '6', label: 'Últimos 6 meses' },
  { value: '12', label: 'Últimos 12 meses' },
]

function windowRange(monthCount: number) {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1)
  return { from: formatLocalDate(from), to: formatLocalDate(now) }
}

function trendColor(row: ExpenseShareRow) {
  if (row.flagged) return 'var(--color-danger)'
  if (row.trend === 'up') return 'var(--color-warning)'
  if (row.trend === 'down') return 'var(--color-success)'
  return 'var(--color-muted)'
}

function TrendCell({ row }: { row: ExpenseShareRow }) {
  if (row.deltaPp === null) return <span className="text-[var(--color-muted)]">—</span>
  const Icon = row.trend === 'up' ? TrendingUp : row.trend === 'down' ? TrendingDown : Minus
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums" style={{ color: trendColor(row) }}>
      <Icon size={13} />
      {row.deltaPp > 0 ? '+' : ''}{row.deltaPp.toFixed(1)} pp
      {row.flagged && <AlertTriangle size={12} />}
    </span>
  )
}

function DetailRow({ row, maxPct }: { row: ExpenseShareRow; maxPct: number }) {
  const fill = row.currentPct !== null && maxPct > 0 ? Math.min(100, (row.currentPct / maxPct) * 100) : 0
  return (
    <tr
      className="border-t border-[var(--color-border)]"
      style={row.flagged ? { background: 'var(--color-danger-light)' } : undefined}
    >
      <td className="px-4 py-3 text-[var(--color-text)]">{row.name}</td>
      <td className="px-4 py-3 text-right tabular-nums text-[var(--color-text)] whitespace-nowrap">
        {formatMoney(row.total)}
      </td>
      <td className="px-4 py-3 w-[34%]">
        <div className="flex items-center gap-3">
          <span className="tabular-nums text-[var(--color-text)] w-14 text-right shrink-0">
            {row.currentPct === null ? '—' : `${row.currentPct.toFixed(1)}%`}
          </span>
          <span className="h-1.5 flex-1 rounded-full bg-[var(--color-border)] overflow-hidden">
            <span
              className="block h-full rounded-full"
              style={{ width: `${fill}%`, background: trendColor(row) }}
            />
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <TrendCell row={row} />
      </td>
    </tr>
  )
}

function BlockHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <tr className="bg-[var(--color-bg)]">
      <td colSpan={4} className="px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">{title}</span>
        <span className="text-xs text-[var(--color-muted)] ml-2">{hint}</span>
      </td>
    </tr>
  )
}

function SubtotalRow({ label, total, pct }: { label: string; total: number; pct: number | null }) {
  return (
    <tr className="border-t border-[var(--color-border)] bg-[var(--color-bg)]">
      <td className="px-4 py-3 font-semibold text-[var(--color-text)]">{label}</td>
      <td className="px-4 py-3 text-right tabular-nums font-semibold text-[var(--color-text)] whitespace-nowrap">
        {formatMoney(total)}
      </td>
      <td className="px-4 py-3 tabular-nums font-semibold text-[var(--color-text)]">
        <span className="inline-block w-14 text-right">{pct === null ? '—' : `${pct.toFixed(1)}%`}</span>
      </td>
      <td />
    </tr>
  )
}

function BenchmarkVerdictCell({ row }: { row: BenchmarkRow }) {
  if (row.verdict === 'unknown') {
    return <span className="text-xs text-[var(--color-muted)]">sin gastos asignados</span>
  }
  if (row.verdict === 'above') {
    return (
      <span className="inline-flex items-center gap-1.5 tabular-nums" style={{ color: 'var(--color-danger)' }}>
        <AlertTriangle size={13} />
        +{row.overByPp!.toFixed(1)} pp sobre el máximo
      </span>
    )
  }
  if (row.verdict === 'below') {
    return (
      <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--color-muted)' }}>
        <TrendingDown size={13} />
        por debajo del rango
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--color-success)' }}>
      <Check size={13} />
      en rango
    </span>
  )
}

export function ExpenseShareSection({ usdRate }: { usdRate?: number }) {
  const [windowMonths, setWindowMonths] = useState('6')
  const range = useMemo(() => windowRange(Number(windowMonths)), [windowMonths])

  const profit = useProfitReport({ from: range.from, to: range.to, usdRate })
  const { data: fixedCosts = [] } = useFixedCosts()
  const { data: rates = [] } = useAllFixedCostRates()
  const { data: benchmarks = [] } = useExpenseBenchmarks()
  const { data: categoryBenchmarkKeys = {} } = useCategoryBenchmarkKeys()

  const months = useMemo(() => monthsInRange(range.from, range.to), [range])

  const incomeByMonth = useMemo(() => {
    const out: Record<string, number> = {}
    for (const row of profit.data?.rows ?? []) {
      out[row.month] = row.product_revenue + row.service_income
    }
    return out
  }, [profit.data])

  const totalIncome = useMemo(
    () => months.reduce((sum, m) => sum + (incomeByMonth[m.month] ?? 0), 0),
    [months, incomeByMonth],
  )

  const budgetConcepts = useMemo(
    () => fixedCostConcepts({ months, fixedCosts, rates }),
    [months, fixedCosts, rates],
  )

  const realConcepts = useMemo(
    () =>
      (profit.data?.operating_by_category ?? []).map(c => ({
        id: c.subcategory_id ?? 'sin-categoria',
        name: c.category_name,
        benchmarkKey: c.subcategory_id ? (categoryBenchmarkKeys[c.subcategory_id] ?? null) : null,
        byMonth: c.byMonth,
      })),
    [profit.data, categoryBenchmarkKeys],
  )

  const budgetRows = useMemo(
    () => buildExpenseShareRows({ months, incomeByMonth, concepts: budgetConcepts }).filter(r => r.total > 0),
    [months, incomeByMonth, budgetConcepts],
  )

  const realRows = useMemo(
    () => buildExpenseShareRows({ months, incomeByMonth, concepts: realConcepts }).filter(r => r.total > 0),
    [months, incomeByMonth, realConcepts],
  )

  const benchmarkRows = useMemo(
    () =>
      buildBenchmarkRows({
        totalIncome,
        benchmarks,
        realByKey: sumByBenchmarkKey(realConcepts, months),
        budgetByKey: sumByBenchmarkKey(budgetConcepts, months),
      }),
    [totalIncome, benchmarks, realConcepts, budgetConcepts, months],
  )

  // Los sectores son los gastos fijos con nombre propio (Alquiler, Agua, …), que
  // es lo que se quiere reconocer de un vistazo. Son montos configurados, no
  // transacciones: el resto de los ingresos NO es la utilidad, porque los costos
  // variables y los gastos reales no entran acá.
  const allocation = useMemo(() => {
    const { slices, profit: rest, profitPct: restPct, isLoss } = buildIncomeAllocation({
      totalIncome,
      costs: budgetRows.map(r => ({ key: r.id, label: r.name, value: r.total })),
    })

    const named = slices.filter(s => s.key !== '__profit__')
    const head = named.slice(0, NAMED_SLICES)
    const tail = named.slice(NAMED_SLICES)
    const otherValue = tail.reduce((s, x) => s + x.value, 0)

    const display = [
      ...head.map((s, i) => ({ ...s, color: SLICE_COLORS[i] })),
      ...(otherValue > 0
        ? [{
            key: '__other__',
            label: `Otros gastos fijos (${tail.length})`,
            value: otherValue,
            pct: totalIncome > 0 ? (otherValue / totalIncome) * 100 : 0,
            color: OTHER_COLOR,
          }]
        : []),
      ...(rest > 0
        ? [{ key: '__rest__', label: 'Resto de los ingresos', value: rest, pct: restPct, color: REST_COLOR }]
        : []),
    ]

    return { display, rest, isLoss }
  }, [budgetRows, totalIncome])

  const maxDetailPct = useMemo(
    () => Math.max(0, ...[...budgetRows, ...realRows].map(r => r.currentPct ?? 0)),
    [budgetRows, realRows],
  )

  const usableMonths = months.filter(m => (incomeByMonth[m.month] ?? 0) > 0).length
  const flaggedCount = [...budgetRows, ...realRows].filter(r => r.flagged).length
  const budgetSubtotal = budgetRows.reduce((s, r) => s + r.total, 0)
  const realSubtotal = realRows.reduce((s, r) => s + r.total, 0)
  const pctOfIncome = (value: number) => (totalIncome > 0 ? (value / totalIncome) * 100 : null)

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text)]">Peso sobre los ingresos</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5 max-w-2xl">
Cuánto de tus ingresos se lleva cada gasto fijo. Montos configurados, no transacciones: el resto de los ingresos no es la utilidad. Vista informativa: no afecta la Utilidad Neta.
          </p>
        </div>
        <Select
          options={WINDOW_OPTIONS}
          value={windowMonths}
          onChange={e => setWindowMonths(e.target.value)}
          className="w-44"
        />
      </div>

      {profit.isLoading ? (
        <div className="flex justify-center py-12">
          <span className="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : profit.isError ? (
        <div
          className="rounded-lg border px-4 py-6 text-sm"
          style={{ borderColor: 'var(--color-danger)', background: 'var(--color-danger-light)', color: 'var(--color-danger)' }}
        >
          <p className="font-semibold flex items-center gap-2">
            <AlertTriangle size={15} />
            No se pudo calcular el peso de los gastos.
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">{profit.error.message}</p>
        </div>
      ) : usableMonths === 0 ? (
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-4 py-8 text-center text-xs text-[var(--color-muted)]">
          Sin ingresos registrados en la ventana seleccionada.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="relative w-full md:w-64 h-64 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocation.display}
                      dataKey="value"
                      nameKey="label"
                      innerRadius="62%"
                      outerRadius="100%"
                      paddingAngle={2}
                      stroke="var(--color-surface)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    >
                      {allocation.display.map(slice => (
                        <Cell key={slice.key} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => {
                        const amount = Number(value)
                        const pct = totalIncome > 0 ? ((amount / totalIncome) * 100).toFixed(1) : '0'
                        return [`${formatMoney(amount)} · ${pct}%`, String(name)]
                      }}
                      contentStyle={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Ingresos</span>
                  <span className="text-lg font-bold tabular-nums text-[var(--color-text)]">
                    {formatMoney(totalIncome)}
                  </span>
                  <span className="text-xs text-[var(--color-muted)]">
                    {usableMonths} {usableMonths === 1 ? 'mes' : 'meses'}
                  </span>
                </div>
              </div>

              <ul className="flex-1 flex flex-col divide-y divide-[var(--color-border)]">
                {allocation.display.map(slice => (
                  <li key={slice.key} className="flex items-center gap-3 py-2">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: slice.color }} />
                    <span className="text-sm text-[var(--color-text)] flex-1 min-w-0 truncate">{slice.label}</span>
                    <span className="text-sm tabular-nums text-[var(--color-muted)] whitespace-nowrap">
                      {formatMoney(slice.value)}
                    </span>
                    <span className="text-sm tabular-nums font-semibold text-[var(--color-text)] w-14 text-right">
                      {slice.pct.toFixed(1)}%
                    </span>
                  </li>
                ))}
                {allocation.isLoss && (
                  <li className="flex items-center gap-2 py-2 text-sm" style={{ color: 'var(--color-danger)' }}>
                    <AlertTriangle size={14} />
                    Los gastos fijos superaron los ingresos en {formatMoney(Math.abs(allocation.rest))}.
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    Rubro
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    Real
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    Presupuestado
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    Recomendado
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    Veredicto
                  </th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-xs text-[var(--color-muted)]">
                      Sin rubros de referencia cargados.
                    </td>
                  </tr>
                ) : (
                  benchmarkRows.map(row => (
                    <tr
                      key={row.key}
                      className="border-t border-[var(--color-border)]"
                      style={row.verdict === 'above' ? { background: 'var(--color-danger-light)' } : undefined}
                    >
                      <td className="px-4 py-3">
                        <span className="text-[var(--color-text)]">{row.label}</span>
                        {row.description && (
                          <span className="block text-xs text-[var(--color-muted)]">{row.description}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--color-text)]">
                        {row.realPct === null ? '—' : `${row.realPct.toFixed(1)}%`}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--color-muted)]">
                        {row.budgetTotal > 0 && row.budgetPct !== null ? `${row.budgetPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--color-muted)] whitespace-nowrap">
                        {row.minPct.toFixed(0)}–{row.maxPct.toFixed(0)}%
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <BenchmarkVerdictCell row={row} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-[var(--color-muted)] border-t border-[var(--color-border)]">
              El veredicto se calcula sobre los gastos reales. Los rangos son referencias del rubro peluquería,
              editables en Ajustes → Costos; el rubro de cada gasto también se asigna ahí.
            </p>
          </div>

          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    Concepto
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    Monto ventana
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    % último mes
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    vs. promedio
                  </th>
                </tr>
              </thead>
              <tbody>
                <BlockHeader title="Gastos fijos" hint="montos configurados" />
                {budgetRows.length === 0 ? (
                  <tr className="border-t border-[var(--color-border)]">
                    <td colSpan={4} className="px-4 py-6 text-center text-xs text-[var(--color-muted)]">
                      Sin gastos fijos activos con monto vigente en la ventana.
                    </td>
                  </tr>
                ) : (
                  <>
                    {budgetRows.map(row => (
                      <DetailRow key={row.id} row={row} maxPct={maxDetailPct} />
                    ))}
                    <SubtotalRow label="Subtotal fijos" total={budgetSubtotal} pct={pctOfIncome(budgetSubtotal)} />
                  </>
                )}

                <BlockHeader title="Gastos reales" hint="transacciones de gasto operativo" />
                {realRows.length === 0 ? (
                  <tr className="border-t border-[var(--color-border)]">
                    <td colSpan={4} className="px-4 py-6 text-center text-xs text-[var(--color-muted)]">
                      Sin gastos operativos registrados en la ventana.
                    </td>
                  </tr>
                ) : (
                  <>
                    {realRows.map(row => (
                      <DetailRow key={row.id} row={row} maxPct={maxDetailPct} />
                    ))}
                    <SubtotalRow label="Subtotal reales" total={realSubtotal} pct={pctOfIncome(realSubtotal)} />
                  </>
                )}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-[var(--color-muted)] border-t border-[var(--color-border)]">
              {usableMonths < 2
                ? 'Hace falta más de un mes con ingresos para comparar contra el promedio.'
                : flaggedCount > 0
                  ? `${flaggedCount} ${flaggedCount === 1 ? 'concepto subió' : 'conceptos subieron'} 2 pp o más sobre su propio promedio.`
                  : 'Ningún concepto se desvió más de 2 pp de su propio promedio.'}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
