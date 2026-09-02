import { describe, it, expect } from 'vitest'
import { marginColor } from './profitability'

describe('marginColor', () => {
  it('maps thresholds to tokens', () => {
    expect(marginColor(31)).toBe('var(--color-success)')
    expect(marginColor(10)).toBe('var(--color-warning)')
    expect(marginColor(9.9)).toBe('var(--color-danger)')
  })
})
