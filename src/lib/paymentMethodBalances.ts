import type { Currency, PaymentMethod } from '@/types'

export type PaymentMethodBalanceRow = {
  payment_method: PaymentMethod
  amount: number
  currency: Currency | null
  type: string
  transactions: { currency: Currency; voided_at: string | null; date: string }
}

export function summarizePaymentMethodBalances(rows: PaymentMethodBalanceRow[]) {
  const methodKeySet = [...new Set(rows.map(row => row.payment_method.toLocaleLowerCase()))].sort()

  return methodKeySet.map(methodKey => {
    const subset = rows.filter(row => row.payment_method.toLocaleLowerCase() === methodKey)
    const displayName = subset[0].payment_method
    const currencySet = [...new Set(subset.map(row => row.currency ?? row.transactions.currency))].sort()
    const currencies = currencySet.map(currency => ({
      currency,
      balance: subset
        .filter(row => (row.currency ?? row.transactions.currency) === currency)
        .reduce((sum, row) => sum + (row.type === 'entrada' ? row.amount : -row.amount), 0),
    }))

    return { method: displayName, currencies }
  })
}
