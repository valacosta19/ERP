import type { FixedCost, FixedCostRate, Professional } from '@/types'
import type { ServiceSaleRow } from '@/hooks/useServiceSalesDetail'
import { materialCostByService } from './recipeCost'
import { monthRange } from './dateRange'

export interface ServiceSale {
  txId: string
  date: string
  serviceId: string
  revenue: number
  materials: number
  commission: number
  hairdressers: { id: string; rate: number; commission: number }[]
}

interface CostSnapshot {
  transaction_id: string
  quantity_grams: number
  avg_unit_cost: number
  unit_size: number
}

export function buildServiceSales(
  rows: ServiceSaleRow[],
  snapshots: CostSnapshot[],
  recipes: Parameters<typeof materialCostByService>[0],
  productById: Parameters<typeof materialCostByService>[1],
  usdRate: number,
): ServiceSale[] {
  const snapshotByTx = new Map<string, number>()
  for (const s of snapshots) {
    snapshotByTx.set(s.transaction_id, (snapshotByTx.get(s.transaction_id) ?? 0) + (s.quantity_grams * s.avg_unit_cost) / s.unit_size)
  }
  const fallbackByService = materialCostByService(recipes, productById)
  const result: ServiceSale[] = []
  for (const row of rows) {
    if (row.currency === 'EUR') continue
    const base = row.amount + (row.seña_amount ?? 0)
    const revenue = row.currency === 'USD' ? base * usdRate : base
    const hairdressers = row.transaction_hairdressers.map(h => ({
      id: h.hairdresser_id,
      rate: h.commission_rate,
      commission: (revenue * h.commission_rate) / 100,
    }))
    result.push({
      txId: row.id,
      date: row.date,
      serviceId: row.catalog_item_id,
      revenue,
      materials: snapshotByTx.get(row.id) ?? fallbackByService.get(row.catalog_item_id) ?? 0,
      commission: hairdressers.reduce((s, h) => s + h.commission, 0),
      hairdressers,
    })
  }
  return result
}

export interface SalesSummary {
  count: number
  revenue: number
  materials: number
  commission: number
  margin: number
}

export function sumSales(sales: ServiceSale[]): SalesSummary {
  const total = { count: 0, revenue: 0, materials: 0, commission: 0, margin: 0 }
  for (const s of sales) {
    total.count += 1
    total.revenue += s.revenue
    total.materials += s.materials
    total.commission += s.commission
  }
  total.margin = total.revenue - total.materials - total.commission
  return total
}

export function summarizeByService(sales: ServiceSale[]): Map<string, SalesSummary> {
  const grouped = new Map<string, ServiceSale[]>()
  for (const s of sales) {
    const list = grouped.get(s.serviceId) ?? []
    list.push(s)
    grouped.set(s.serviceId, list)
  }
  return new Map(Array.from(grouped, ([id, list]) => [id, sumSales(list)]))
}

export interface ProfessionalServiceSummary {
  serviceId: string
  count: number
  revenue: number
  commission: number
  avgRate: number
}

export interface ProfessionalSummary {
  id: string
  name: string
  count: number
  revenue: number
  commission: number
  services: ProfessionalServiceSummary[]
}

export function summarizeByProfessional(sales: ServiceSale[], professionals: Pick<Professional, 'id' | 'name'>[]): ProfessionalSummary[] {
  const nameById = new Map(professionals.map(p => [p.id, p.name]))
  const byProfessional = new Map<string, Map<string, ProfessionalServiceSummary>>()
  for (const sale of sales) {
    for (const h of sale.hairdressers) {
      const services = byProfessional.get(h.id) ?? new Map<string, ProfessionalServiceSummary>()
      const entry = services.get(sale.serviceId) ?? { serviceId: sale.serviceId, count: 0, revenue: 0, commission: 0, avgRate: 0 }
      entry.count += 1
      entry.revenue += sale.revenue
      entry.commission += h.commission
      services.set(sale.serviceId, entry)
      byProfessional.set(h.id, services)
    }
  }
  return Array.from(byProfessional, ([id, services]) => {
    const list = Array.from(services.values())
      .map(s => ({ ...s, avgRate: s.revenue > 0 ? (s.commission / s.revenue) * 100 : 0 }))
      .sort((a, b) => b.commission - a.commission)
    return {
      id,
      name: nameById.get(id) ?? 'Profesional eliminada',
      count: list.reduce((s, x) => s + x.count, 0),
      revenue: list.reduce((s, x) => s + x.revenue, 0),
      commission: list.reduce((s, x) => s + x.commission, 0),
      services: list,
    }
  }).sort((a, b) => b.commission - a.commission)
}

export function fixedCostsForMonth(
  fixedCosts: Pick<FixedCost, 'id' | 'active' | 'monthly_amount'>[],
  rates: Pick<FixedCostRate, 'fixed_cost_id' | 'monthly_amount' | 'effective_from'>[],
  ym: string,
): number {
  const monthEnd = monthRange(ym).to
  let total = 0
  for (const fc of fixedCosts) {
    if (!fc.active) continue
    const applicable = rates
      .filter(r => r.fixed_cost_id === fc.id && r.effective_from <= monthEnd)
      .sort((a, b) => a.effective_from.localeCompare(b.effective_from))
    const latest = applicable[applicable.length - 1]
    total += latest ? latest.monthly_amount : fc.monthly_amount
  }
  return total
}

export interface MonthResult {
  gross: number
  net: number
  gap: number
}

export function monthResult(i: { serviceMargin: number; productMargin: number; fixed: number; objective: number }): MonthResult {
  const gross = i.serviceMargin + i.productMargin
  const net = gross - i.fixed - i.objective
  return { gross, net, gap: Math.max(0, -net) }
}

export interface RaiseCandidate {
  serviceId: string
  perMonth: number
  avgRevenue: number
  avgRate: number
  marginPct: number
}

export interface RaiseSuggestion {
  pct: number
  serviceIds: string[]
  thresholdPct: number
}

export function priceRaiseSuggestion(candidates: RaiseCandidate[], gap: number): RaiseSuggestion | null {
  if (gap <= 0) return null
  const sold = candidates.filter(c => c.perMonth > 0 && c.avgRevenue > 0)
  const weight = sold.reduce((s, c) => s + c.perMonth * c.avgRevenue, 0)
  if (weight <= 0) return null
  const thresholdPct = sold.reduce((s, c) => s + c.marginPct * c.perMonth * c.avgRevenue, 0) / weight
  const baseOf = (list: RaiseCandidate[]) => list.reduce((s, c) => s + c.perMonth * c.avgRevenue * (1 - c.avgRate / 100), 0)
  let targets = sold.filter(c => c.marginPct < thresholdPct)
  let base = baseOf(targets)
  if (base <= 0) {
    targets = sold
    base = baseOf(targets)
  }
  if (base <= 0) return null
  return { pct: (gap / base) * 100, serviceIds: targets.map(c => c.serviceId), thresholdPct }
}

export function raisedPrice(price: number, pct: number): number {
  return Math.round((price * (1 + pct / 100)) / 100) * 100
}
