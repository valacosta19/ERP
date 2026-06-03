import type { CSSProperties } from 'react'
import type { Currency } from '@/types'

export const CURRENCY_SYMBOL: Record<Currency, string> = { ARS: '$', USD: 'U$D', EUR: '€' }

export function money(amount: number, currency: Currency = 'ARS'): string {
  return `${CURRENCY_SYMBOL[currency]}${Math.round(amount).toLocaleString('es-CO')}`
}

export const funnelInput: CSSProperties = {
  background: 'var(--color-bg)',
  border: '1.5px solid var(--color-border)',
  borderRadius: '12px',
  padding: '12px 14px',
  fontSize: '1rem',
  color: 'var(--color-text)',
  outline: 'none',
  fontFamily: 'inherit',
  width: '100%',
}
