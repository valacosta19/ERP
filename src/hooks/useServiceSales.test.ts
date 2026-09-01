/* eslint-disable react-hooks/rules-of-hooks */
import { describe, it, expect, vi } from 'vitest'

let rows: { catalog_item_id: string }[] = []
const filters: { op: string; args: unknown[] }[] = []

function chain() {
  const self: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'is', 'gte', 'lte', 'order']) {
    self[m] = (...args: unknown[]) => {
      filters.push({ op: m, args })
      return self
    }
  }
  self.range = async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null })
  return self
}

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: () => chain() } }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (opts: unknown) => opts }))

import { useServiceSalesByMonth } from './useServiceSales'

function run(from: string, to: string, months: number) {
  const hook = useServiceSalesByMonth(from, to, months) as unknown as {
    queryKey: unknown[]
    queryFn: () => Promise<{ countByService: Map<string, number>; months: number }>
  }
  return hook
}

describe('useServiceSalesByMonth', () => {
  it('counts income transactions per service inside the date range', async () => {
    rows = [
      { catalog_item_id: 'corte' },
      { catalog_item_id: 'corte' },
      { catalog_item_id: 'color' },
    ]
    const result = await run('2026-06-01', '2026-08-31', 3).queryFn()
    expect(result.months).toBe(3)
    expect(result.countByService.get('corte')).toBe(2)
    expect(result.countByService.get('color')).toBe(1)
    expect(filters.find(f => f.op === 'gte')?.args).toEqual(['date', '2026-06-01'])
    expect(filters.find(f => f.op === 'lte')?.args).toEqual(['date', '2026-08-31'])
    expect(filters.find(f => f.op === 'is')?.args).toEqual(['voided_at', null])
  })

  it('keys the query by the date range', () => {
    expect(run('2026-06-01', '2026-08-31', 3).queryKey).toEqual(['service-sales-by-month', '2026-06-01', '2026-08-31'])
  })
})
