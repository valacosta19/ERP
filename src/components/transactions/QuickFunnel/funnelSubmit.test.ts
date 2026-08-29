import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const memberCount = vi.fn()
const createGroup = vi.fn()

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({
      select: () => ({
        in: async () => memberCount(),
      }),
    }),
  },
}))

vi.mock('@/hooks/useTransactionGroups', () => ({
  createTransactionGroup: (...args: unknown[]) => createGroup(...args),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import { useFunnelSubmit, type TicketPayload, type TicketUnit } from './funnelSubmit'

function unit(kind: TicketUnit['kind'], overrides: Partial<TicketUnit> = {}): TicketUnit {
  return {
    client_uuid: `uuid-${kind}-${Math.random()}`,
    kind,
    transaction_type: 'income',
    description: kind,
    catalog_item_id: null,
    product_id: null,
    product_qty: 0,
    unit_sale_price: 0,
    subcategory_id: null,
    subcategory_name: null,
    professionals: [],
    sena_amount: null,
    payments: [{ payment_method: 'Santander', instrument: null, amount: 1000 }],
    ...overrides,
  }
}

function ticket(units: TicketUnit[], group_label: string | null = 'Corte + Shampoo'): TicketPayload {
  return { date: '2026-08-29', currency: 'ARS', group_label, units }
}

beforeEach(() => {
  rpc.mockReset()
  memberCount.mockReset()
  createGroup.mockReset()
  let n = 0
  rpc.mockImplementation(async () => ({ data: { transaction_id: `tx-${++n}` }, error: null }))
  memberCount.mockResolvedValue({ count: 0, error: null })
  createGroup.mockResolvedValue('group-1')
})

describe('submitTicket grouping', () => {
  it('creates a group with every transaction id of a multi-unit ticket', async () => {
    const { submitTicket } = useFunnelSubmit()
    await submitTicket(ticket([unit('service'), unit('product'), unit('tip')]))
    expect(createGroup).toHaveBeenCalledWith({ label: 'Corte + Shampoo', currency: 'ARS', transactionIds: ['tx-1', 'tx-2', 'tx-3'] })
  })

  it('does not create a group for a single unit', async () => {
    const { submitTicket } = useFunnelSubmit()
    await submitTicket(ticket([unit('simple')], null))
    expect(createGroup).not.toHaveBeenCalled()
  })

  it('skips group creation when any id already belongs to a group (retry)', async () => {
    memberCount.mockResolvedValue({ count: 3, error: null })
    const { submitTicket } = useFunnelSubmit()
    await submitTicket(ticket([unit('service'), unit('product')]))
    expect(createGroup).not.toHaveBeenCalled()
  })

  it('never groups staff units', async () => {
    rpc.mockResolvedValue({ data: 'receivable-id', error: null })
    const { submitTicket } = useFunnelSubmit()
    await submitTicket(ticket([unit('staff_advance', { hairdresser_id: 'h', value_amount: 100 })], null))
    expect(createGroup).not.toHaveBeenCalled()
  })
})

describe('submitTicket partial failure', () => {
  it('reports the failing unit index and that retrying is safe', async () => {
    rpc
      .mockResolvedValueOnce({ data: { transaction_id: 'tx-1' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const { submitTicket } = useFunnelSubmit()
    await expect(submitTicket(ticket([unit('service'), unit('product'), unit('tip')]))).rejects.toThrow('Unidad 2 de 3: boom — lo ya grabado no se duplica al reintentar')
    expect(createGroup).not.toHaveBeenCalled()
  })

  it('omits the retry note when the first unit fails', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const { submitTicket } = useFunnelSubmit()
    await expect(submitTicket(ticket([unit('service'), unit('product')]))).rejects.toThrow(/^Unidad 1 de 2: boom$/)
  })

  it('keeps the raw message for a single-unit ticket', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'failed to fetch' } })
    const { submitTicket } = useFunnelSubmit()
    await expect(submitTicket(ticket([unit('simple')], null))).rejects.toThrow(/^failed to fetch$/)
  })
})
