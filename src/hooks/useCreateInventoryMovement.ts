import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

interface CreateInventoryMovementPayload {
  lot_id: string
  product_id: string
  quantity: number
  unit_cost: number
  reason?: string | null
}

export function useCreateInventoryMovement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ lot_id, product_id, quantity, unit_cost, reason }: CreateInventoryMovementPayload) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('inventory_movements')
        .insert({
          lot_id,
          product_id,
          movement_type: 'adjustment',
          quantity,
          unit_cost,
          reason: reason || null,
          reference_type: 'manual_adjustment',
          created_by: user?.id ?? null,
        })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['inventory_lots'] })
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
