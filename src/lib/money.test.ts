import { describe, it, expect } from 'vitest'
import { formatMoney } from './money'

describe('formatMoney', () => {
  it('omits decimals for whole amounts', () => {
    expect(formatMoney(12500)).toBe('$12.500')
  })

  it('shows two decimals when there are cents', () => {
    expect(formatMoney(12500.37)).toBe('$12.500,37')
    expect(formatMoney(0.5)).toBe('$0,50')
  })

  it('rounds float noise away', () => {
    expect(formatMoney(0.1 + 0.2)).toBe('$0,30')
    expect(formatMoney(1000.004)).toBe('$1.000')
  })

  it('uses the currency symbol', () => {
    expect(formatMoney(200, 'USD')).toBe('U$D200')
    expect(formatMoney(-15, 'EUR')).toBe('€-15')
  })
})
