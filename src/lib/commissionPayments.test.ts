import { describe, expect, it } from 'vitest'
import {
  remainingCommissionPaymentAmount,
  sumCommissionPaymentAllocations,
  validateCommissionPaymentAllocations,
  type CommissionPaymentAllocation,
} from './commissionPayments'

const payment = (
  payment_method: string,
  amount: number,
): CommissionPaymentAllocation => ({ payment_method, amount, currency: 'ARS' })

describe('commission payment allocations', () => {
  it('accepts one settlement split between Cash and Mercado Pago', () => {
    const payments = [payment('Efectivo', 252000), payment('Mercado Pago', 658800)]

    expect(sumCommissionPaymentAllocations(payments)).toBe(910800)
    expect(remainingCommissionPaymentAmount(payments, 910800)).toBe(0)
    expect(validateCommissionPaymentAllocations(payments, 910800)).toBeNull()
  })

  it('rejects totals that differ from the net payable amount', () => {
    const payments = [payment('Efectivo', 250000), payment('Mercado Pago', 650000)]

    expect(remainingCommissionPaymentAmount(payments, 910800)).toBe(10800)
    expect(validateCommissionPaymentAllocations(payments, 910800)).toBe(
      'La suma de los métodos debe coincidir con el neto a pagar.',
    )
  })

  it('rejects duplicate methods and non-positive rows', () => {
    expect(validateCommissionPaymentAllocations([
      payment('Efectivo', 500),
      payment(' efectivo ', 500),
    ], 1000)).toBe('No repitas un método de pago.')
    expect(validateCommissionPaymentAllocations([payment('Efectivo', 0)], 1000)).toBe(
      'Cada importe debe ser mayor que cero.',
    )
  })
})
