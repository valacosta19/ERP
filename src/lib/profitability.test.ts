import { describe, it, expect } from 'vitest'
import { computeServiceProfit, fixedCostPerHour, marginColor, priceFor, suggestedPrice } from './profitability'

describe('priceFor', () => {
  const item = { price: 100, price_transfer: 110, price_card: null }
  it('picks the price of the method and falls back to cash', () => {
    expect(priceFor(item, 'cash')).toBe(100)
    expect(priceFor(item, 'transfer')).toBe(110)
    expect(priceFor(item, 'card')).toBe(100)
  })
})

describe('fixedCostPerHour', () => {
  const costs = [
    { active: true, monthly_amount: 1000 },
    { active: false, monthly_amount: 5000 },
    { active: true, monthly_amount: 600 },
  ]
  it('sums only active costs and divides by hours per month', () => {
    expect(fixedCostPerHour(costs, 160)).toBe(10)
  })
  it('returns 0 without hours', () => {
    expect(fixedCostPerHour(costs, 0)).toBe(0)
    expect(fixedCostPerHour(costs, NaN)).toBe(0)
  })
})

describe('computeServiceProfit', () => {
  it('deducts materials and commission', () => {
    const r = computeServiceProfit({ price: 1000, materials: 100, commissionPct: 40 })
    expect(r.commission).toBe(400)
    expect(r.grossMargin).toBe(500)
    expect(r.grossPct).toBe(50)
  })
  it('reports negative margins and zero percentages for a free service', () => {
    const r = computeServiceProfit({ price: 100, materials: 80, commissionPct: 50 })
    expect(r.grossMargin).toBe(-30)
    expect(r.grossPct).toBe(-30)
    const free = computeServiceProfit({ price: 0, materials: 10, commissionPct: 50 })
    expect(free.grossPct).toBe(0)
  })
})

describe('suggestedPrice', () => {
  it('finds the price that leaves the target margin after materials and commission', () => {
    const price = suggestedPrice(100, 40, 45)
    expect(price).toBeCloseTo(666.67, 1)
    const check = computeServiceProfit({ price: price ?? 0, materials: 100, commissionPct: 40 })
    expect(check.grossPct).toBeCloseTo(45)
  })
  it('works without commission', () => {
    expect(suggestedPrice(100, 0, 50)).toBe(200)
  })
  it('returns null when commission plus target leave nothing', () => {
    expect(suggestedPrice(100, 60, 40)).toBeNull()
    expect(suggestedPrice(100, 70, 40)).toBeNull()
  })
})

describe('marginColor', () => {
  it('maps thresholds to tokens', () => {
    expect(marginColor(31)).toBe('var(--color-success)')
    expect(marginColor(10)).toBe('var(--color-warning)')
    expect(marginColor(9.9)).toBe('var(--color-danger)')
  })
})
