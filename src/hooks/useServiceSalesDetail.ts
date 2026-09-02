import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRows } from '@/lib/fetchAllRows'

export interface ServiceSaleRow {
  id: string
  date: string
  catalog_item_id: string
  amount: number
  seña_amount: number | null
  currency: string
  transaction_hairdressers: { hairdresser_id: string; commission_rate: number }[]
}

export function useServiceSalesDetail(from: string, to: string) {
  return useQuery<ServiceSaleRow[]>({
    queryKey: ['service-sales-detail', from, to],
    queryFn: async () => {
      const rows = await fetchAllRows<ServiceSaleRow>((rangeFrom, rangeTo) =>
        supabase
          .from('transactions')
          .select('id, date, catalog_item_id, amount, seña_amount, currency, transaction_hairdressers(hairdresser_id, commission_rate), transaction_categories!subcategory_id!inner(transaction_type)')
          .eq('transaction_categories.transaction_type', 'income')
          .eq('is_seña', false)
          .not('catalog_item_id', 'is', null)
          .is('voided_at', null)
          .gte('date', from)
          .lte('date', to)
          .order('id', { ascending: true })
          .range(rangeFrom, rangeTo),
      )
      return rows.map(row => ({
        id: row.id,
        date: row.date,
        catalog_item_id: row.catalog_item_id,
        amount: row.amount,
        seña_amount: row.seña_amount,
        currency: row.currency,
        transaction_hairdressers: row.transaction_hairdressers ?? [],
      }))
    },
  })
}
