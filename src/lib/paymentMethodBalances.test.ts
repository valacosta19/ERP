import { describe, expect, it } from 'vitest'
import { summarizePaymentMethodBalances, type PaymentMethodBalanceRow } from './paymentMethodBalances'

function row(patch: Partial<PaymentMethodBalanceRow>): PaymentMethodBalanceRow {
  return {
    payment_method: 'Efectivo',
    amount: 100,
    currency: null,
    type: 'entrada',
    transactions: { currency: 'ARS', voided_at: null, date: '2026-09-24' },
    ...patch,
  }
}

describe('payment method balances', () => {
  it('uses each leg currency and falls back to the parent for legacy rows', () => {
    expect(summarizePaymentMethodBalances([
      row({ amount: 120000, currency: 'ARS', type: 'salida' }),
      row({ payment_method: 'Mercado Pago', amount: 100, currency: 'USD', type: 'entrada' }),
      row({ amount: 500, currency: null, type: 'entrada' }),
    ])).toEqual([
      { method: 'Efectivo', currencies: [{ currency: 'ARS', balance: -119500 }] },
      { method: 'Mercado Pago', currencies: [{ currency: 'USD', balance: 100 }] },
    ])
  })
})
