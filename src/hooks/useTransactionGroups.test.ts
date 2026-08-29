import { describe, it, expect, vi, beforeEach } from 'vitest'

const groupInsert = vi.fn()
const memberInsert = vi.fn()
const groupDelete = vi.fn()

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => ({
      insert: (rows: unknown) => {
        if (table === 'transaction_groups') {
          return { select: () => ({ single: async () => groupInsert(rows) }) }
        }
        return memberInsert(rows)
      },
      delete: () => ({ eq: async (...args: unknown[]) => groupDelete(...args) }),
    }),
  },
}))

vi.mock('@/lib/fetchAllRows', () => ({ fetchAllRows: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}))

import { createTransactionGroup } from './useTransactionGroups'

beforeEach(() => {
  groupInsert.mockReset().mockResolvedValue({ data: { id: 'group-1' }, error: null })
  memberInsert.mockReset().mockResolvedValue({ error: null })
  groupDelete.mockReset().mockResolvedValue({ error: null })
})

describe('createTransactionGroup', () => {
  it('rejects fewer than two transactions before touching the database', async () => {
    await expect(createTransactionGroup({ label: 'x', currency: 'ARS', transactionIds: ['a'] })).rejects.toThrow('al menos dos')
    expect(groupInsert).not.toHaveBeenCalled()
  })

  it('inserts the group then one membership per transaction', async () => {
    const id = await createTransactionGroup({ label: 'Corte + Shampoo', currency: 'ARS', transactionIds: ['a', 'b'] })
    expect(id).toBe('group-1')
    expect(groupInsert).toHaveBeenCalledWith({ label: 'Corte + Shampoo', currency: 'ARS', created_by: 'user-1' })
    expect(memberInsert).toHaveBeenCalledWith([
      { group_id: 'group-1', transaction_id: 'a' },
      { group_id: 'group-1', transaction_id: 'b' },
    ])
  })

  it('deletes the group when the membership insert fails', async () => {
    memberInsert.mockResolvedValue({ error: { message: 'un grupo no puede mezclar monedas' } })
    await expect(createTransactionGroup({ label: 'x', currency: 'ARS', transactionIds: ['a', 'b'] })).rejects.toThrow('mezclar monedas')
    expect(groupDelete).toHaveBeenCalledWith('id', 'group-1')
  })
})
