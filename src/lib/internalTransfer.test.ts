import { describe, expect, it } from 'vitest'
import {
  internalTransferAmount,
  internalTransferValidationError,
  isInternalTransferCategory,
  normalizeInternalTransferPayments,
} from './internalTransfer'

describe('internal transfers', () => {
  it('distinguishes internal transfers from other single-leg movement categories', () => {
    expect(isInternalTransferCategory({ name: ' Transferencia   interna ', transaction_type: 'transfer' })).toBe(true)
    expect(isInternalTransferCategory({ name: 'Préstamos otorgados', transaction_type: 'transfer' })).toBe(false)
    expect(isInternalTransferCategory({ name: 'Transferencia interna', transaction_type: 'expense' })).toBe(false)
  })

  it('normalizes one legacy leg into explicit origin and destination legs', () => {
    expect(normalizeInternalTransferPayments([
      { payment_method: 'Efectivo', instrument: null, amount: 250, type: 'salida' },
    ], ['Efectivo', 'Mercado Pago'], 'USD')).toEqual([
      { payment_method: 'Efectivo', instrument: null, amount: 250, currency: 'USD', type: 'salida' },
      { payment_method: 'Mercado Pago', instrument: null, amount: 250, currency: 'USD', type: 'entrada' },
    ])
  })

  it('preserves a legacy incoming account and selects a distinct origin', () => {
    expect(normalizeInternalTransferPayments([
      { payment_method: 'Mercado Pago', instrument: null, amount: 250, type: 'entrada' },
    ], ['Efectivo', 'Mercado Pago'], 'ARS')).toEqual([
      { payment_method: 'Efectivo', instrument: null, amount: 250, currency: 'ARS', type: 'salida' },
      { payment_method: 'Mercado Pago', instrument: null, amount: 250, currency: 'ARS', type: 'entrada' },
    ])
  })

  it('uses the single leg amount rather than summing both legs', () => {
    const payments = [
      { payment_method: 'Efectivo', instrument: null, amount: 250, currency: 'ARS' as const, type: 'salida' as const },
      { payment_method: 'Mercado Pago', instrument: null, amount: 250, currency: 'ARS' as const, type: 'entrada' as const },
    ]
    expect(internalTransferAmount(payments)).toBe(250)
    expect(internalTransferValidationError(payments)).toBeNull()
  })

  it('rejects a same-account no-op and unequal legs', () => {
    expect(internalTransferValidationError([
      { payment_method: 'Efectivo', instrument: null, amount: 250, currency: 'ARS', type: 'salida' },
      { payment_method: 'efectivo', instrument: null, amount: 250, currency: 'ARS', type: 'entrada' },
    ])).toMatch(/distinta/)

    expect(internalTransferValidationError([
      { payment_method: 'Efectivo', instrument: null, amount: 250, currency: 'ARS', type: 'salida' },
      { payment_method: 'Mercado Pago', instrument: null, amount: 200, currency: 'ARS', type: 'entrada' },
    ])).toMatch(/mismo importe/)
  })

  it('preserves independent amounts and currencies for cross-currency transfers', () => {
    const payments = normalizeInternalTransferPayments([
      { payment_method: 'Efectivo', instrument: null, amount: 120000, currency: 'ARS', type: 'salida' },
      { payment_method: 'Mercado Pago', instrument: null, amount: 100, currency: 'USD', type: 'entrada' },
    ], ['Efectivo', 'Mercado Pago'], 'ARS')

    expect(payments[0]).toMatchObject({ amount: 120000, currency: 'ARS' })
    expect(payments[1]).toMatchObject({ amount: 100, currency: 'USD' })
    expect(internalTransferValidationError(payments)).toBeNull()
  })
})
