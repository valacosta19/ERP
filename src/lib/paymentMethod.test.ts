import { describe, expect, it } from 'vitest'
import { findCashPaymentMethod } from './paymentMethod'

describe('findCashPaymentMethod', () => {
  it('matches the exact normalized cash account', () => {
    expect(findCashPaymentMethod(['Mercado Pago', ' Efectivo '])).toBe(' Efectivo ')
  })

  it('does not silently select another account or a partial name', () => {
    expect(findCashPaymentMethod(['Caja sin efectivo', 'Mercado Pago'])).toBeNull()
  })
})
