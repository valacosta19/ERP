import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

interface ReorderSuggestion {
  suggested_quantity: number
  avg_same_month: number
  growth_rate: number
  months_with_data: number
}

export function useReorderSuggestion(productId: string | null, orderDate: string) {
  const [year, month] = orderDate.split('-').map(Number)

  return useQuery<ReorderSuggestion | null>({
    queryKey: ['reorder-suggestion', productId, year, month],
    enabled: !!productId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('suggest_reorder_quantity', {
        p_product_id: productId!,
        p_order_month: month,
        p_order_year: year,
      })
      if (error) throw new Error(error.message)
      return (data as ReorderSuggestion[])[0] ?? null
    },
  })
}
