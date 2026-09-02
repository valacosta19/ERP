/* eslint-disable react-hooks/rules-of-hooks */
import { describe, it, expect, vi } from 'vitest'
import type { ServiceSaleRow } from './useServiceSalesDetail'

let rows: Partial<ServiceSaleRow>[] = []
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

import { useServiceSalesDetail } from './useServiceSalesDetail'

function run(from: string, to: string) {
  return useServiceSalesDetail(from, to) as unknown as { queryKey: unknown[]; queryFn: () => Promise<ServiceSaleRow[]> }
}

describe('useServiceSalesDetail', () => {
  it('returns income service transactions with their professionals inside the range', async () => {
    rows = [
      { id: 't1', date: '2026-09-02', catalog_item_id: 'corte', amount: 50000, seña_amount: null, currency: 'ARS', transaction_hairdressers: [{ hairdresser_id: 'e', commission_rate: 40 }] },
      { id: 't2', date: '2026-09-03', catalog_item_id: 'color', amount: 100, seña_amount: 20, currency: 'USD' },
    ]
    const result = await run('2026-09-01', '2026-09-30').queryFn()
    expect(result).toEqual([
      { id: 't1', date: '2026-09-02', catalog_item_id: 'corte', amount: 50000, seña_amount: null, currency: 'ARS', transaction_hairdressers: [{ hairdresser_id: 'e', commission_rate: 40 }] },
      { id: 't2', date: '2026-09-03', catalog_item_id: 'color', amount: 100, seña_amount: 20, currency: 'USD', transaction_hairdressers: [] },
    ])
    expect(filters.find(f => f.op === 'gte')?.args).toEqual(['date', '2026-09-01'])
    expect(filters.find(f => f.op === 'lte')?.args).toEqual(['date', '2026-09-30'])
    expect(filters.find(f => f.op === 'is')?.args).toEqual(['voided_at', null])
    expect(filters.filter(f => f.op === 'eq').map(f => f.args)).toEqual([
      ['transaction_categories.transaction_type', 'income'],
      ['is_seña', false],
    ])
  })

  it('keys the query by the date range', () => {
    expect(run('2026-09-01', '2026-09-30').queryKey).toEqual(['service-sales-detail', '2026-09-01', '2026-09-30'])
  })
})
