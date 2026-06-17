import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Currency } from '@/types'

const RECONCILE_FROM = '2026-06-01'

type CategoryRow = { id: string; name: string; parent_id: string | null }
type TxRow = { amount: number; currency: string; seña_amount: number | null; subcategory_id: string | null }

export function useAnticipoBalance() {
  return useQuery({
    queryKey: ['anticipo-balance'],
    queryFn: async () => {
      const { data: cats, error: cErr } = await supabase
        .from('transaction_categories')
        .select('id, name, parent_id')
      if (cErr) throw new Error(cErr.message)

      const categories = cats as CategoryRow[]
      const movimientos = categories.find(c => c.parent_id === null && c.name.toLowerCase() === 'movimientos')
      const anticipoIds = new Set(
        categories
          .filter(c => c.parent_id === movimientos?.id && c.name.toLowerCase() === 'anticipo')
          .map(c => c.id)
      )

      const { data, error } = await supabase
        .from('transactions')
        .select('amount, currency, seña_amount, subcategory_id')
        .is('voided_at', null)
        .gte('date', RECONCILE_FROM)
      if (error) throw new Error(error.message)

      const byCurrency: Record<string, number> = {}
      for (const row of data as unknown as TxRow[]) {
        const cur = row.currency
        byCurrency[cur] ??= 0
        if (row.subcategory_id && anticipoIds.has(row.subcategory_id)) {
          byCurrency[cur] += Number(row.amount)
        }
        if (row.seña_amount != null) {
          byCurrency[cur] -= Number(row.seña_amount)
        }
      }
      return byCurrency as Record<Currency, number>
    },
  })
}
