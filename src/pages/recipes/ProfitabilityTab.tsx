import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useDolarBlue } from '@/hooks/useDolarBlue'
import { useFixedCosts, useAllFixedCostRates } from '@/hooks/useFixedCosts'
import { useProfessionals } from '@/hooks/useProfessionals'
import { useProfitReport } from '@/hooks/useReports'
import { useServiceSalesDetail } from '@/hooks/useServiceSalesDetail'
import { useTransactionRecipeCosts } from '@/hooks/useTransactionRecipeCosts'
import { useUpdateCatalogItem } from '@/hooks/useCatalogItems'
import { confirmDialog } from '@/lib/confirm'
import { monthRange, previousMonthsRange, todayLocal } from '@/lib/dateRange'
import { formatMoney } from '@/lib/money'
import { marginColor } from '@/lib/profitability'
import {
  buildServiceSales,
  fixedCostsForMonth,
  monthResult,
  priceRaiseSuggestion,
  raisedPrice,
  sumSales,
  summarizeByProfessional,
  summarizeByService,
  type SalesSummary,
} from '@/lib/realProfitability'
import { SIZE_LABELS, type ServiceFamily } from '@/lib/serviceFamilies'
import type { CatalogItem, Product, ServiceRecipe } from '@/types'

const PROJECTION_MONTHS = 3

