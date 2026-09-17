import { describe, it, expect } from 'vitest'
import {
  monthsInRange,
  resolveRateForMonth,
  buildExpenseShareRows,
  fixedCostConcepts,
  sumByBenchmarkKey,
  buildBenchmarkRows,
  buildIncomeAllocation,
} from './expenseShare'

describe('monthsInRange', () => {
  it('returns full coverage for whole months', () => {
    expect(monthsInRange('2026-01-01', '2026-03-31')).toEqual([
      { month: '2026-01', coverage: 1 },
      { month: '2026-02', coverage: 1 },
      { month: '2026-03', coverage: 1 },
    ])
  })

  it('prorates a partial month by days covered', () => {
    const [january] = monthsInRange('2026-01-01', '2026-01-15')
    expect(january.month).toBe('2026-01')
    expect(january.coverage).toBeCloseTo(15 / 31)
  })

  it('prorates both edges of the range', () => {
    const months = monthsInRange('2026-01-16', '2026-02-10')
    expect(months[0].coverage).toBeCloseTo(16 / 31)
    expect(months[1].coverage).toBeCloseTo(10 / 28)
  })

  it('crosses a year boundary', () => {
    expect(monthsInRange('2025-12-01', '2026-01-31').map(m => m.month)).toEqual(['2025-12', '2026-01'])
  })

  it('returns nothing for an inverted range', () => {
    expect(monthsInRange('2026-03-01', '2026-01-01')).toEqual([])
  })
})

describe('resolveRateForMonth', () => {
  const rates = [
    { monthly_amount: 100, effective_from: '2000-01-01' },
    { monthly_amount: 300, effective_from: '2026-03-01' },
    { monthly_amount: 200, effective_from: '2026-01-15' },
  ]

  it('picks the latest rate effective on or before the month', () => {
    expect(resolveRateForMonth(rates, '2026-02')).toBe(200)
    expect(resolveRateForMonth(rates, '2026-03')).toBe(300)
    expect(resolveRateForMonth(rates, '2025-12')).toBe(100)
  })

  it('applies a rate on the month it becomes effective, even mid-month', () => {
    expect(resolveRateForMonth(rates, '2026-01')).toBe(200)
  })

  it('returns null when no rate is effective yet', () => {
    expect(resolveRateForMonth([{ monthly_amount: 500, effective_from: '2026-06-01' }], '2026-01')).toBeNull()
  })
})

describe('buildExpenseShareRows', () => {
  const months = monthsInRange('2026-01-01', '2026-03-31')

  it('compares the last month against the average of the previous ones', () => {
    const [row] = buildExpenseShareRows({
      months,
      incomeByMonth: { '2026-01': 1000, '2026-02': 1000, '2026-03': 1000 },
      concepts: [{ id: 'a', name: 'Alquiler', benchmarkKey: null, byMonth: { '2026-01': 100, '2026-02': 100, '2026-03': 250 } }],
    })
    expect(row.baselinePct).toBeCloseTo(10)
    expect(row.currentPct).toBeCloseTo(25)
    expect(row.deltaPp).toBeCloseTo(15)
    expect(row.trend).toBe('up')
    expect(row.flagged).toBe(true)
    expect(row.total).toBe(450)
  })

  it('flags a constant amount when income falls', () => {
    const [row] = buildExpenseShareRows({
      months,
      incomeByMonth: { '2026-01': 1000, '2026-02': 1000, '2026-03': 500 },
      concepts: [{ id: 'a', name: 'Alquiler', benchmarkKey: null, byMonth: { '2026-01': 100, '2026-02': 100, '2026-03': 100 } }],
    })
    expect(row.deltaPp).toBeCloseTo(10)
    expect(row.flagged).toBe(true)
  })

  it('has no baseline with a single usable month', () => {
    const [row] = buildExpenseShareRows({
      months: monthsInRange('2026-01-01', '2026-01-31'),
      incomeByMonth: { '2026-01': 1000 },
      concepts: [{ id: 'a', name: 'Alquiler', benchmarkKey: null, byMonth: { '2026-01': 100 } }],
    })
    expect(row.currentPct).toBeCloseTo(10)
    expect(row.baselinePct).toBeNull()
    expect(row.deltaPp).toBeNull()
    expect(row.trend).toBe('unknown')
    expect(row.flagged).toBe(false)
  })

  it('skips months without income instead of dividing by zero', () => {
    const [row] = buildExpenseShareRows({
      months,
      incomeByMonth: { '2026-01': 1000, '2026-02': 0, '2026-03': 1000 },
      concepts: [{ id: 'a', name: 'Alquiler', benchmarkKey: null, byMonth: { '2026-01': 100, '2026-02': 100, '2026-03': 100 } }],
    })
    expect(row.baselinePct).toBeCloseTo(10)
    expect(row.currentPct).toBeCloseTo(10)
    expect(row.trend).toBe('flat')
    expect(row.total).toBe(300)
  })

  it('reports unknown when the range has no income at all', () => {
    const [row] = buildExpenseShareRows({
      months,
      incomeByMonth: {},
      concepts: [{ id: 'a', name: 'Alquiler', benchmarkKey: null, byMonth: { '2026-01': 100 } }],
    })
    expect(row.currentPct).toBeNull()
    expect(row.trend).toBe('unknown')
  })

  it('sorts by period total, descending', () => {
    const rows = buildExpenseShareRows({
      months,
      incomeByMonth: { '2026-01': 1000, '2026-02': 1000, '2026-03': 1000 },
      concepts: [
        { id: 'small', name: 'Internet', benchmarkKey: null, byMonth: { '2026-01': 10 } },
        { id: 'big', name: 'Alquiler', benchmarkKey: null, byMonth: { '2026-01': 900 } },
      ],
    })
    expect(rows.map(r => r.id)).toEqual(['big', 'small'])
  })
})

