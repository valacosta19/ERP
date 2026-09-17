export type MonthCoverage = { month: string; coverage: number }

export type ExpenseShareTrend = 'up' | 'down' | 'flat' | 'unknown'

export type ExpenseShareRow = {
  id: string
  name: string
  total: number
  currentPct: number | null
  baselinePct: number | null
  deltaPp: number | null
  trend: ExpenseShareTrend
  flagged: boolean
}

export type ExpenseShareConcept = {
  id: string
  name: string
  benchmarkKey: string | null
  byMonth: Record<string, number>
}

const FLAG_THRESHOLD_PP = 2
const TREND_THRESHOLD_PP = 0.5

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

export function monthsInRange(from: string, to: string): MonthCoverage[] {
  if (from > to) return []
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  const out: MonthCoverage[] = []
  let year = fromYear
  let month = fromMonth
  while (year * 12 + month <= toYear * 12 + toMonth) {
    const total = daysInMonth(year, month)
    const firstCovered = year === fromYear && month === fromMonth ? fromDay : 1
    const lastCovered = year === toYear && month === toMonth ? Math.min(toDay, total) : total
    out.push({
      month: `${year}-${String(month).padStart(2, '0')}`,
      coverage: (lastCovered - firstCovered + 1) / total,
    })
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return out
}

export function resolveRateForMonth(
  rates: { monthly_amount: number; effective_from: string }[],
  month: string,
): number | null {
  let best: { monthly_amount: number; effective_from: string } | null = null
  for (const rate of rates) {
    if (rate.effective_from.slice(0, 7) > month) continue
    if (best === null || rate.effective_from > best.effective_from) best = rate
  }
  return best === null ? null : best.monthly_amount
}

export function buildExpenseShareRows(input: {
  months: MonthCoverage[]
  incomeByMonth: Record<string, number>
  concepts: ExpenseShareConcept[]
}): ExpenseShareRow[] {
  const usableMonths = input.months.filter(m => (input.incomeByMonth[m.month] ?? 0) > 0)

  return input.concepts
    .map(concept => {
      const total = input.months.reduce((sum, m) => sum + (concept.byMonth[m.month] ?? 0), 0)
      const pcts = usableMonths.map(m => ({
        month: m.month,
        pct: ((concept.byMonth[m.month] ?? 0) / input.incomeByMonth[m.month]) * 100,
      }))

      const current = pcts.length > 0 ? pcts[pcts.length - 1].pct : null
      const previous = pcts.slice(0, -1)
      const baseline = previous.length > 0 ? previous.reduce((s, p) => s + p.pct, 0) / previous.length : null
      const deltaPp = current !== null && baseline !== null ? current - baseline : null

      let trend: ExpenseShareTrend = 'unknown'
      if (deltaPp !== null) {
        if (deltaPp >= TREND_THRESHOLD_PP) trend = 'up'
        else if (deltaPp <= -TREND_THRESHOLD_PP) trend = 'down'
        else trend = 'flat'
      }

      return {
        id: concept.id,
        name: concept.name,
        total,
        currentPct: current,
        baselinePct: baseline,
        deltaPp,
        trend,
        flagged: deltaPp !== null && deltaPp >= FLAG_THRESHOLD_PP,
      }
    })
    .sort((a, b) => b.total - a.total)
}

export function fixedCostConcepts(input: {
  months: MonthCoverage[]
  fixedCosts: { id: string; name: string; active: boolean; benchmark_key: string | null }[]
  rates: { fixed_cost_id: string; monthly_amount: number; effective_from: string }[]
}): ExpenseShareConcept[] {
  const ratesByCost = new Map<string, { monthly_amount: number; effective_from: string }[]>()
  for (const rate of input.rates) {
    if (!ratesByCost.has(rate.fixed_cost_id)) ratesByCost.set(rate.fixed_cost_id, [])
    ratesByCost.get(rate.fixed_cost_id)!.push(rate)
  }

  return input.fixedCosts
    .filter(fc => fc.active)
    .map(fc => {
      const rates = ratesByCost.get(fc.id) ?? []
      const byMonth: Record<string, number> = {}
      for (const m of input.months) {
        const monthly = resolveRateForMonth(rates, m.month)
        if (monthly === null) continue
        byMonth[m.month] = monthly * m.coverage
      }
      return { id: fc.id, name: fc.name, benchmarkKey: fc.benchmark_key ?? null, byMonth }
    })
}

export type BenchmarkVerdict = 'below' | 'within' | 'above' | 'unknown'

export type BenchmarkRow = {
  key: string
  label: string
  description: string | null
  minPct: number
  maxPct: number
  realTotal: number
  realPct: number | null
  budgetTotal: number
  budgetPct: number | null
  verdict: BenchmarkVerdict
  overByPp: number | null
}

export function sumByBenchmarkKey(
  concepts: { benchmarkKey: string | null; byMonth: Record<string, number> }[],
  months: MonthCoverage[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const concept of concepts) {
    if (!concept.benchmarkKey) continue
    const total = months.reduce((sum, m) => sum + (concept.byMonth[m.month] ?? 0), 0)
    out[concept.benchmarkKey] = (out[concept.benchmarkKey] ?? 0) + total
  }
  return out
}

export function buildBenchmarkRows(input: {
  totalIncome: number
  benchmarks: { key: string; label: string; description: string | null; min_pct: number; max_pct: number }[]
  realByKey: Record<string, number>
  budgetByKey: Record<string, number>
}): BenchmarkRow[] {
  return input.benchmarks.map(b => {
    const realTotal = input.realByKey[b.key] ?? 0
    const budgetTotal = input.budgetByKey[b.key] ?? 0
    const hasIncome = input.totalIncome > 0
    const realPct = hasIncome ? (realTotal / input.totalIncome) * 100 : null
    const budgetPct = hasIncome ? (budgetTotal / input.totalIncome) * 100 : null

    let verdict: BenchmarkVerdict = 'unknown'
    let overByPp: number | null = null
    if (realPct !== null && realTotal > 0) {
      if (realPct > b.max_pct) {
        verdict = 'above'
        overByPp = realPct - b.max_pct
      } else if (realPct < b.min_pct) {
        verdict = 'below'
      } else {
        verdict = 'within'
      }
    }

    return {
      key: b.key,
      label: b.label,
      description: b.description,
      minPct: b.min_pct,
      maxPct: b.max_pct,
      realTotal,
      realPct,
      budgetTotal,
      budgetPct,
      verdict,
      overByPp,
    }
  })
}

export type AllocationSlice = { key: string; label: string; value: number; pct: number }

export function buildIncomeAllocation(input: {
  totalIncome: number
  costs: { key: string; label: string; value: number }[]
}): { slices: AllocationSlice[]; profit: number; profitPct: number; isLoss: boolean } {
  const totalCosts = input.costs.reduce((s, c) => s + c.value, 0)
  const profit = input.totalIncome - totalCosts
  const denominator = input.totalIncome > 0 ? input.totalIncome : 0

  const costSlices = input.costs
    .filter(c => c.value > 0)
    .map(c => ({
      key: c.key,
      label: c.label,
      value: c.value,
      pct: denominator > 0 ? (c.value / denominator) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)

  const slices =
    profit > 0
      ? [
          ...costSlices,
          {
            key: '__profit__',
            label: 'Utilidad',
            value: profit,
            pct: denominator > 0 ? (profit / denominator) * 100 : 0,
          },
        ]
      : costSlices

  return {
    slices,
    profit,
    profitPct: denominator > 0 ? (profit / denominator) * 100 : 0,
    isLoss: profit < 0,
  }
}