function fmtPct(value: number) {
  return `${value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

function fmtNum(value: number, digits = 1) {
  return value.toLocaleString('es-AR', { maximumFractionDigits: digits })
}

function monthLabel(ym: string) {
  const [year, month] = ym.split('-').map(Number)
  const label = new Date(year, month - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function shortMonth(ym: string) {
  const [year, month] = ym.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
}

function raisePatch(item: CatalogItem, pct: number) {
  return {
    id: item.id,
    price: raisedPrice(item.price, pct),
    ...(item.price_transfer != null ? { price_transfer: raisedPrice(item.price_transfer, pct) } : {}),
    ...(item.price_card != null ? { price_card: raisedPrice(item.price_card, pct) } : {}),
  }
}

interface ServiceRow {
  item: CatalogItem
  family: string
  sizeLabel: string
  summary: SalesSummary | null
  perMonth: number
  suggested: number | null
}

interface ProfitabilityTabProps {
  families: ServiceFamily[]
  recipes: ServiceRecipe[]
  productById: Map<string, Product>
}

export function ProfitabilityTab({ families, recipes, productById }: ProfitabilityTabProps) {
  const currentMonth = todayLocal().slice(0, 7)
  const [month, setMonth] = useState(currentMonth)
  const [objectiveInput, setObjectiveInput] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const objective = Math.max(0, parseFloat(objectiveInput) || 0)
  const range = useMemo(() => monthRange(month), [month])
  const prevRange = useMemo(() => previousMonthsRange(month, PROJECTION_MONTHS), [month])
  const isCurrentMonth = month === currentMonth

  const dolarBlue = useDolarBlue()
  const usdRate = dolarBlue.data?.venta
  const { data: monthRows = [] } = useServiceSalesDetail(range.from, range.to)
  const { data: prevRows = [] } = useServiceSalesDetail(prevRange.from, prevRange.to)
  const { data: snapshots = [] } = useTransactionRecipeCosts()
  const profit = useProfitReport({ from: prevRange.from, to: range.to, usdRate })
  const { data: fixedCosts = [] } = useFixedCosts()
  const { data: rates = [] } = useAllFixedCostRates()
  const { data: professionals = [] } = useProfessionals()
  const updateCatalogItem = useUpdateCatalogItem()

  const monthSales = useMemo(
    () => (usdRate == null ? [] : buildServiceSales(monthRows, snapshots, recipes, productById, usdRate)),
    [monthRows, snapshots, recipes, productById, usdRate],
  )
  const prevSales = useMemo(
    () => (usdRate == null ? [] : buildServiceSales(prevRows, snapshots, recipes, productById, usdRate)),
    [prevRows, snapshots, recipes, productById, usdRate],
  )
  const monthTotals = useMemo(() => sumSales(monthSales), [monthSales])
  const prevTotals = useMemo(() => sumSales(prevSales), [prevSales])
  const byProfessional = useMemo(() => summarizeByProfessional(monthSales, professionals), [monthSales, professionals])
  const prevByService = useMemo(() => summarizeByService(prevSales), [prevSales])
  const fixed = useMemo(() => fixedCostsForMonth(fixedCosts, rates, month), [fixedCosts, rates, month])

  const productMargin = useMemo(() => {
    const prevFrom = prevRange.from.slice(0, 7)
    const prevTo = prevRange.to.slice(0, 7)
    let current = 0
    let previous = 0
    for (const row of profit.data?.rows ?? []) {
      if (row.month === month) current = row.product_profit
      else if (row.month >= prevFrom && row.month <= prevTo) previous += row.product_profit
    }
    return { current, previous }
  }, [profit.data, month, prevRange])

  const real = monthResult({ serviceMargin: monthTotals.margin, productMargin: productMargin.current, fixed, objective })
  const projected = monthResult({
    serviceMargin: prevTotals.margin / PROJECTION_MONTHS,
    productMargin: productMargin.previous / PROJECTION_MONTHS,
    fixed,
    objective,
  })
  const hasHistory = prevTotals.count > 0 || productMargin.previous !== 0

  const suggestion = useMemo(() => {
    const candidates = families.flatMap(family =>
      family.columns.map(col => {
        const s = prevByService.get(col.item.id)
        return {
          serviceId: col.item.id,
          perMonth: s ? s.count / PROJECTION_MONTHS : 0,
          avgRevenue: s ? s.revenue / s.count : 0,
          avgRate: s && s.revenue > 0 ? (s.commission / s.revenue) * 100 : 0,
          marginPct: s && s.revenue > 0 ? (s.margin / s.revenue) * 100 : 0,
        }
      }),
    )
    return priceRaiseSuggestion(candidates, projected.gap)
  }, [families, prevByService, projected.gap])

  const rows = useMemo<ServiceRow[]>(() => {
    const suggestedIds = new Set(suggestion?.serviceIds ?? [])
    return families.flatMap(family =>
      family.columns.map(col => {
        const summary = prevByService.get(col.item.id) ?? null
        return {
          item: col.item,
          family: family.family,
          sizeLabel: col.size === 'unico' ? '' : SIZE_LABELS[col.size],
          summary,
          perMonth: summary ? summary.count / PROJECTION_MONTHS : 0,
          suggested: suggestion && suggestedIds.has(col.item.id) ? raisedPrice(col.item.price, suggestion.pct) : null,
        }
      }),
    )
  }, [families, prevByService, suggestion])
  const suggestedRows = rows.filter(r => r.suggested != null)

  const serviceNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const family of families) for (const col of family.columns) map.set(col.item.id, col.item.name)
    return map
  }, [families])

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function applyOne(row: ServiceRow) {
    if (row.suggested == null || !suggestion) return
    const ok = await confirmDialog({
      title: 'Aplicar suba de precio',
      message: `Subir ${fmtNum(suggestion.pct)}% los precios de "${row.item.name}": efectivo de ${formatMoney(row.item.price)} a ${formatMoney(row.suggested)}. Transferencia y tarjeta suben en la misma proporción.`,
      confirmLabel: 'Aplicar',
    })
    if (!ok) return
    await updateCatalogItem.mutateAsync(raisePatch(row.item, suggestion.pct))
  }

  async function applyAll() {
    if (!suggestion || suggestedRows.length === 0) return
    const ok = await confirmDialog({
      title: 'Aplicar suba a todos los sugeridos',
      message: `Subir ${fmtNum(suggestion.pct)}% los precios de ${suggestedRows.length} ${suggestedRows.length === 1 ? 'servicio' : 'servicios'} (efectivo, transferencia y tarjeta).`,
      confirmLabel: 'Aplicar a todos',
    })
    if (!ok) return
    for (const row of suggestedRows) {
      await updateCatalogItem.mutateAsync(raisePatch(row.item, suggestion.pct))
    }
  }

  const objectiveLabel = objective > 0 ? ' y la ganancia objetivo' : ''
  const realTarget = fixed + objective
  const realProgress = realTarget > 0 ? Math.max(0, Math.min(100, (real.gross / realTarget) * 100)) : 100

  return (
    <div className="space-y-6">
      <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Mes</p>
            <input
              type="month"
              value={month}
              max={currentMonth}
              onChange={e => e.target.value && setMonth(e.target.value)}
              aria-label="Mes"
              className="px-2 py-1.5 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] tabular-nums"
            />
            <p className="text-xs text-[var(--color-muted)] mt-1">
              {isCurrentMonth ? 'Mes en curso: lo real es hasta hoy, los fijos son del mes completo' : 'Mes cerrado'}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Ganancia objetivo por mes</p>
            <div className="relative inline-block">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted)]">$</span>
              <input
                type="number"
                min="0"
                step="1000"
                value={objectiveInput}
                onChange={e => setObjectiveInput(e.target.value)}
                placeholder="0"
                aria-label="Ganancia objetivo por mes"
                className="w-36 pl-5 pr-2 py-1.5 text-sm text-right rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] tabular-nums"
              />
            </div>
            <p className="text-xs text-[var(--color-muted)] mt-1">Por encima de cubrir los fijos. En 0 mide el punto de equilibrio</p>
          </div>
        </div>
        {usdRate == null && (
          <p className="mt-4 text-xs flex items-center gap-1.5" style={{ color: dolarBlue.isError ? 'var(--color-danger)' : 'var(--color-muted)' }}>
            <AlertTriangle size={12} />
            {dolarBlue.isError ? 'Cotización USD no disponible: la rentabilidad no se calcula sin ella.' : 'Obteniendo cotización USD…'}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
          <header className="px-5 py-3 border-b border-[var(--color-border)]">
            <h3 className="text-sm font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
              {monthLabel(month)}
            </h3>
            <p className="text-xs text-[var(--color-muted)]">
              {isCurrentMonth ? 'Real hasta hoy' : 'Real del mes'} · {monthTotals.count} {monthTotals.count === 1 ? 'servicio' : 'servicios'}
            </p>
          </header>
          <Ledger
            lines={[
              { label: 'Ingresos por servicios', value: monthTotals.revenue },
              { label: 'Insumos', value: monthTotals.materials, sign: '−' },
              { label: 'Comisiones devengadas', value: monthTotals.commission, sign: '−' },
              { label: 'Margen de servicios', value: monthTotals.margin, kind: 'sub' },
              { label: 'Margen de productos', value: productMargin.current, sign: '+' },
              { label: 'Margen bruto', value: real.gross, kind: 'sub' },
              { label: 'Fijos del mes', value: fixed, sign: '−' },
              ...(objective > 0 ? [{ label: 'Ganancia objetivo', value: objective, sign: '−' as const }] : []),
              { label: 'Resultado', value: real.net, kind: 'total' },
            ]}
          />
          <div className="px-5 pb-5">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-sm font-semibold" style={{ color: real.gap === 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {real.gap === 0 ? `Rentable: ya cubriste los fijos${objectiveLabel}` : `Faltan ${formatMoney(real.gap)} para cubrir los fijos${objectiveLabel}`}
              </p>
              <span className="text-xs text-[var(--color-muted)] tabular-nums">{fmtNum(realProgress, 0)}%</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full overflow-hidden bg-[var(--color-border)]" aria-hidden="true">
              <div className="h-full rounded-full transition-[width]" style={{ width: `${realProgress}%`, background: real.gap === 0 ? 'var(--color-success)' : 'var(--color-accent)' }} />
            </div>
          </div>
        </section>

        <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
          <header className="px-5 py-3 border-b border-[var(--color-border)]">
            <h3 className="text-sm font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
              Proyección
            </h3>
            <p className="text-xs text-[var(--color-muted)]">
              Promedio mensual de {shortMonth(prevRange.from.slice(0, 7))} a {shortMonth(prevRange.to.slice(0, 7))} · {fmtNum(prevTotals.count / PROJECTION_MONTHS)} servicios/mes
            </p>
          </header>
          <Ledger
            lines={[
              { label: 'Margen de servicios promedio', value: prevTotals.margin / PROJECTION_MONTHS },
              { label: 'Margen de productos promedio', value: productMargin.previous / PROJECTION_MONTHS, sign: '+' },
              { label: 'Margen bruto estimado', value: projected.gross, kind: 'sub' },
              { label: 'Fijos del mes', value: fixed, sign: '−' },
              ...(objective > 0 ? [{ label: 'Ganancia objetivo', value: objective, sign: '−' as const }] : []),
              { label: 'Resultado estimado', value: projected.net, kind: 'total' },
            ]}
          />
          <div className="px-5 pb-5">
            <p className="text-sm font-semibold" style={{ color: !hasHistory ? 'var(--color-muted)' : projected.gap === 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
              {!hasHistory
                ? 'Sin ventas en los meses anteriores para proyectar'
                : projected.gap === 0
                  ? `Se estima rentable: con lo que se suele vender se cubren los fijos${objectiveLabel}`
                  : `No se estima rentable: faltan ${formatMoney(projected.gap)} por mes`}
            </p>
          </div>
        </section>
      </div>

      <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <header className="px-5 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
            Por profesional
          </h3>
          <p className="text-xs text-[var(--color-muted)]">Servicios hechos y comisión devengada en {monthLabel(month).toLowerCase()}</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="w-8 px-2 py-2" />
                <Th align="left">Profesional</Th>
                <Th>Servicios</Th>
                <Th>Ingreso</Th>
                <Th>Comisión</Th>
                <Th>% s/ ingreso</Th>
              </tr>
            </thead>
            <tbody>
              {byProfessional.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-xs text-[var(--color-muted)]">Sin servicios registrados en el mes</td>
                </tr>
              )}
              {byProfessional.map(p => {
                const isOpen = expanded.has(p.id)
                return (
                  <FragmentRows key={p.id}>
                    <tr className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(p.id)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? `Contraer ${p.name}` : `Ver servicios de ${p.name}`}
                          className="p-1 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
                        >
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-[var(--color-text)]">{p.name}</td>
                      <Td>{p.count}</Td>
                      <Td muted>{formatMoney(p.revenue)}</Td>
                      <Td>{formatMoney(p.commission)}</Td>
                      <Td muted>{fmtPct(p.revenue > 0 ? (p.commission / p.revenue) * 100 : 0)}</Td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-[var(--color-border)]">
                        <td colSpan={6} className="px-5 py-3" style={{ background: 'var(--color-bg)' }}>
                          <table className="w-full text-xs tabular-nums">
                            <tbody>
                              {p.services.map(s => (
                                <tr key={s.serviceId}>
                                  <td className="py-0.5 text-[var(--color-text)]">{serviceNameById.get(s.serviceId) ?? 'Servicio eliminado'}</td>
                                  <td className="py-0.5 text-right text-[var(--color-muted)]">{s.count} {s.count === 1 ? 'servicio' : 'servicios'}</td>
                                  <td className="py-0.5 text-right text-[var(--color-muted)]">{formatMoney(s.revenue)}</td>
                                  <td className="py-0.5 text-right text-[var(--color-text)]">{formatMoney(s.commission)}</td>
                                  <td className="py-0.5 text-right text-[var(--color-muted)]">{fmtPct(s.avgRate)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </FragmentRows>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <header className="px-5 py-3 border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
              Servicios
            </h3>
            <p className="text-xs text-[var(--color-muted)]">Promedio real por servicio de los {PROJECTION_MONTHS} meses anteriores y precio sugerido para llegar a ser rentable</p>
          </div>
          {suggestion && suggestedRows.length > 0 && (
            <Button variant="secondary" size="sm" onClick={applyAll} disabled={updateCatalogItem.isPending}>
              Aplicar a todos los sugeridos
            </Button>
          )}
        </header>
        {suggestion && (
          <p className="px-5 py-2.5 text-xs border-b border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]">
            <span className="font-semibold">Subir {fmtNum(suggestion.pct)}%</span> en {suggestedRows.length}{' '}
            {suggestedRows.length === 1 ? 'servicio' : 'servicios'} con margen bruto por debajo del promedio ({fmtPct(suggestion.thresholdPct)}) cubre los{' '}
            {formatMoney(projected.gap)} que faltan por mes.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th align="left">Servicio</Th>
                <Th>Serv./mes</Th>
                <Th>Ingreso prom.</Th>
                <Th>Insumos prom.</Th>
                <Th>Comisión prom.</Th>
                <Th>Margen bruto</Th>
                <Th>Precio actual</Th>
                <Th>Sugerido</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-xs text-[var(--color-muted)]">Sin servicios en el catálogo</td>
                </tr>
              )}
              {rows.map((row, i) => {
                const showFamilyHeader = rows[i - 1]?.family !== row.family
                const s = row.summary
                const avgRevenue = s ? s.revenue / s.count : 0
                const marginPct = s && s.revenue > 0 ? (s.margin / s.revenue) * 100 : 0
                const color = s ? marginColor(marginPct) : 'var(--color-muted)'
                const delta = row.suggested != null && row.item.price > 0 ? ((row.suggested - row.item.price) / row.item.price) * 100 : null
                return (
                  <FragmentRows key={row.item.id}>
                    {showFamilyHeader && (
                      <tr className="bg-[var(--color-bg)]">
                        <td colSpan={8} className="px-5 py-1.5 text-xs font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                          {row.family}
                        </td>
                      </tr>
                    )}
                    <tr className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
                      <td className="px-3 py-2 text-[var(--color-text)]">{row.sizeLabel || row.family}</td>
                      <Td muted>{s ? fmtNum(row.perMonth) : '—'}</Td>
                      <Td>{s ? formatMoney(avgRevenue) : '—'}</Td>
                      <Td muted>{s ? formatMoney(s.materials / s.count) : '—'}</Td>
                      <Td muted>
                        {s ? formatMoney(s.commission / s.count) : '—'}
                        {s && s.revenue > 0 && <span className="block text-[10px]">{fmtPct((s.commission / s.revenue) * 100)}</span>}
                      </Td>
                      <td className="px-3 py-2 text-right align-top tabular-nums">
                        {s ? (
                          <>
                            <span className="font-semibold" style={{ color }}>{formatMoney(s.margin / s.count)}</span>
                            <span className="block text-xs" style={{ color }}>{fmtPct(marginPct)}</span>
                          </>
                        ) : (
                          <span className="text-[var(--color-muted)]">—</span>
                        )}
                      </td>
                      <Td>{formatMoney(row.item.price)}</Td>
                      <td className="px-3 py-2 text-right align-top tabular-nums">
                        {row.suggested == null ? (
                          <span className="text-[var(--color-muted)]">—</span>
                        ) : (
                          <>
                            <span className="text-[var(--color-text)]">{formatMoney(row.suggested)}</span>
                            <span className="block text-xs text-[var(--color-danger)]">{delta == null ? '' : `+${fmtNum(delta, 0)}%`}</span>
                            <button
                              onClick={() => applyOne(row)}
                              disabled={updateCatalogItem.isPending}
                              className="text-[10px] font-medium text-[var(--color-accent)] hover:underline disabled:opacity-40"
                            >
                              Aplicar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  </FragmentRows>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

interface LedgerLine {
  label: string
  value: number
  sign?: '+' | '−'
  kind?: 'sub' | 'total'
}

function Ledger({ lines }: { lines: LedgerLine[] }) {
  return (
    <dl className="px-5 py-4 space-y-1 text-sm tabular-nums">
      {lines.map(line => {
        const isTotal = line.kind === 'total'
        const isSub = line.kind === 'sub'
        return (
          <div key={line.label} className={`flex justify-between gap-4 ${isSub || isTotal ? 'border-t border-[var(--color-border)] pt-1.5 mt-1.5' : ''}`}>
            <dt className={isTotal ? 'font-semibold text-[var(--color-text)]' : isSub ? 'font-medium text-[var(--color-text)]' : 'text-[var(--color-muted)]'}>
              {line.sign ? `${line.sign} ` : isSub || isTotal ? '= ' : ''}
              {line.label}
            </dt>
            <dd
              className={isTotal ? 'text-lg font-semibold' : isSub ? 'font-medium text-[var(--color-text)]' : 'text-[var(--color-text)]'}
              style={isTotal ? { color: line.value >= 0 ? 'var(--color-success)' : 'var(--color-danger)' } : undefined}
            >
              {formatMoney(line.value)}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function FragmentRows({ children }: { children: ReactNode }) {
  return <>{children}</>
}

function Th({ children, align = 'right' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] ${align === 'left' ? 'text-left' : 'text-right'}`}>
      {children}
    </th>
  )
}

function Td({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <td className={`px-3 py-2 text-right align-top tabular-nums ${muted ? 'text-[var(--color-muted)]' : 'text-[var(--color-text)]'}`}>{children}</td>
}