describe('fixedCostConcepts', () => {
  it('uses the historical rate of each month and prorates partial ones', () => {
    const concepts = fixedCostConcepts({
      months: monthsInRange('2026-01-01', '2026-02-15'),
      fixedCosts: [{ id: 'fc1', name: 'Alquiler', active: true, benchmark_key: 'ocupacion' }],
      rates: [
        { fixed_cost_id: 'fc1', monthly_amount: 100, effective_from: '2000-01-01' },
        { fixed_cost_id: 'fc1', monthly_amount: 200, effective_from: '2026-02-01' },
      ],
    })
    expect(concepts[0].byMonth['2026-01']).toBe(100)
    expect(concepts[0].byMonth['2026-02']).toBeCloseTo(200 * (15 / 28))
  })

  it('excludes inactive fixed costs', () => {
    const concepts = fixedCostConcepts({
      months: monthsInRange('2026-01-01', '2026-01-31'),
      fixedCosts: [{ id: 'fc1', name: 'Alquiler', active: false, benchmark_key: null }],
      rates: [{ fixed_cost_id: 'fc1', monthly_amount: 100, effective_from: '2000-01-01' }],
    })
    expect(concepts).toEqual([])
  })

  it('leaves out months with no rate in effect yet', () => {
    const concepts = fixedCostConcepts({
      months: monthsInRange('2026-01-01', '2026-03-31'),
      fixedCosts: [{ id: 'fc1', name: 'Nuevo servicio', active: true, benchmark_key: null }],
      rates: [{ fixed_cost_id: 'fc1', monthly_amount: 100, effective_from: '2026-03-01' }],
    })
    expect(concepts[0].byMonth).toEqual({ '2026-03': 100 })
  })
})

describe('sumByBenchmarkKey', () => {
  const months = monthsInRange('2026-01-01', '2026-02-28')

  it('sums every concept assigned to the same rubro and ignores unassigned ones', () => {
    const totals = sumByBenchmarkKey(
      [
        { benchmarkKey: 'ocupacion', byMonth: { '2026-01': 900, '2026-02': 900 } },
        { benchmarkKey: 'ocupacion', byMonth: { '2026-01': 100, '2026-02': 100 } },
        { benchmarkKey: 'personal', byMonth: { '2026-01': 640 } },
        { benchmarkKey: null, byMonth: { '2026-01': 5000 } },
      ],
      months,
    )
    expect(totals).toEqual({ ocupacion: 2000, personal: 640 })
  })
})

