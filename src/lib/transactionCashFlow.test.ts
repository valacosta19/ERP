import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/types'
import { transactionCashMovements, transactionCashTotals } from './transactionCashFlow'

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx',
    date: '2026-09-16',
    amount: 100,
    currency: 'ARS',
    subcategory_id: null,
    catalog_item_id: null,
    description: null,
    created_by: null,
    created_at: '2026-09-16T00:00:00Z',
    is_seña: false,
    seña_amount: null,
    voided_at: null,
    voided_by: null,
    refunds_anticipo_id: null,
    product_id: null,
    ...overrides,
  }
}

describe('transaction cash flow', () => {
  it('uses payment rows instead of transaction headers', () => {
    const movements = transactionCashMovements([
      transaction({ amount: 999, payments: [
        { id: 'p1', transaction_id: 'tx', payment_method: 'Efectivo', instrument: null, amount: 60, type: 'entrada', created_at: '' },
        { id: 'p2', transaction_id: 'tx', payment_method: 'Mercado Pago', instrument: null, amount: 40, type: 'entrada', created_at: '' },
      ] }),
      transaction({ id: 'inventory', amount: 50, payments: [] }),
    ])

    expect(transactionCashTotals(movements)).toEqual({ ARS: { entrada: 100, salida: 0 } })
    expect(transactionCashTotals(transactionCashMovements([
      transaction({ payments: movements.map((movement, index) => ({
        id: `p${index}`,
        transaction_id: 'tx',
        payment_method: movement.paymentMethod,
        instrument: null,
        amount: movement.amount,
        type: movement.type,
        created_at: '',
      })) }),
    ], 'efectivo'))).toEqual({ ARS: { entrada: 60, salida: 0 } })
  })

  it('excludes voided transactions', () => {
    expect(transactionCashMovements([
      transaction({ voided_at: '2026-09-16T01:00:00Z', payments: [
        { id: 'p', transaction_id: 'tx', payment_method: 'Efectivo', instrument: null, amount: 100, type: 'entrada', created_at: '' },
      ] }),
    ])).toEqual([])
  })

  it('keeps an internal transfer net-zero while moving balance between accounts', () => {
    const movements = transactionCashMovements([
      transaction({ payments: [
        { id: 'out', transaction_id: 'tx', payment_method: 'Efectivo', instrument: null, amount: 100, type: 'salida', created_at: '' },
        { id: 'in', transaction_id: 'tx', payment_method: 'Mercado Pago', instrument: null, amount: 100, type: 'entrada', created_at: '' },
      ] }),
    ])

    expect(transactionCashTotals(movements)).toEqual({ ARS: { entrada: 100, salida: 100 } })
    expect(transactionCashTotals(transactionCashMovements([
      transaction({ payments: [
        { id: 'out', transaction_id: 'tx', payment_method: 'Efectivo', instrument: null, amount: 100, type: 'salida', created_at: '' },
        { id: 'in', transaction_id: 'tx', payment_method: 'Mercado Pago', instrument: null, amount: 100, type: 'entrada', created_at: '' },
      ] }),
    ], 'Mercado Pago'))).toEqual({ ARS: { entrada: 100, salida: 0 } })
  })
})
