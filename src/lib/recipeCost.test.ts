import { describe, it, expect } from 'vitest'
import { getAvgUnitCost, getCostPerGram, materialCostByService } from './recipeCost'

describe('getAvgUnitCost', () => {
  it('returns null when the product never had a lot', () => {
    expect(getAvgUnitCost({ min_cost: null, max_cost: null })).toBeNull()
  })
  it('averages the cost range', () => {
    expect(getAvgUnitCost({ min_cost: 100, max_cost: 300 })).toBe(200)
  })
  it('falls back to the single known bound', () => {
    expect(getAvgUnitCost({ min_cost: 150, max_cost: null })).toBe(150)
    expect(getAvgUnitCost({ min_cost: null, max_cost: 150 })).toBe(150)
  })
})

describe('getCostPerGram', () => {
  it('returns null without unit_size', () => {
    expect(getCostPerGram({ unit_size: null, min_cost: 8250, max_cost: 8250 })).toBeNull()
    expect(getCostPerGram({ unit_size: 0, min_cost: 8250, max_cost: 8250 })).toBeNull()
  })
  it('divides the average cost by the package size', () => {
    expect(getCostPerGram({ unit_size: 60, min_cost: 8250, max_cost: 8250 })).toBe(137.5)
    expect(getCostPerGram({ unit_size: 100, min_cost: 100, max_cost: 300 })).toBe(2)
  })
  it('treats a product without cost as zero cost per gram', () => {
    expect(getCostPerGram({ unit_size: 60, min_cost: null, max_cost: null })).toBe(0)
  })
})

describe('materialCostByService', () => {
  it('sums recipe lines per service and ignores products without package size', () => {
    const products = new Map([
      ['p1', { unit_size: 100, min_cost: 1000, max_cost: 1000 }],
      ['p2', { unit_size: null, min_cost: 500, max_cost: 500 }],
    ])
    const recipes = [
      { catalog_item_id: 's1', product_id: 'p1', quantity_grams: 10 },
      { catalog_item_id: 's1', product_id: 'p2', quantity_grams: 10 },
      { catalog_item_id: 's2', product_id: 'p1', quantity_grams: 5 },
      { catalog_item_id: 's2', product_id: 'missing', quantity_grams: 5 },
    ]
    const totals = materialCostByService(recipes, products)
    expect(totals.get('s1')).toBe(100)
    expect(totals.get('s2')).toBe(50)
    expect(totals.has('s3')).toBe(false)
  })
})