describe('buildBenchmarkRows', () => {
  const benchmarks = [
    { key: 'personal', label: 'Personal', description: null, min_pct: 40, max_pct: 50 },
    { key: 'ocupacion', label: 'Ocupación', description: null, min_pct: 10, max_pct: 15 },
  ]

  it('judges the real percentage against the range and reports the excess', () => {
    const rows = buildBenchmarkRows({
      totalIncome: 1000,
      benchmarks,
      realByKey: { personal: 420, ocupacion: 264 },
      budgetByKey: { ocupacion: 257 },
    })
    expect(rows[0].verdict).toBe('within')
    expect(rows[0].realPct).toBeCloseTo(42)
    expect(rows[1].verdict).toBe('above')
    expect(rows[1].overByPp).toBeCloseTo(11.4)
    expect(rows[1].budgetPct).toBeCloseTo(25.7)
  })

  it('marks a rubro below its range', () => {
    const [personal] = buildBenchmarkRows({
      totalIncome: 1000,
      benchmarks,
      realByKey: { personal: 100 },
      budgetByKey: {},
    })
    expect(personal.verdict).toBe('below')
    expect(personal.overByPp).toBeNull()
  })

  it('stays unknown for a rubro with nothing assigned', () => {
    const [personal] = buildBenchmarkRows({
      totalIncome: 1000,
      benchmarks,
      realByKey: {},
      budgetByKey: {},
    })
    expect(personal.verdict).toBe('unknown')
    expect(personal.realTotal).toBe(0)
  })

  it('stays unknown without income instead of dividing by zero', () => {
    const rows = buildBenchmarkRows({ totalIncome: 0, benchmarks, realByKey: { personal: 420 }, budgetByKey: {} })
    expect(rows[0].realPct).toBeNull()
    expect(rows[0].verdict).toBe('unknown')
  })
})

describe('buildIncomeAllocation', () => {
  it('adds a utilidad slice so the pie totals the income', () => {
    const { slices, profitPct } = buildIncomeAllocation({
      totalIncome: 1000,
      costs: [
        { key: 'cogs', label: 'COGS', value: 200 },
        { key: 'sueldos', label: 'Sueldos', value: 400 },
        { key: 'nada', label: 'Vacío', value: 0 },
      ],
    })
    expect(slices.map(s => s.key)).toEqual(['sueldos', 'cogs', '__profit__'])
    expect(slices.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100)
    expect(profitPct).toBeCloseTo(40)
  })

  it('omits the utilidad slice and flags a loss when costs exceed income', () => {
    const { slices, isLoss, profit } = buildIncomeAllocation({
      totalIncome: 500,
      costs: [{ key: 'sueldos', label: 'Sueldos', value: 800 }],
    })
    expect(slices.map(s => s.key)).toEqual(['sueldos'])
    expect(isLoss).toBe(true)
    expect(profit).toBe(-300)
  })

  it('returns zero percentages without income', () => {
    const { slices } = buildIncomeAllocation({ totalIncome: 0, costs: [{ key: 'a', label: 'A', value: 100 }] })
    expect(slices[0].pct).toBe(0)
  })
})

describe('fixedCostConcepts — forma real de los datos', () => {
  it('resuelve la suba de Alquiler a mitad de ventana y prorratea el mes en curso', () => {
    const [alquiler] = fixedCostConcepts({
      months: monthsInRange('2026-04-01', '2026-09-07'),
      fixedCosts: [{ id: 'alq', name: 'Alquiler', active: true, benchmark_key: 'ocupacion' }],
      rates: [
        { fixed_cost_id: 'alq', monthly_amount: 347203, effective_from: '2000-01-01' },
        { fixed_cost_id: 'alq', monthly_amount: 550000, effective_from: '2026-04-01' },
        { fixed_cost_id: 'alq', monthly_amount: 600000, effective_from: '2026-09-01' },
      ],
    })
    expect(alquiler.byMonth['2026-04']).toBe(550000)
    expect(alquiler.byMonth['2026-08']).toBe(550000)
    expect(alquiler.byMonth['2026-09']).toBeCloseTo(600000 * (7 / 30))
    expect(Object.values(alquiler.byMonth).reduce((s, v) => s + v, 0)).toBeCloseTo(550000 * 5 + 140000)
  })
})
