/* eslint-disable react-hooks/rules-of-hooks */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: { op: string; args: unknown[] }[] = []

function chain() {
  const self: Record<string, unknown> = {}
  for (const m of ['insert', 'select', 'single']) {
    self[m] = (...args: unknown[]) => {
      calls.push({ op: m, args })
      return m === 'single' ? Promise.resolve({ data: { id: 'r1' }, error: null }) : self
    }
  }
  return self
}

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => chain(),
    rpc: (...args: unknown[]) => {
      calls.push({ op: 'rpc', args })
      return Promise.resolve({ data: 'r1', error: null })
    },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
  },
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: unknown) => opts,
  useMutation: (opts: unknown) => opts,
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}))

import { useCreateReceivable } from './useReceivables'

type Payload = {
  debtor_name: string
  concept: string
  total_amount: number
  currency: 'ARS'
  due_date: string | null
  notes: string | null
  payout?: { payment_method: string; date: string; client_uuid: string }
}

function run(payload: Payload) {
  const hook = useCreateReceivable() as unknown as { mutationFn: (v: Payload) => Promise<unknown> }
  return hook.mutationFn(payload)
}

const base = {
  debtor_name: 'Valentina',
  concept: 'Préstamo para mueble',
  total_amount: 690000,
  currency: 'ARS' as const,
  due_date: '2026-10-01',
  notes: null,
}

beforeEach(() => {
  calls.length = 0
})

describe('useCreateReceivable', () => {
  it('inserts the receivable without touching any account when no payout is given', async () => {
    await run({ ...base })
    expect(calls.some(c => c.op === 'rpc')).toBe(false)
    const insert = calls.find(c => c.op === 'insert')!
    expect(insert.args[0]).toMatchObject({
      debtor_name: 'Valentina',
      total_amount: 690000,
      currency: 'ARS',
      collected_amount: 0,
      due_date: '2026-10-01',
      created_by: 'u1',
    })
  })

  it('calls the RPC that also records the cash outflow when a payout is given', async () => {
    await run({ ...base, payout: { payment_method: 'Efectivo', date: '2026-09-01', client_uuid: 'uuid-1' } })
    expect(calls.some(c => c.op === 'insert')).toBe(false)
    const rpc = calls.find(c => c.op === 'rpc')!
    expect(rpc.args[0]).toBe('create_receivable_with_payout')
    expect(rpc.args[1]).toEqual({
      p_client_uuid: 'uuid-1',
      p_debtor_name: 'Valentina',
      p_concept: 'Préstamo para mueble',
      p_amount: 690000,
      p_currency: 'ARS',
      p_payment_method: 'Efectivo',
      p_date: '2026-09-01',
      p_due_date: '2026-10-01',
      p_notes: null,
      p_created_by: 'u1',
    })
  })

  it('reuses the same client_uuid on a retry so the outflow is not duplicated', async () => {
    const payload = { ...base, payout: { payment_method: 'Efectivo', date: '2026-09-01', client_uuid: 'uuid-1' } }
    await run(payload)
    await run(payload)
    const uuids = calls.filter(c => c.op === 'rpc').map(c => (c.args[1] as { p_client_uuid: string }).p_client_uuid)
    expect(uuids).toEqual(['uuid-1', 'uuid-1'])
  })
})
