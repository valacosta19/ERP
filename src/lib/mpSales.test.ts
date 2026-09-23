import { describe, expect, it } from 'vitest'
import { buildPublishMpSalesInput, groupMpMovementsByDate, mpSalesBalance, mpTicketLabel, validateMpSalesDraft } from './mpSales'
import type { MpSaleDraftTicket } from '@/types'

const service = (overrides: Partial<MpSaleDraftTicket['lines'][number]> = {}) => ({
  key: crypto.randomUUID(), clientUuid: crypto.randomUUID(), kind: 'service' as const,
  description: 'Corte', catalogItemId: 'service-1', productId: null,
  quantity: 1, unitPrice: 30000,
  professionals: [{ id: 'professional-1', commissionRate: 40 }], withoutProfessional: false,
  ...overrides,
})
const ticket = (...lines: MpSaleDraftTicket['lines']): MpSaleDraftTicket => ({ clientUuid: crypto.randomUUID(), lines })

describe('Mercado Pago sale draft', () => {
  it('balances the locked MP amount with an additional payment', () => {
    expect(mpSalesBalance(50000, [ticket(service(), service({ description: 'Color', unitPrice: 40000 }))], [{ paymentMethod: 'Efectivo', amount: 20000 }])).toEqual({
      mpAmount: 50000, saleTotal: 70000, unassigned: 0, requiredAdditional: 20000,
      additionalTotal: 20000, paymentDifference: 0, balanced: true,
    })
  })

  it('blocks an under-assigned movement', () => {
    expect(validateMpSalesDraft(50000, [ticket(service())], [])).toContain('Faltan asignar')
  })

  it('requires an explicit no-professional acknowledgement', () => {
    expect(validateMpSalesDraft(30000, [ticket(service({ professionals: [] }))], [])).toContain('Elegí un profesional')
    expect(validateMpSalesDraft(30000, [ticket(service({ professionals: [], withoutProfessional: true }))], [])).toBeNull()
  })

  it('keeps repeated services as independent occurrences in the RPC payload', () => {
    const tickets = [ticket(service(), service())]
    const payload = buildPublishMpSalesInput('movement-1', 'request-1', tickets, [{ paymentMethod: 'Efectivo', amount: 10000 }])
    expect(payload.tickets[0].lines).toHaveLength(2)
    expect(payload.tickets[0].lines.every(line => line.quantity === 1)).toBe(true)
    expect(mpTicketLabel(tickets[0])).toBe('Corte + Corte')
  })

  it('groups the daily queue newest date first without reordering a day', () => {
    const rows = [
      { id: 'old', occurred_at: '2026-09-21T15:00:00Z' },
      { id: 'new-a', occurred_at: '2026-09-23T14:00:00Z' },
      { id: 'new-b', occurred_at: '2026-09-23T12:00:00Z' },
    ]
    expect(groupMpMovementsByDate(rows).map(group => [group.date, group.rows.map(row => row.id)])).toEqual([
      ['2026-09-23', ['new-a', 'new-b']],
      ['2026-09-21', ['old']],
    ])
  })
})
