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
    ], ['Efectivo', 'Mercado Pago'])).toEqual([
      { payment_method: 'Efectivo', instrument: null, amount: 250, type: 'salida' },
      { payment_method: 'Mercado Pago', instrument: null, amount: 250, type: 'entrada' },
    ])
  })

  it('preserves a legacy incoming account and selects a distinct origin', () => {
    expect(normalizeInternalTransferPayments([
      { payment_method: 'Mercado Pago', instrument: null, amount: 250, type: 'entrada' },
    ], ['Efectivo', 'Mercado Pago'])).toEqual([
      { payment_method: 'Efectivo', instrument: null, amount: 250, type: 'salida' },
      { payment_method: 'Mercado Pago', instrument: null, amount: 250, type: 'entrada' },
    ])
  })

  it('uses the single leg amount rather than summing both legs', () => {
    const payments = [
      { payment_method: 'Efectivo', instrument: null, amount: 250, type: 'salida' as const },
      { payment_method: 'Mercado Pago', instrument: null, amount: 250, type: 'entrada' as const },
    ]
    expect(internalTransferAmount(payments)).toBe(250)
    expect(internalTransferValidationError(payments)).toBeNull()
  })

  it('rejects a same-account no-op and unequal legs', () => {
    expect(internalTransferValidationError([
      { payment_method: 'Efectivo', instrument: null, amount: 250, type: 'salida' },
      { payment_method: 'efectivo', instrument: null, amount: 250, type: 'entrada' },
    ])).toMatch(/distinta/)

    expect(internalTransferValidationError([
      { payment_method: 'Efectivo', instrument: null, amount: 250, type: 'salida' },
      { payment_method: 'Mercado Pago', instrument: null, amount: 200, type: 'entrada' },
    ])).toMatch(/mismo importe/)
  })
})
