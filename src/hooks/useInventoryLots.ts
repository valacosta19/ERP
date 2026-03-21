import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { InventoryLot } from '@/types'

export function useInventoryLots(productId: string | null) {
  return useQuery({
    queryKey: ['inventory_lots', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_lots')
        .select('*')
        .eq('product_id', productId!)
        .order('received_date', { ascending: true })
      if (error) throw new Error(error.message)
      return data as InventoryLot[]
    },
    enabled: !!productId,
  })
}
