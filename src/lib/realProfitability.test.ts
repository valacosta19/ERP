import { describe, it, expect } from 'vitest'
import {
  buildServiceSales,
  fixedCostsForMonth,
  monthResult,
  priceRaiseSuggestion,
  raisedPrice,
  sumSales,
  summarizeByProfessional,
  summarizeByService,
} from './realProfitability'
import type { ServiceSaleRow } from '@/hooks/useServiceSalesDetail'

const rows: ServiceSaleRow[] = [
  { id: 't1', date: '2026-09-02', catalog_item_id: 'corte', amount: 50000, seña_amount: null, currency: 'ARS', transaction_hairdressers: [{ hairdresser_id: 'e', commission_rate: 40 }] },
  { id: 't2', date: '2026-09-03', catalog_item_id: 'corte', amount: 40000, seña_amount: 10000, currency: 'ARS', transaction_hairdressers: [{ hairdresser_id: 'e', commission_rate: 40 }, { hairdresser_id: 'f', commission_rate: 7 }] },
  { id: 't3', date: '2026-09-04', catalog_item_id: 'color', amount: 100, seña_amount: null, currency: 'USD', transaction_hairdressers: [{ hairdresser_id: 'f', commission_rate: 45 }] },
  { id: 't4', date: '2026-09-05', catalog_item_id: 'color', amount: 100, seña_amount: null, currency: 'EUR', transaction_hairdressers: [] },
]
const snapshots = [{ transaction_id: 't1', quantity_grams: 10, avg_unit_cost: 1000, unit_size: 100 }, { transaction_id: 't1', quantity_grams: 5, avg_unit_cost: 2000, unit_size: 100 }]
const recipes = [{ catalog_item_id: 'corte', product_id: 'p1', quantity_grams: 20 }]
const productById = new Map([['p1', { unit_size: 100, min_cost: 500, max_cost: 500 }]])
const sales = buildServiceSales(rows, snapshots, recipes, productById, 1000)

describe('buildServiceSales', () => {
  it('converts USD, adds the seña, prefers the cost snapshot and skips EUR', () => {
    expect(sales.map(s => s.txId)).toEqual(['t1', 't2', 't3'])
    expect(sales[0]).toMatchObject({ revenue: 50000, materials: 200, commission: 20000 })
    expect(sales[1]).toMatchObject({ revenue: 50000, materials: 100, commission: 23500 })
    expect(sales[1].hairdressers).toEqual([{ id: 'e', rate: 40, commission: 20000 }, { id: 'f', rate: 7, commission: 3500 }])
    expect(sales[2]).toMatchObject({ revenue: 100000, materials: 0, commission: 45000 })
  })
})

describe('sumSales / summarizeByService', () => {
  it('totals revenue, materials, commission and margin', () => {
    expect(sumSales(sales)).toEqual({ count: 3, revenue: 200000, materials: 300, commission: 88500, margin: 111200 })
    expect(summarizeByService(sales).get('corte')).toEqual({ count: 2, revenue: 100000, materials: 300, commission: 43500, margin: 56200 })
  })
})

describe('summarizeByProfessional', () => {
  it('counts services and commission per professional with a per-service breakdown', () => {
    const result = summarizeByProfessional(sales, [{ id: 'e', name: 'Eury' }, { id: 'f', name: 'Fabiana' }])
    expect(result.map(p => [p.name, p.count, p.revenue, p.commission])).toEqual([
      ['Fabiana', 2, 150000, 48500],
      ['Eury', 2, 100000, 40000],
    ])
    expect(result[0].services.map(s => ({ ...s, avgRate: Math.round(s.avgRate * 100) / 100 }))).toEqual([
      { serviceId: 'color', count: 1, revenue: 100000, commission: 45000, avgRate: 45 },
      { serviceId: 'corte', count: 1, revenue: 50000, commission: 3500, avgRate: 7 },
    ])
  })
  it('names unknown professionals', () => {
    expect(summarizeByProfessional(sales, [])[0].name).toBe('Profesional eliminada')
  })
})

describe('fixedCostsForMonth', () => {
  const fixedCosts = [
    { id: 'f1', active: true, monthly_amount: 150000 },
    { id: 'f2', active: false, monthly_amount: 999999 },
    { id: 'f3', active: true, monthly_amount: 30000 },
  ]
  const rates = [
    { fixed_cost_id: 'f1', monthly_amount: 100000, effective_from: '2026-01-01' },
    { fixed_cost_id: 'f1', monthly_amount: 150000, effective_from: '2026-09-01' },
    { fixed_cost_id: 'f1', monthly_amount: 200000, effective_from: '2026-10-15' },
  ]
  it('uses the rate in force at the end of the month and the current amount without rates', () => {
    expect(fixedCostsForMonth(fixedCosts, rates, '2026-09')).toBe(180000)
    expect(fixedCostsForMonth(fixedCosts, rates, '2026-08')).toBe(130000)
    expect(fixedCostsForMonth(fixedCosts, rates, '2026-10')).toBe(230000)
  })
})

describe('monthResult', () => {
  it('measures the gap against fixed costs plus the objective', () => {
    expect(monthResult({ serviceMargin: 100000, productMargin: 20000, fixed: 150000, objective: 0 })).toEqual({ gross: 120000, net: -30000, gap: 30000 })
    expect(monthResult({ serviceMargin: 200000, productMargin: 0, fixed: 150000, objective: 30000 })).toEqual({ gross: 200000, net: 20000, gap: 0 })
  })
})

describe('priceRaiseSuggestion', () => {
  const candidates = [
    { serviceId: 'corte', perMonth: 2, avgRevenue: 50000, avgRate: 40, marginPct: 59.8 },
    { serviceId: 'color', perMonth: 1, avgRevenue: 100000, avgRate: 45, marginPct: 55 },
    { serviceId: 'nuevo', perMonth: 0, avgRevenue: 0, avgRate: 0, marginPct: 0 },
  ]
  it('raises only the services below the weighted average margin', () => {
    const s = priceRaiseSuggestion(candidates, 32200)
    expect(s?.serviceIds).toEqual(['color'])
    expect(s?.thresholdPct).toBeCloseTo(57.4)
    expect(s?.pct).toBeCloseTo(58.545, 2)
  })
  it('falls back to every sold service when nothing is below average', () => {
    const s = priceRaiseSuggestion([{ serviceId: 'a', perMonth: 2, avgRevenue: 10000, avgRate: 50, marginPct: 40 }, { serviceId: 'b', perMonth: 2, avgRevenue: 10000, avgRate: 50, marginPct: 40 }], 2000)
    expect(s?.serviceIds).toEqual(['a', 'b'])
    expect(s?.pct).toBeCloseTo(10)
  })
  it('is null without a gap or without sales', () => {
    expect(priceRaiseSuggestion(candidates, 0)).toBeNull()
    expect(priceRaiseSuggestion([candidates[2]], 1000)).toBeNull()
  })
})

describe('raisedPrice', () => {
  it('rounds to the nearest hundred', () => {
    expect(raisedPrice(100000, 58.545)).toBe(158500)
    expect(raisedPrice(52000, 10)).toBe(57200)
  })
})
