import type { PaymentDirection, TransactionPaymentInput } from '@/types'

const DIRECTIONS: PaymentDirection[] = ['salida', 'entrada']

export function isInternalTransferCategory(
  category: { name?: string | null; transaction_type?: string | null } | null | undefined,
): boolean {
  return category?.transaction_type === 'transfer'
    && category.name?.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-AR') === 'transferencia interna'
}

function positiveAmount(payments: TransactionPaymentInput[]): number {
  return payments.find(payment => Number(payment.amount) > 0)?.amount ?? 0
}

function fallbackMethod(methods: string[], excluded: string): string {
  const excludedKey = excluded.toLocaleLowerCase()
  return methods.find(method => method.toLocaleLowerCase() !== excludedKey) ?? ''
}

export function normalizeInternalTransferPayments(
  payments: TransactionPaymentInput[],
  activeMethods: string[],
): TransactionPaymentInput[] {
  const amount = positiveAmount(payments)
  const byDirection = new Map<PaymentDirection, TransactionPaymentInput>()

  for (const payment of payments) {
    if (payment.type && DIRECTIONS.includes(payment.type) && !byDirection.has(payment.type)) {
      byDirection.set(payment.type, payment)
    }
  }

  const untyped = payments.filter(payment => !payment.type)
  const origin = byDirection.get('salida') ?? untyped[0]
  const destination = byDirection.get('entrada') ?? untyped[1]
  const originMethod = origin?.payment_method
    ?? fallbackMethod(activeMethods, destination?.payment_method ?? '')
  const destinationMethod = destination?.payment_method ?? fallbackMethod(activeMethods, originMethod)

  return [
    {
      payment_method: originMethod,
      instrument: origin?.instrument ?? null,
      amount,
      type: 'salida',
    },
    {
      payment_method: destinationMethod,
      instrument: destination?.instrument ?? null,
      amount,
      type: 'entrada',
    },
  ]
}

export function internalTransferAmount(payments: TransactionPaymentInput[]): number {
  return payments.find(payment => payment.type === 'salida')?.amount
    ?? payments.find(payment => Number(payment.amount) > 0)?.amount
    ?? 0
}

export function internalTransferValidationError(payments: TransactionPaymentInput[]): string | null {
  if (payments.length !== 2) return 'La transferencia debe tener una cuenta de origen y una de destino.'

  const origin = payments.find(payment => payment.type === 'salida')
  const destination = payments.find(payment => payment.type === 'entrada')
  if (!origin || !destination) return 'La transferencia debe tener una salida y una entrada.'
  if (!origin.payment_method.trim() || !destination.payment_method.trim()) {
    return 'Seleccioná la cuenta de origen y la cuenta de destino.'
  }
  if (origin.payment_method.toLocaleLowerCase() === destination.payment_method.toLocaleLowerCase()) {
    return 'La cuenta de destino debe ser distinta de la cuenta de origen.'
  }
  if (origin.amount <= 0 || destination.amount <= 0 || origin.amount !== destination.amount) {
    return 'La salida y la entrada deben tener el mismo importe mayor que cero.'
  }
  return null
}
