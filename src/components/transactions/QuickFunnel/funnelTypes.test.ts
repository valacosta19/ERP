import { describe, it, expect } from 'vitest'
import type { TransactionCategory } from '@/types'
import { canAdvanceSimpleAmount, chargeTotal, funnelSubcategories, makeEmptyFunnelState, type CartLine, type FunnelState } from './funnelTypes'

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

describe('funnelSubcategories', () => {
  const categories: TransactionCategory[] = [
    { id: 'movements', name: 'Movimientos', parent_id: null, transaction_type: 'transfer', deducts_inventory: false, benchmark_key: null, created_at: '' },
    { id: 'adjustment', name: 'Ajuste de caja', parent_id: 'movements', transaction_type: 'transfer', deducts_inventory: false, benchmark_key: null, created_at: '' },
    { id: 'internal-transfer', name: 'Transferencia interna', parent_id: 'movements', transaction_type: 'transfer', deducts_inventory: false, benchmark_key: null, created_at: '' },
  ]

  it('offers generic movement categories and Transferencia interna in the same Movimiento path', () => {
    expect(funnelSubcategories('transfer', categories).map(category => category.name)).toEqual([
      'Ajuste de caja',
      'Transferencia interna',
    ])
  })

  it('rejects equal origin and destination accounts only for the internal-transfer category', () => {
    const state: FunnelState = {
      ...makeEmptyFunnelState(),
      type: 'transfer',
      subcategoryId: 'internal-transfer',
      manualAmount: 500,
      transferDestinationAmount: 400,
      transferDestinationCurrency: 'USD',
      simpleMethod: 'Efectivo',
      transferDestinationMethod: 'Efectivo',
    }

    expect(canAdvanceSimpleAmount(state, categories[2])).toBe(false)
    expect(canAdvanceSimpleAmount(state, categories[1])).toBe(true)
  })

  it('accepts independently entered amounts only when transfer currencies differ', () => {
    const state: FunnelState = {
      ...makeEmptyFunnelState(),
      type: 'transfer',
      subcategoryId: 'internal-transfer',
      currency: 'ARS',
      manualAmount: 120000,
      transferDestinationAmount: 100,
      transferDestinationCurrency: 'USD',
      simpleMethod: 'Efectivo',
      transferDestinationMethod: 'Mercado Pago',
    }

    expect(canAdvanceSimpleAmount(state, categories[2])).toBe(true)
    expect(canAdvanceSimpleAmount({ ...state, transferDestinationCurrency: 'ARS' }, categories[2])).toBe(false)
  })
})
