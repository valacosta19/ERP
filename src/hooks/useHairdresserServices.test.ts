/* eslint-disable react-hooks/rules-of-hooks */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: { op: string; args: unknown[] }[] = []

function chain() {
  const self: Record<string, unknown> = {}
  for (const m of ['delete', 'eq', 'in', 'upsert', 'select']) {
    self[m] = (...args: unknown[]) => {
      calls.push({ op: m, args })
      return self
    }
  }
  self.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
  return self
}

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: () => chain() } }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: unknown) => opts,
  useMutation: (opts: unknown) => opts,
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}))

import { useSetHairdresserServices } from './useHairdresserServices'

type Rows = { catalog_item_id: string; commission_rate: number | null }[]

function run(hairdresser_id: string, rows: Rows) {
  const hook = useSetHairdresserServices() as unknown as { mutationFn: (v: { hairdresser_id: string; rows: Rows }) => Promise<void> }
  return hook.mutationFn({ hairdresser_id, rows })
}

beforeEach(() => {
  calls.length = 0
})

describe('useSetHairdresserServices', () => {
  it('upserts rows with a rate and deletes rows set to null in one call each', async () => {
    await run('eury', [
      { catalog_item_id: 'corte', commission_rate: 40 },
      { catalog_item_id: 'color', commission_rate: null },
      { catalog_item_id: 'rizos', commission_rate: 30 },
    ])
    const del = calls.filter(c => c.op === 'delete')
    const ins = calls.filter(c => c.op === 'in')
    const ups = calls.filter(c => c.op === 'upsert')
    expect(del).toHaveLength(1)
    expect(ins[0].args).toEqual(['catalog_item_id', ['color']])
    expect(ups).toHaveLength(1)
    expect(ups[0].args[0]).toEqual([
      { hairdresser_id: 'eury', catalog_item_id: 'corte', commission_rate: 40 },
      { hairdresser_id: 'eury', catalog_item_id: 'rizos', commission_rate: 30 },
    ])
  })

  it('skips the delete when nothing is unassigned and the upsert when nothing is assigned', async () => {
    await run('eury', [{ catalog_item_id: 'corte', commission_rate: 40 }])
    expect(calls.some(c => c.op === 'delete')).toBe(false)
    expect(calls.some(c => c.op === 'upsert')).toBe(true)

    calls.length = 0
    await run('eury', [{ catalog_item_id: 'corte', commission_rate: null }])
    expect(calls.some(c => c.op === 'delete')).toBe(true)
    expect(calls.some(c => c.op === 'upsert')).toBe(false)
  })
})
