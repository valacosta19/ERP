import type { Currency } from '@/types'

export const CURRENCY_SYMBOL: Record<Currency, string> = { ARS: '$', USD: 'U$D', EUR: '€' }

const LOCALE = 'es-AR'

export function formatMoney(amount: number, currency: Currency = 'ARS'): string {
  const rounded = Math.round(amount * 100) / 100
  const hasCents = Math.abs(rounded - Math.round(rounded)) >= 0.005
  const text = rounded.toLocaleString(LOCALE, { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })
  return `${CURRENCY_SYMBOL[currency]}${text}`
}
