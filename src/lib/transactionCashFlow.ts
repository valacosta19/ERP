import type { Transaction } from '@/types'

export interface TransactionCashMovement {
  transactionId: string
  date: string
  description: string | null
  currency: string
  paymentMethod: string
  type: 'entrada' | 'salida'
  amount: number
}

export function transactionCashMovements(
  transactions: Transaction[],
  paymentMethod?: string,
): TransactionCashMovement[] {
  const normalizedMethod = paymentMethod?.toLocaleLowerCase()

  return transactions
    .filter(transaction => !transaction.voided_at)
    .flatMap(transaction => (transaction.payments ?? [])
      .filter(payment => !normalizedMethod || payment.payment_method.toLocaleLowerCase() === normalizedMethod)
      .filter(payment => payment.type === 'entrada' || payment.type === 'salida')
      .map(payment => ({
        transactionId: transaction.id,
        date: transaction.date,
        description: transaction.description,
        currency: transaction.currency,
        paymentMethod: payment.payment_method,
        type: payment.type as 'entrada' | 'salida',
        amount: payment.amount,
      })))
}

export function transactionCashTotals(movements: TransactionCashMovement[]) {
  return movements.reduce((totals, movement) => {
    if (!totals[movement.currency]) totals[movement.currency] = { entrada: 0, salida: 0 }
    totals[movement.currency][movement.type] += movement.amount
    return totals
  }, {} as Record<string, { entrada: number; salida: number }>)
}
