import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowUpDown, ChevronDown, ChevronRight, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useFixedCosts } from '@/hooks/useFixedCosts'
import { useProfessionals } from '@/hooks/useProfessionals'
import { useUpdateCatalogItem } from '@/hooks/useCatalogItems'
import { useServiceSalesByMonth } from '@/hooks/useServiceSales'
import { useHairdresserServices } from '@/hooks/useHairdresserServices'
import { teamCommissionFor, type AssignedProfessional } from '@/lib/commissions'
import { confirmDialog } from '@/lib/confirm'
import { formatLocalDate } from '@/lib/dateRange'
import { formatMoney } from '@/lib/money'
import { getCostPerGram, materialCostByService } from '@/lib/recipeCost'
import {
  computeServiceProfit,
  fixedCostPerHour,
  marginColor,
  priceFor,
  suggestedPrice,
  PRICE_METHOD_LABELS,
  type PriceMethod,
  type ServiceProfit,
} from '@/lib/profitability'
import { SIZE_LABELS, type ServiceFamily } from '@/lib/serviceFamilies'
import type { CatalogItem, Product, ServiceRecipe } from '@/types'

const SALES_MONTHS = 3
const DEFAULT_HOURS_PER_MONTH = 160
const DEFAULT_TARGET_PCT = 45

function closedMonthsRange(months: number): { from: string; to: string } {
  const now = new Date()
  return {
    from: formatLocalDate(new Date(now.getFullYear(), now.getMonth() - months, 1)),
    to: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 0)),
  }
}

