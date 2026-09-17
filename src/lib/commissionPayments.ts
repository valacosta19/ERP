export interface CommissionPaymentAllocation {
  payment_method: string
  currency: 'ARS'
  amount: number
}

const toCents = (amount: number) => Math.round(amount * 100)

export function sumCommissionPaymentAllocations(payments: CommissionPaymentAllocation[]) {
  return payments.reduce((total, payment) => total + toCents(payment.amount), 0) / 100
}

export function remainingCommissionPaymentAmount(
  payments: CommissionPaymentAllocation[],
  expectedTotal: number,
) {
  return (toCents(expectedTotal) - toCents(sumCommissionPaymentAllocations(payments))) / 100
}

export function validateCommissionPaymentAllocations(
  payments: CommissionPaymentAllocation[],
  expectedTotal: number,
): string | null {
  const expectedCents = toCents(expectedTotal)

  if (expectedCents === 0) {
    return payments.length === 0
      ? null
      : 'No agregues métodos de pago cuando la liquidación queda cubierta por retiros.'
  }

  if (payments.length === 0) return 'Agregá al menos un método de pago.'

  const methods = new Set<string>()
  for (const payment of payments) {
    const method = payment.payment_method.trim()
    if (!method) return 'Seleccioná un método para cada importe.'
    if (payment.currency !== 'ARS') return 'Las comisiones solo se pueden liquidar en ARS.'
    if (!Number.isFinite(payment.amount) || toCents(payment.amount) <= 0) {
      return 'Cada importe debe ser mayor que cero.'
    }

    const normalizedMethod = method.toLocaleLowerCase('es-AR')
    if (methods.has(normalizedMethod)) return 'No repitas un método de pago.'
    methods.add(normalizedMethod)
  }

  const totalCents = toCents(sumCommissionPaymentAllocations(payments))
  if (totalCents !== expectedCents) {
    return 'La suma de los métodos debe coincidir con el neto a pagar.'
  }

  return null
}
