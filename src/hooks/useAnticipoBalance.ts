import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRows } from '@/lib/fetchAllRows'
import type { Currency } from '@/types'

const RECONCILE_FROM = '2026-06-01'

type CategoryRow = { id: string; name: string; parent_id: string | null }
type TxRow = { amount: number; currency: string; seña_amount: number | null; subcategory_id: string | null; is_seña: boolean }

function normalize(name: string): string {
  return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

function findMovimientosChild(categories: CategoryRow[], prefix: string): CategoryRow | undefined {
  const movimientos = categories.find(c => c.parent_id === null && normalize(c.name) === 'movimientos')
  if (!movimientos) return undefined
  return categories.find(c => c.parent_id === movimientos.id && normalize(c.name).startsWith(prefix))
}

export function useAnticipoBalance() {
  return useQuery({
    queryKey: ['anticipo-balance'],
    queryFn: async () => {
      const { data: cats, error: cErr } = await supabase
        .from('transaction_categories')
        .select('id, name, parent_id')
      if (cErr) throw new Error(cErr.message)

      const categories = cats as CategoryRow[]
      const senaCategory = findMovimientosChild(categories, 'anticipo de senas')
      if (!senaCategory) throw new Error('No existe la subcategoría "Anticipo de señas" en Movimientos: el saldo de anticipos no puede calcularse.')
      const refundCategory = findMovimientosChild(categories, 'devolucion anticipo')

      const rows = await fetchAllRows<TxRow>((rangeFrom, rangeTo) =>
        supabase
          .from('transactions')
          .select('amount, currency, seña_amount, subcategory_id, is_seña')
          .is('voided_at', null)
          .gte('date', RECONCILE_FROM)
          .order('date', { ascending: true })
          .order('id', { ascending: true })
          .range(rangeFrom, rangeTo),
      )

      const byCurrency: Record<string, number> = {}
      for (const row of rows) {
        const cur = row.currency
        byCurrency[cur] ??= 0
        if (row.subcategory_id === senaCategory.id) {
          byCurrency[cur] += Number(row.amount)
        } else if (refundCategory && row.subcategory_id === refundCategory.id) {
          byCurrency[cur] -= Number(row.amount)
        }
        if (!row.is_seña && row.seña_amount != null) {
          byCurrency[cur] -= Number(row.seña_amount)
        }
      }
      return byCurrency as Record<Currency, number>
    },
  })
}
