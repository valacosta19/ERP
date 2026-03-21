import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Json } from '@/types/database'

interface SaleLineItem {
  product_id: string
  quantity: number
  unit_sale_price: number
}

interface CreateSalePayload {
  date: string
  category_id: string | null
  description: string | null
  items: SaleLineItem[]
}

export function useCreateSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateSalePayload) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const { error } = await supabase.rpc('create_sale', {
        p_date: payload.date,
        p_category_id: payload.category_id,
        p_description: payload.description,
        p_created_by: user.id,
        p_items: payload.items as unknown as Json,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
