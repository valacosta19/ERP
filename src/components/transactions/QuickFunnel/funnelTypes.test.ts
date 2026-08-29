import { describe, it, expect } from 'vitest'
import { chargeTotal, makeEmptyFunnelState, type CartLine, type FunnelState } from './funnelTypes'

function line(kind: CartLine['kind'], unitPrice: number): CartLine {
  return { key: `${kind}-${unitPrice}`, kind, name: kind, unitPrice, qty: 1, catalogItemId: null, productId: null, subcategoryId: null, professionals: [] }
}

function state(lines: CartLine[], anticipoAmount: number): FunnelState {
  return { ...makeEmptyFunnelState(), type: 'income', incomeMode: 'cart', lines, anticipoAmount }
}

describe('chargeTotal', () => {
  it('deducts the anticipo when the cart has a service', () => {
    expect(chargeTotal(state([line('service', 50000), line('product', 11000)], 20000))).toBe(41000)
  })

  it('ignores the anticipo when the cart has no service', () => {
    expect(chargeTotal(state([line('product', 11000)], 5000))).toBe(11000)
  })

  it('never goes below zero', () => {
    expect(chargeTotal(state([line('service', 50000)], 80000))).toBe(0)
  })
})
