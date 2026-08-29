import type { CSSProperties } from 'react'
import type { Currency } from '@/types'
import { formatMoney } from '@/lib/money'

export { CURRENCY_SYMBOL } from '@/lib/money'

export function money(amount: number, currency: Currency = 'ARS'): string {
  return formatMoney(Math.round(amount), currency)
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
