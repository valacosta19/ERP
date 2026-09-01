import type { CatalogItem, FixedCost } from '@/types'

export type PriceMethod = 'cash' | 'transfer' | 'card'

export const PRICE_METHOD_LABELS: Record<PriceMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
}

export function priceFor(item: Pick<CatalogItem, 'price' | 'price_transfer' | 'price_card'>, method: PriceMethod): number {
  if (method === 'transfer') return item.price_transfer ?? item.price
  if (method === 'card') return item.price_card ?? item.price
  return item.price
}

export function fixedCostPerHour(fixedCosts: Pick<FixedCost, 'active' | 'monthly_amount'>[], hoursPerMonth: number): number {
  if (!(hoursPerMonth > 0)) return 0
  const total = fixedCosts.filter(fc => fc.active).reduce((s, fc) => s + fc.monthly_amount, 0)
  return total / hoursPerMonth
}

export interface ProfitInputs {
  price: number
  materials: number
  hours: number | null
  commissionPct: number
  fixedCostPerHour: number
}

export interface ServiceProfit {
  commission: number
  fixed: number
  grossMargin: number
  grossPct: number
  netMargin: number
  netPct: number
}

export function computeServiceProfit(i: ProfitInputs): ServiceProfit {
  const commission = i.price * (i.commissionPct / 100)
  const fixed = (i.hours ?? 0) * i.fixedCostPerHour
  const grossMargin = i.price - i.materials - commission
  const netMargin = grossMargin - fixed
  const pct = (value: number) => (i.price > 0 ? (value / i.price) * 100 : 0)
  return { commission, fixed, grossMargin, grossPct: pct(grossMargin), netMargin, netPct: pct(netMargin) }
}

export function suggestedPrice(materials: number, fixed: number, commissionPct: number, targetPct: number): number | null {
  const remaining = 1 - commissionPct / 100 - targetPct / 100
  if (remaining <= 0) return null
  return (materials + fixed) / remaining
}

export function marginColor(pct: number): string {
  if (pct > 30) return 'var(--color-success)'
  if (pct >= 10) return 'var(--color-warning)'
  return 'var(--color-danger)'
}
