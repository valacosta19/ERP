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
  commissionPct: number
}

export interface ServiceProfit {
  commission: number
  grossMargin: number
  grossPct: number
}

export function computeServiceProfit(i: ProfitInputs): ServiceProfit {
  const commission = i.price * (i.commissionPct / 100)
  const grossMargin = i.price - i.materials - commission
  const grossPct = i.price > 0 ? (grossMargin / i.price) * 100 : 0
  return { commission, grossMargin, grossPct }
}

export function suggestedPrice(materials: number, commissionPct: number, targetPct: number): number | null {
  const remaining = 1 - commissionPct / 100 - targetPct / 100
  if (remaining <= 0) return null
  return materials / remaining
}

export function marginColor(pct: number): string {
  if (pct > 30) return 'var(--color-success)'
  if (pct >= 10) return 'var(--color-warning)'
  return 'var(--color-danger)'
}
