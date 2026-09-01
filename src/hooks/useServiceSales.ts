import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRows } from '@/lib/fetchAllRows'

export interface ServiceSalesByMonth {
  countByService: Map<string, number>
  months: number
}

export function useServiceSalesByMonth(from: string, to: string, months: number) {
  return useQuery<ServiceSalesByMonth>({
    queryKey: ['service-sales-by-month', from, to],
    queryFn: async () => {
      const rows = await fetchAllRows<{ catalog_item_id: string }>((rangeFrom, rangeTo) =>
        supabase
          .from('transactions')
          .select('catalog_item_id, transaction_categories!subcategory_id!inner(transaction_type)')
          .eq('transaction_categories.transaction_type', 'income')
          .eq('is_seña', false)
          .not('catalog_item_id', 'is', null)
          .is('voided_at', null)
          .gte('date', from)
          .lte('date', to)
          .order('id', { ascending: true })
          .range(rangeFrom, rangeTo),
      )
      const countByService = new Map<string, number>()
      for (const row of rows) {
        countByService.set(row.catalog_item_id, (countByService.get(row.catalog_item_id) ?? 0) + 1)
      }
      return { countByService, months }
    },
  })
}
