import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

interface UpdateInventoryLotPayload {
  id: string
  received_date?: string
  initial_quantity?: number
  remaining_quantity?: number
  unit_cost?: number
  notes?: string | null
}

export function useUpdateInventoryLot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: UpdateInventoryLotPayload) => {
      const { error } = await supabase
        .from('inventory_lots')
        .update(fields)
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory_lots'] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
