import type { Currency } from '@/types'

export type FunnelType = 'income' | 'expense' | 'cost' | 'transfer'

export type FunnelStep = 'type' | 'detail' | 'amount' | 'adjust' | 'payment' | 'done'

export type CartLine = {
  key: string
  kind: 'service' | 'product' | 'other'
  name: string
  unitPrice: number
  qty: number
  catalogItemId: string | null
  productId: string | null
  subcategoryId: string | null
  professionals: { id: string; commission_rate: number }[]
}

export type FunnelPaymentRow = {
  key: string
  payment_method: string
  amount: number
  received: number | null
}

export const newPaymentKey = () => crypto.randomUUID()

export type DiscountMode = 'none' | 'amount' | 'percent'

export type IncomeMode = 'cart' | 'simple'

export type FunnelState = {
  step: FunnelStep
  type: FunnelType | null
  incomeMode: IncomeMode
  date: string
  currency: Currency
  lines: CartLine[]
  concept: string
  manualAmount: number
  simpleMethod: string
  incomeMethod: string
  incomePriceTier: 'cash' | 'transfer' | 'card'
  subcategoryId: string
  transferDirection: 'entrada' | 'salida'
  discountMode: DiscountMode
  discountValue: number
  tipEnabled: boolean
  tipAmount: number
  payments: FunnelPaymentRow[]
  anticipoAmount: number
  simpleProductId: string | null
  simpleProductQty: number
}

export const FUNNEL_TYPE_META: Record<FunnelType, { label: string; parentName: string }> = {
  income: { label: 'Ingreso', parentName: 'Ingresos' },
  expense: { label: 'Gasto', parentName: 'Gastos' },
  cost: { label: 'Costo', parentName: 'Costos' },
  transfer: { label: 'Movimiento', parentName: 'Movimientos' },
}

export function makeEmptyFunnelState(): FunnelState {
  return {
    step: 'type',
    type: null,
    incomeMode: 'cart',
    date: new Date().toLocaleDateString('en-CA'),
    currency: 'ARS',
    lines: [],
    concept: '',
    manualAmount: 0,
    simpleMethod: 'Efectivo',
    incomeMethod: '',
    incomePriceTier: 'cash',
    subcategoryId: '',
    transferDirection: 'entrada',
    discountMode: 'none',
    discountValue: 0,
    tipEnabled: false,
    tipAmount: 0,
    payments: [],
    anticipoAmount: 0,
    simpleProductId: null,
    simpleProductQty: 1,
  }
}

export function lineGross(line: CartLine): number {
  return Math.round(line.unitPrice * line.qty)
}

export function linesGross(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + lineGross(l), 0)
}

export function discountValueFor(state: FunnelState): number {
  const gross = linesGross(state.lines)
  if (state.discountMode === 'amount') return Math.min(state.discountValue, gross)
  if (state.discountMode === 'percent') return Math.round((gross * Math.min(state.discountValue, 100)) / 100)
  return 0
}

export function ticketNet(state: FunnelState): number {
  return Math.max(0, linesGross(state.lines) - discountValueFor(state))
}

export function chargeTotal(state: FunnelState): number {
  const tip = state.tipEnabled ? Math.max(0, state.tipAmount) : 0
  const anticipo = hasServiceLine(state) ? Math.max(0, state.anticipoAmount) : 0
  return Math.max(0, ticketNet(state) - anticipo + tip)
}

export function paymentsTotal(state: FunnelState): number {
  return state.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
}

export function hasServiceLine(state: FunnelState): boolean {
  return state.lines.some(l => l.kind === 'service')
}

export function isCartIncome(state: FunnelState): boolean {
  return state.type === 'income' && state.incomeMode === 'cart'
}