function fmtPct(value: number) {
  return `${value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

function fmtNum(value: number, digits = 1) {
  return value.toLocaleString('es-AR', { maximumFractionDigits: digits })
}

function roundPrice(value: number) {
  return Math.round(value / 100) * 100
}

interface ServiceRow {
  item: CatalogItem
  family: string
  sizeLabel: string
  price: number
  materials: number
  hasRecipe: boolean
  assigned: AssignedProfessional[]
  commissionPct: number
  profit: ServiceProfit
  suggested: number | null
  salesPerMonth: number | null
  monthlyMargin: number | null
}

interface ProfitabilityTabProps {
  families: ServiceFamily[]
  recipes: ServiceRecipe[]
  productById: Map<string, Product>
  onEditFamily: (family: string) => void
}

export function ProfitabilityTab({ families, recipes, productById, onEditFamily }: ProfitabilityTabProps) {
  const [method, setMethod] = useState<PriceMethod>('cash')
  const [commissionInput, setCommissionInput] = useState('')
  const [hoursPerMonthInput, setHoursPerMonthInput] = useState(String(DEFAULT_HOURS_PER_MONTH))
  const [targetInput, setTargetInput] = useState(String(DEFAULT_TARGET_PCT))
  const [sortByMargin, setSortByMargin] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [teamOverride, setTeamOverride] = useState<Set<string> | null>(null)

  const { data: fixedCosts = [] } = useFixedCosts()
  const { data: professionals = [] } = useProfessionals()
  const { data: assignments = [] } = useHairdresserServices()
  const activeProfessionals = useMemo(() => professionals.filter(p => p.active), [professionals])
  const defaultTeam = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of assignments) counts.set(a.hairdresser_id, (counts.get(a.hairdresser_id) ?? 0) + 1)
    const top = activeProfessionals
      .filter(p => counts.has(p.id))
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))[0]
    return new Set(top ? [top.id] : [])
  }, [assignments, activeProfessionals])
  const team = teamOverride ?? defaultTeam
  function toggleTeam(id: string) {
    setTeamOverride(prev => {
      const next = new Set(prev ?? defaultTeam)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const salesRange = useMemo(() => closedMonthsRange(SALES_MONTHS), [])
  const { data: sales } = useServiceSalesByMonth(salesRange.from, salesRange.to, SALES_MONTHS)
  const updateCatalogItem = useUpdateCatalogItem()

  const commissionPct = Math.max(0, parseFloat(commissionInput) || 0)
  const hoursPerMonth = parseFloat(hoursPerMonthInput) || 0
  const targetPct = Math.max(0, parseFloat(targetInput) || 0)
  const perHour = useMemo(() => fixedCostPerHour(fixedCosts, hoursPerMonth), [fixedCosts, hoursPerMonth])
  const activeFixedTotal = useMemo(() => fixedCosts.filter(fc => fc.active).reduce((s, fc) => s + fc.monthly_amount, 0), [fixedCosts])

  const materialsByService = useMemo(() => materialCostByService(recipes, productById), [recipes, productById])
  const recipesByService = useMemo(() => {
    const map = new Map<string, ServiceRecipe[]>()
    for (const r of recipes) {
      const list = map.get(r.catalog_item_id) ?? []
      list.push(r)
      map.set(r.catalog_item_id, list)
    }
    return map
  }, [recipes])

  const rows = useMemo<ServiceRow[]>(() => {
    const result: ServiceRow[] = []
    for (const family of families) {
      for (const col of family.columns) {
        const price = priceFor(col.item, method)
        const materials = materialsByService.get(col.item.id) ?? 0
        const teamResult = teamCommissionFor(col.item.id, team, assignments, professionals)
        const assigned = teamResult?.members ?? []
        const rowPct = teamResult?.pct ?? commissionPct
        const profit = computeServiceProfit({ price, materials, hours: col.item.hours ?? null, commissionPct: rowPct, fixedCostPerHour: perHour })
        const suggestedRaw = suggestedPrice(materials, profit.fixed, rowPct, targetPct)
        const count = sales?.countByService.get(col.item.id)
        const salesPerMonth = count != null ? count / SALES_MONTHS : null
        result.push({
          item: col.item,
          family: family.family,
          sizeLabel: col.size === 'unico' ? '' : SIZE_LABELS[col.size],
          price,
          materials,
          hasRecipe: (recipesByService.get(col.item.id)?.length ?? 0) > 0,
          assigned,
          commissionPct: rowPct,
          profit,
          suggested: suggestedRaw == null ? null : roundPrice(suggestedRaw),
          salesPerMonth,
          monthlyMargin: salesPerMonth == null ? null : profit.netMargin * salesPerMonth,
        })
      }
    }
    return sortByMargin ? [...result].sort((a, b) => a.profit.netPct - b.profit.netPct) : result
  }, [families, method, materialsByService, commissionPct, perHour, targetPct, sales, recipesByService, sortByMargin, assignments, professionals, team])

  const priced = rows.filter(r => r.price > 0)
  const withSales = priced.filter(r => r.salesPerMonth != null && r.salesPerMonth > 0)
  const avgNetPct =
    withSales.length > 0
      ? withSales.reduce((s, r) => s + r.profit.netPct * (r.salesPerMonth ?? 0), 0) / withSales.reduce((s, r) => s + (r.salesPerMonth ?? 0), 0)
      : priced.length > 0
        ? priced.reduce((s, r) => s + r.profit.netPct, 0) / priced.length
        : 0
  const belowTarget = priced.filter(r => r.profit.netPct < targetPct).length
  const unassigned = rows.filter(r => r.assigned.length === 0).length
  const projectedMonthly = rows.reduce((s, r) => s + (r.monthlyMargin ?? 0), 0)

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function applySuggested(row: ServiceRow) {
    if (row.suggested == null) return
    const ok = await confirmDialog({
      title: 'Aplicar precio sugerido',
      message: `Cambiar el precio ${PRICE_METHOD_LABELS[method].toLowerCase()} de "${row.item.name}" de ${formatMoney(row.price)} a ${formatMoney(row.suggested)}.`,
      confirmLabel: 'Aplicar',
    })
    if (!ok) return
    const patch =
      method === 'cash' ? { price: row.suggested } : method === 'transfer' ? { price_transfer: row.suggested } : { price_card: row.suggested }
    await updateCatalogItem.mutateAsync({ id: row.item.id, ...patch })
  }

  return (
    <div className="space-y-6">
      <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Precio</p>
            <div className="inline-flex rounded-lg border border-[var(--color-border)] overflow-hidden">
              {(Object.keys(PRICE_METHOD_LABELS) as PriceMethod[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    method === m ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {PRICE_METHOD_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Equipo que hace el servicio</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {activeProfessionals.map(p => {
                const on = team.has(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleTeam(p.id)}
                    aria-pressed={on}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      on
                        ? 'bg-[var(--color-accent-light)] border-[var(--color-accent)] text-[var(--color-accent)]'
                        : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
            <div className="relative inline-block">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={commissionInput}
                onChange={e => setCommissionInput(e.target.value)}
                placeholder="0"
                aria-label="Comisión % para servicios sin profesional asignada"
                className="w-20 pr-6 pl-2 py-1.5 text-sm text-right rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] tabular-nums"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted)]">%</span>
            </div>
            <p className="text-xs mt-1" style={{ color: unassigned > 0 ? 'var(--color-warning)' : 'var(--color-muted)' }}>
              {unassigned === 0
                ? 'Cada servicio suma el % de las marcadas que lo tienen asignado'
                : `% de respaldo: ${unassigned} ${unassigned === 1 ? 'servicio no lo hace nadie' : 'servicios no los hace nadie'} del equipo marcado`}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Costo fijo por hora</p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--color-text)] tabular-nums">{formatMoney(perHour)}</span>
              <span className="text-xs text-[var(--color-muted)]">= {formatMoney(activeFixedTotal)} ÷</span>
              <input
                type="number"
                min="1"
                step="1"
                value={hoursPerMonthInput}
                onChange={e => setHoursPerMonthInput(e.target.value)}
                aria-label="Horas trabajadas por mes"
                className="w-16 px-2 py-1.5 text-sm text-right rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] tabular-nums"
              />
              <span className="text-xs text-[var(--color-muted)]">h/mes</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Margen objetivo</p>
            <div className="relative inline-block">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={targetInput}
                onChange={e => setTargetInput(e.target.value)}
                aria-label="Margen objetivo %"
                className="w-20 pr-6 pl-2 py-1.5 text-sm text-right rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] tabular-nums"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted)]">%</span>
            </div>
            {commissionPct + targetPct >= 100 && (
              <p className="text-xs text-[var(--color-danger)] mt-1">Comisión + objetivo no puede llegar al 100 %</p>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Margen neto promedio</p>
          <p className="text-2xl font-semibold mt-1 tabular-nums" style={{ color: marginColor(avgNetPct) }}>{fmtPct(avgNetPct)}</p>
          <p className="text-xs text-[var(--color-muted)] mt-1">{withSales.length > 0 ? 'ponderado por servicios vendidos' : 'promedio simple, sin ventas registradas'}</p>
        </div>
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Por debajo del objetivo</p>
          <p className="text-2xl font-semibold mt-1 tabular-nums" style={{ color: belowTarget > 0 ? 'var(--color-warning)' : 'var(--color-text)' }}>
            {belowTarget} <span className="text-sm font-normal text-[var(--color-muted)]">de {priced.length}</span>
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-1">servicios con margen neto menor a {fmtNum(targetPct)}%</p>
        </div>
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Margen mensual proyectado</p>
          <p className="text-2xl font-semibold text-[var(--color-text)] mt-1 tabular-nums">{formatMoney(projectedMonthly)}</p>
          <p className="text-xs text-[var(--color-muted)] mt-1">margen neto × servicios/mes (últimos {SALES_MONTHS} meses cerrados)</p>
        </div>
      </div>

      <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs text-[var(--color-muted)]">
            <LegendSwatch color="var(--color-warning)" label="Insumos" />
            <LegendSwatch color="var(--color-accent)" label="Comisión" />
            <LegendSwatch color="var(--color-muted)" label="Fijos" />
            <LegendSwatch color="var(--color-success)" label="Margen" />
          </div>
          <button
            onClick={() => setSortByMargin(s => !s)}
            className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${sortByMargin ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
          >
            <ArrowUpDown size={12} /> {sortByMargin ? 'Ordenado por margen' : 'Ordenar por margen'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="w-8 px-2 py-2" />
                <Th align="left">Servicio</Th>
                <Th>Precio</Th>
                <Th>Insumos</Th>
                <Th>Comisión</Th>
                <Th>Fijos</Th>
                <Th>Margen neto</Th>
                <Th>Sugerido</Th>
                <Th>Serv./mes</Th>
                <Th>Margen/mes</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-xs text-[var(--color-muted)]">Sin servicios en el catálogo</td>
                </tr>
              )}
              {rows.map((row, i) => {
                const showFamilyHeader = !sortByMargin && rows[i - 1]?.family !== row.family
                const isOpen = expanded.has(row.item.id)
                const color = marginColor(row.profit.netPct)
                const delta = row.suggested != null && row.price > 0 ? ((row.suggested - row.price) / row.price) * 100 : null
                return (
                  <FragmentRows key={row.item.id}>
                    {showFamilyHeader && (
                      <tr className="bg-[var(--color-bg)]">
                        <td colSpan={10} className="px-5 py-1.5 text-xs font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                          {row.family}
                        </td>
                      </tr>
                    )}
                    <tr className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
                      <td className="px-2 pt-3 pb-1 align-top">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(row.item.id)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Contraer desglose' : 'Ver desglose'}
                          className="p-1 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
                        >
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="px-3 pt-3 pb-1 align-top">
                        <div className="flex items-center gap-2 text-[var(--color-text)]">
                          <span>{sortByMargin ? row.item.name : row.sizeLabel || row.family}</span>
                          {!row.hasRecipe && (
                            <span title="Sin receta: insumos en 0" className="text-[var(--color-warning)] inline-flex"><AlertTriangle size={12} /></span>
                          )}
                          {row.item.hours == null && (
                            <span title="Sin horas: costos fijos en 0" className="text-[var(--color-warning)] inline-flex"><AlertTriangle size={12} /></span>
                          )}
                        </div>
                        <CompositionBar row={row} />
                      </td>
                      <Td>{formatMoney(row.price)}</Td>
                      <Td muted>{formatMoney(row.materials)}</Td>
                      <Td muted>
                        {formatMoney(row.profit.commission)}
                        <span className="block text-[10px]" style={{ color: row.assigned.length === 0 ? 'var(--color-warning)' : undefined }}>
                          {row.assigned.length === 0
                            ? `nadie del equipo · ${fmtNum(row.commissionPct)}%`
                            : row.assigned.map(p => `${p.name} ${fmtNum(p.commission_rate)}%`).join(' · ')}
                        </span>
                      </Td>
                      <Td muted>
                        {formatMoney(row.profit.fixed)}
                        {row.item.hours != null && <span className="block text-[10px]">{fmtNum(row.item.hours)} h</span>}
                      </Td>
                      <td className="px-3 pt-3 pb-1 text-right align-top tabular-nums">
                        <span className="font-semibold" style={{ color }}>{formatMoney(row.profit.netMargin)}</span>
                        <span className="block text-xs" style={{ color }}>{fmtPct(row.profit.netPct)}</span>
                      </td>
                      <td className="px-3 pt-3 pb-1 text-right align-top tabular-nums">
                        {row.suggested == null ? (
                          <span className="text-[var(--color-muted)]">—</span>
                        ) : (
                          <>
                            <span className="text-[var(--color-text)]">{formatMoney(row.suggested)}</span>
                            <span className="block text-xs" style={{ color: delta != null && delta > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                              {delta == null ? '' : `${delta > 0 ? '+' : ''}${fmtNum(delta, 0)}%`}
                            </span>
                            {row.suggested !== row.price && (
                              <button
                                onClick={() => applySuggested(row)}
                                disabled={updateCatalogItem.isPending}
                                className="text-[10px] font-medium text-[var(--color-accent)] hover:underline disabled:opacity-40"
                              >
                                Aplicar
                              </button>
                            )}
                          </>
                        )}
                      </td>
                      <Td muted>{row.salesPerMonth == null ? '—' : fmtNum(row.salesPerMonth)}</Td>
                      <Td>{row.monthlyMargin == null ? <span className="text-[var(--color-muted)]">—</span> : formatMoney(row.monthlyMargin)}</Td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-[var(--color-border)]">
                        <td colSpan={10} className="px-5 py-4" style={{ background: 'var(--color-bg)' }}>
                          <Breakdown row={row} recipes={recipesByService.get(row.item.id) ?? []} productById={productById} onEdit={() => onEditFamily(row.family)} />
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
    </div>
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
  return <td className={`px-3 pt-3 pb-1 text-right align-top tabular-nums ${muted ? 'text-[var(--color-muted)]' : 'text-[var(--color-text)]'}`}>{children}</td>
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  )
}

function CompositionBar({ row }: { row: ServiceRow }) {
  const costs = row.materials + row.profit.commission + row.profit.fixed
  const base = Math.max(row.price, costs)
  if (base <= 0) return null
  const w = (v: number) => `${Math.max(0, (v / base) * 100)}%`
  const deficit = row.profit.netMargin < 0 ? -row.profit.netMargin : 0
  return (
    <div className="mt-1.5 h-1.5 w-full max-w-xs flex rounded-full overflow-hidden bg-[var(--color-border)]" aria-hidden="true">
      <span style={{ width: w(row.materials), background: 'var(--color-warning)' }} />
      <span style={{ width: w(row.profit.commission), background: 'var(--color-accent)' }} />
      <span style={{ width: w(row.profit.fixed), background: 'var(--color-muted)' }} />
      {deficit > 0 ? (
        <span style={{ width: w(deficit), background: 'var(--color-danger)' }} />
      ) : (
        <span style={{ width: w(row.profit.netMargin), background: 'var(--color-success)' }} />
      )}
    </div>
  )
}

function Breakdown({ row, recipes, productById, onEdit }: { row: ServiceRow; recipes: ServiceRecipe[]; productById: Map<string, Product>; onEdit: () => void }) {
  const commissionLines =
    row.assigned.length === 0
      ? [{ label: `Comisión (% de respaldo, ${fmtNum(row.commissionPct)}%)`, value: -row.profit.commission, sign: '−' }]
      : row.assigned.map(p => ({ label: `Comisión ${p.name} (${fmtNum(p.commission_rate)}%)`, value: -(row.price * p.commission_rate) / 100, sign: '−' }))
  const lines = [
    { label: 'Precio', value: row.price, sign: '' },
    { label: 'Insumos', value: -row.materials, sign: '−' },
    ...commissionLines,
  ]
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
      <div>
        <p className="font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Desglose</p>
        <dl className="space-y-1 tabular-nums">
          {lines.map(l => (
            <div key={l.label} className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted)]">{l.sign} {l.label}</dt>
              <dd className="text-[var(--color-text)]">{formatMoney(Math.abs(l.value))}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-[var(--color-border)] pt-1">
            <dt className="text-[var(--color-muted)]">= Margen bruto</dt>
            <dd className="font-medium text-[var(--color-text)]">{formatMoney(row.profit.grossMargin)} · {fmtPct(row.profit.grossPct)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--color-muted)]">− Fijos ({row.item.hours != null ? `${fmtNum(row.item.hours)} h` : 'sin horas'})</dt>
            <dd className="text-[var(--color-text)]">{formatMoney(row.profit.fixed)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-[var(--color-border)] pt-1">
            <dt className="text-[var(--color-muted)]">= Margen neto</dt>
            <dd className="font-semibold" style={{ color: marginColor(row.profit.netPct) }}>{formatMoney(row.profit.netMargin)} · {fmtPct(row.profit.netPct)}</dd>
          </div>
        </dl>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold uppercase tracking-wider text-[var(--color-muted)]">Receta</p>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil size={11} /> Editar receta
          </Button>
        </div>
        {recipes.length === 0 ? (
          <p className="text-[var(--color-muted)]">Sin receta cargada.</p>
        ) : (
          <table className="w-full tabular-nums">
            <tbody>
              {recipes.map(r => {
                const product = productById.get(r.product_id)
                const cpg = product ? getCostPerGram(product) : null
                return (
                  <tr key={r.id}>
                    <td className="py-0.5 text-[var(--color-text)]">{product?.name ?? 'Producto eliminado'}</td>
                    <td className="py-0.5 text-right text-[var(--color-muted)]">{fmtNum(r.quantity_grams)} g</td>
                    <td className="py-0.5 text-right text-[var(--color-text)]">{cpg == null ? '—' : formatMoney(cpg * r.quantity_grams)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
