import type { QueryClient, QueryKey } from '@tanstack/react-query'

export const ACCOUNTING_QUERY_KEYS: QueryKey[] = [
  ['transactions'],
  ['transaction-groups'],
  ['payment-method-balances'],
  ['unrefunded-anticipos'],
  ['anticipo-balance'],
  ['reports'],
  ['dashboard-current-month'],
  ['dashboard-last-6-months'],
]

export function invalidateAccounting(qc: QueryClient, extra: QueryKey[] = []): void {
  for (const queryKey of [...ACCOUNTING_QUERY_KEYS, ...extra]) {
    qc.invalidateQueries({ queryKey })
  }
}
