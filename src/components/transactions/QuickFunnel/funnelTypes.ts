import type { Currency, TransactionCategory } from '@/types'
import { internalTransferValidationError, isInternalTransferCategory } from '@/lib/internalTransfer'

export const FUNNEL_TYPE_ORDER = ['income', 'expense', 'cost', 'transfer'] as const

export type FunnelType = typeof FUNNEL_TYPE_ORDER[number]

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
  transferDestinationAmount: number
  transferDestinationCurrency: Currency
  simpleMethod: string
  transferDirection: 'entrada' | 'salida'
  transferDestinationMethod: string
  incomeMethod: string
  incomePriceTier: 'cash' | 'transfer' | 'card'
  subcategoryId: string
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

export function funnelSubcategories(
  type: Exclude<FunnelType, 'income'>,
  categories: TransactionCategory[],
): TransactionCategory[] {
  return categories.filter(category => {
    const parent = categories.find(candidate => candidate.id === category.parent_id)
    return parent?.name === FUNNEL_TYPE_META[type].parentName
  })
}

export function canAdvanceSimpleAmount(
  state: FunnelState,
  subcategory: TransactionCategory | null | undefined,
): boolean {
  if (state.manualAmount <= 0) return false

  if (state.type === 'transfer' && isInternalTransferCategory(subcategory)) {
    return internalTransferValidationError([
      { payment_method: state.simpleMethod, instrument: null, amount: state.manualAmount, type: 'salida', currency: state.currency },
      { payment_method: state.transferDestinationMethod, instrument: null, amount: state.transferDestinationAmount, type: 'entrada', currency: state.transferDestinationCurrency },
    ]) === null
  }

  return subcategory?.deducts_inventory === true || !!state.simpleMethod
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
    transferDestinationAmount: 0,
    transferDestinationCurrency: 'ARS',
    simpleMethod: 'Efectivo',
    transferDirection: 'entrada',
    transferDestinationMethod: '',
    incomeMethod: '',
    incomePriceTier: 'cash',
    subcategoryId: '',
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
