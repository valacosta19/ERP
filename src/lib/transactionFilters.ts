import type { Currency } from '@/types'

const CURRENCIES: Currency[] = ['ARS', 'USD', 'EUR']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function readDateParam(params: URLSearchParams, key: string, fallback: string): string {
  const value = params.get(key)
  if (value === null) return fallback
  return value === '' || DATE_RE.test(value) ? value : fallback
}

export function readCurrencyParam(params: URLSearchParams): Currency | '' {
  const value = params.get('cur')
  return CURRENCIES.includes(value as Currency) ? (value as Currency) : ''
}
