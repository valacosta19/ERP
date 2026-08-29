import type { Currency } from '@/types'
import type { PaymentRow } from '@/hooks/useTransactions'
import { todayLocal } from '@/lib/dateRange'

export function makeEmptyPayment(defaultMethod = 'Efectivo'): PaymentRow {
  return { payment_method: defaultMethod, instrument: null, amount: 0 }
}

export type TransactionDraft = {
  date: string
  currency: Currency
  category_parent_id: string
  subcategory_id: string
  catalog_item_id: string | null
  description: string
  seña_amount: string
  refunds_anticipo_id: string | null
  transfer_direction: 'entrada' | 'salida'
  payments: PaymentRow[]
  professionals: { id: string; commission_rate: number }[]
  product_id: string | null
  product_quantity: number
  inventory_items: Array<{ product_id: string; quantity: number }>
}

export const EMPTY_DRAFT: TransactionDraft = {
  date: todayLocal(),
  currency: 'ARS',
  category_parent_id: '',
  subcategory_id: '',
  catalog_item_id: null,
  description: '',
  seña_amount: '',
  refunds_anticipo_id: null,
  transfer_direction: 'entrada',
  payments: [makeEmptyPayment()],
  professionals: [],
  product_id: null,
  product_quantity: 1,
  inventory_items: [],
}

export function calcTotal(payments: PaymentRow[]) {
  return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
}

export const CURRENCY_SYMBOL: Record<Currency, string> = { ARS: '$', USD: 'U$D', EUR: '€' }

export const CURRENCY_OPTIONS: { value: Currency; label: string }[] = [
  { value: 'ARS', label: 'ARS' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
]

export const INSTRUMENT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Sin instrumento' },
  { value: 'Transferencia', label: 'Transferencia' },
  { value: 'Tarjeta', label: 'Tarjeta' },
]

export type DirectionInput = {
  is_seña: boolean
  description: string | null
  subcategory?: { transaction_type: 'income' | 'expense' | 'transfer' | null } | null
  payments?: { type: string }[] | null
}

export function getTxDirection(tx: DirectionInput): 'entrada' | 'salida' | 'transfer' {
  if (tx.is_seña) return tx.description?.trim().toLowerCase() === 'anticipo' ? 'entrada' : 'salida'
  const txType = tx.subcategory?.transaction_type
  if (txType === 'income') return 'entrada'
  if (txType === 'expense') return 'salida'
  if (txType === 'transfer') return 'transfer'
  return (tx.payments?.[0]?.type as 'entrada' | 'salida') ?? 'entrada'
}
