import { describe, expect, it } from 'vitest'
import { buildTransactionCsv } from './transactionCsv'
import type { TransactionCashMovement } from './transactionCashFlow'

const movements: TransactionCashMovement[] = [
  { transactionId: 'out', date: '2026-09-24', description: 'Compra USD', currency: 'ARS', paymentMethod: 'Efectivo', type: 'salida', amount: 120000 },
  { transactionId: 'in', date: '2026-09-24', description: 'Compra USD', currency: 'USD', paymentMethod: 'Banco', type: 'entrada', amount: 100 },
  { transactionId: 'ars-in', date: '2026-09-25', description: 'Venta', currency: 'ARS', paymentMethod: 'Efectivo', type: 'entrada', amount: 5000 },
]

describe('transaction CSV', () => {
  it('keeps running and summary balances independent by currency', () => {
    const csv = buildTransactionCsv(movements, { ARS: 200000, USD: 20 })

    expect(csv).toContain('ARS;200000,00;5000,00;-120000,00;85000,00')
    expect(csv).toContain('USD;20,00;100,00;0,00;120,00')
    expect(csv).toContain('2026-09-24;"Compra USD";"Efectivo";ARS;-120000,00;80000,00')
    expect(csv).toContain('2026-09-24;"Compra USD";"Banco";USD;100,00;120,00')
  })

  it('includes only the selected currency in rows and summaries', () => {
    const csv = buildTransactionCsv(movements, { USD: 20 }, 'USD')

    expect(csv).toContain('USD;20,00;100,00;0,00;120,00')
    expect(csv).toContain(';USD;100,00;120,00')
    expect(csv).not.toContain(';ARS;')
  })
})
