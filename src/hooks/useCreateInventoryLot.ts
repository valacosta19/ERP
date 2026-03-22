import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

interface CreateInventoryLotPayload {
  product_id: string
  received_date: string
  initial_quantity: number
  remaining_quantity: number
  unit_cost: number
  notes?: string | null
}

export function useCreateInventoryLot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateInventoryLotPayload) => {
      const { error } = await supabase.from('inventory_lots').insert(payload)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory_lots'] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
