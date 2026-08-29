import { describe, it, expect } from 'vitest'
import type { TransactionCategory } from '@/types'
import { buildTicket } from './buildTicket'
import { makeEmptyFunnelState, type CartLine, type FunnelState } from './funnelTypes'

const INGRESOS: TransactionCategory = { id: 'cat-ingresos', name: 'Ingresos', parent_id: null, transaction_type: 'income', deducts_inventory: false, created_at: '' }
const SERVICIO: TransactionCategory = { id: 'cat-servicio', name: 'Servicio', parent_id: 'cat-ingresos', transaction_type: 'income', deducts_inventory: false, created_at: '' }
const PRODUCTO: TransactionCategory = { id: 'cat-producto', name: 'Producto', parent_id: 'cat-ingresos', transaction_type: 'income', deducts_inventory: false, created_at: '' }
const ctx = { categories: [INGRESOS, SERVICIO, PRODUCTO] }

function line(kind: CartLine['kind'], name: string, unitPrice: number): CartLine {
  return { key: name, kind, name, unitPrice, qty: 1, catalogItemId: kind === 'service' ? `ci-${name}` : null, productId: kind === 'product' ? `p-${name}` : null, subcategoryId: null, professionals: [] }
}

function cartState(lines: CartLine[], patch: Partial<FunnelState> = {}): FunnelState {
  const total = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0)
  return { ...makeEmptyFunnelState(), type: 'income', incomeMode: 'cart', lines, payments: [{ payment_method: 'Santander', amount: total, received: null }], ...patch }
}

describe('buildTicket group_label', () => {
  it('joins line names with " + " for a cart', () => {
    const ticket = buildTicket(cartState([line('service', 'Corte', 50000), line('product', 'Shampoo', 11000)]), ctx)
    expect(ticket.group_label).toBe('Corte + Shampoo')
  })

  it('collapses lines beyond the third into "+ N más"', () => {
    const ticket = buildTicket(cartState([line('service', 'A', 1000), line('service', 'B', 1000), line('service', 'C', 1000), line('product', 'D', 1000), line('product', 'E', 1000)]), ctx)
    expect(ticket.group_label).toBe('A + B + C + 2 más')
  })

  it('leaves the tip out of the label but keeps it as a unit', () => {
    const state = cartState([line('service', 'Corte', 50000), line('product', 'Shampoo', 11000)], { tipEnabled: true, tipAmount: 2000, payments: [{ payment_method: 'Santander', amount: 63000, received: null }] })
    const ticket = buildTicket(state, ctx)
    expect(ticket.group_label).toBe('Corte + Shampoo')
    expect(ticket.units.map(u => u.kind)).toEqual(['service', 'product', 'tip'])
    expect(ticket.units.reduce((s, u) => s + u.payments.reduce((ps, p) => ps + p.amount, 0), 0)).toBe(63000)
  })

  it('is null for a simple ticket', () => {
    const state: FunnelState = { ...makeEmptyFunnelState(), type: 'expense', subcategoryId: 'x', manualAmount: 500 }
    expect(buildTicket(state, ctx).group_label).toBeNull()
    expect(buildTicket(state, ctx).units).toHaveLength(1)
  })
})

describe('buildTicket anticipo', () => {
  it('records the seña on the first service line and reduces its charge', () => {
    const state = cartState([line('product', 'Shampoo', 11000), line('service', 'Corte', 50000)], { anticipoAmount: 20000, payments: [{ payment_method: 'Santander', amount: 41000, received: null }] })
    const ticket = buildTicket(state, ctx)
    expect(ticket.units[0].sena_amount).toBeNull()
    expect(ticket.units[1].sena_amount).toBe(20000)
    expect(ticket.units[1].payments[0].amount).toBe(30000)
    expect(ticket.units[0].payments[0].amount).toBe(11000)
  })

  it('a service fully covered by the seña carries no payments and keeps the seña', () => {
    const state = cartState([line('service', 'Corte', 50000)], { anticipoAmount: 50000, payments: [] })
    const ticket = buildTicket(state, ctx)
    expect(ticket.units[0].payments).toEqual([])
    expect(ticket.units[0].sena_amount).toBe(50000)
  })

  it('ignores the anticipo on a cart without a service line', () => {
    const state = cartState([line('product', 'Shampoo', 11000)], { anticipoAmount: 5000 })
    const ticket = buildTicket(state, ctx)
    expect(ticket.units[0].sena_amount).toBeNull()
    expect(ticket.units[0].payments[0].amount).toBe(11000)
  })
})
