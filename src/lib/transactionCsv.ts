import type { Currency } from '@/types'
import type { TransactionCashMovement } from './transactionCashFlow'

type OpeningBalances = Partial<Record<Currency, number>>

const CURRENCIES: Currency[] = ['ARS', 'USD', 'EUR']

function formatNumber(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

function escapeCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function buildTransactionCsv(
  movements: TransactionCashMovement[],
  openingBalances: OpeningBalances,
  selectedCurrency?: Currency,
): string {
  const included = movements.filter(movement => !selectedCurrency || movement.currency === selectedCurrency)
  const currencies = selectedCurrency
    ? [selectedCurrency]
    : CURRENCIES.filter(currency => openingBalances[currency] !== undefined
      || included.some(movement => movement.currency === currency))
  const runningBalances = new Map<Currency, number>(
    currencies.map(currency => [currency, openingBalances[currency] ?? 0]),
  )
  const credits = new Map<Currency, number>(currencies.map(currency => [currency, 0]))
  const debits = new Map<Currency, number>(currencies.map(currency => [currency, 0]))

  const rows = included.map(movement => {
    const currency = movement.currency as Currency
    const signed = movement.type === 'entrada' ? movement.amount : -movement.amount
    const balance = (runningBalances.get(currency) ?? 0) + signed
    runningBalances.set(currency, balance)
    if (movement.type === 'entrada') credits.set(currency, (credits.get(currency) ?? 0) + movement.amount)
    else debits.set(currency, (debits.get(currency) ?? 0) - movement.amount)

    return [
      movement.date,
      escapeCell(movement.description ?? ''),
      escapeCell(movement.paymentMethod),
      currency,
      formatNumber(signed),
      formatNumber(balance),
    ].join(';')
  })

  const summary = [
    'MONEDA;BALANCE_INICIAL;CREDITOS;DEBITOS;BALANCE_FINAL',
    ...currencies.map(currency => [
      currency,
      formatNumber(openingBalances[currency] ?? 0),
      formatNumber(credits.get(currency) ?? 0),
      formatNumber(debits.get(currency) ?? 0),
      formatNumber(runningBalances.get(currency) ?? 0),
    ].join(';')),
  ]
  const header = 'FECHA;DESCRIPCION;METODO_PAGO;MONEDA;MONTO_NETO;BALANCE_PARCIAL'

  return [...summary, '', header, ...rows].join('\n')
}
