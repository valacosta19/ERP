/* eslint-disable react-hooks/rules-of-hooks */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tables: Record<string, unknown[]> = {}

function chain(table: string) {
  const self: Record<string, unknown> = {}
  const methods = ['select', 'is', 'gte', 'order', 'eq']
  for (const m of methods) self[m] = () => self
  self.range = async (from: number, to: number) => ({ data: (tables[table] ?? []).slice(from, to + 1), error: null })
  self.then = (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? [], error: null })
  return self
}

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (table: string) => chain(table) } }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (opts: { queryFn: () => unknown }) => opts }))

import { useAnticipoBalance } from './useAnticipoBalance'

const MOV = { id: 'mov', name: 'Movimientos', parent_id: null }
const SENAS = { id: 'senas', name: 'Anticipo de señas', parent_id: 'mov' }
const DEV = { id: 'dev', name: 'Devolución anticipo', parent_id: 'mov' }
const SUELDOS = { id: 'sueldos', name: 'Anticipo de sueldos', parent_id: 'mov' }

function run() {
  return (useAnticipoBalance() as unknown as { queryFn: () => Promise<Record<string, number>> }).queryFn()
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k]
})

describe('useAnticipoBalance', () => {
  it('adds deposits, subtracts consumed señas and refunds, ignores salary advances', async () => {
    tables.transaction_categories = [MOV, SENAS, DEV, SUELDOS]
    tables.transactions = [
      { amount: 10000, currency: 'ARS', seña_amount: null, subcategory_id: 'senas', is_seña: false },
      { amount: 5000, currency: 'ARS', seña_amount: null, subcategory_id: 'senas', is_seña: false },
      { amount: 50000, currency: 'ARS', seña_amount: 10000, subcategory_id: 'servicio', is_seña: false },
      { amount: 2000, currency: 'ARS', seña_amount: null, subcategory_id: 'dev', is_seña: false },
      { amount: 99999, currency: 'ARS', seña_amount: null, subcategory_id: 'sueldos', is_seña: false },
      { amount: 3000, currency: 'ARS', seña_amount: 3000, subcategory_id: 'dev', is_seña: true },
    ]
    await expect(run()).resolves.toEqual({ ARS: 10000 + 5000 - 10000 - 2000 - 3000 })
  })

  it('keeps currencies apart', async () => {
    tables.transaction_categories = [MOV, SENAS]
    tables.transactions = [
      { amount: 100, currency: 'USD', seña_amount: null, subcategory_id: 'senas', is_seña: false },
      { amount: 1000, currency: 'ARS', seña_amount: 400, subcategory_id: 'x', is_seña: false },
    ]
    await expect(run()).resolves.toEqual({ USD: 100, ARS: -400 })
  })

  it('fails loudly when the deposit category is missing', async () => {
    tables.transaction_categories = [MOV, SUELDOS]
    tables.transactions = []
    await expect(run()).rejects.toThrow('Anticipo de señas')
  })

  it('reads past the first page', async () => {
    tables.transaction_categories = [MOV, SENAS]
    tables.transactions = Array.from({ length: 1500 }, () => ({ amount: 1, currency: 'ARS', seña_amount: null, subcategory_id: 'senas', is_seña: false }))
    await expect(run()).resolves.toEqual({ ARS: 1500 })
  })
})
