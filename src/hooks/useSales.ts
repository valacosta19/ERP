import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

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

      const total = payload.items.reduce(
        (sum, item) => sum + item.quantity * item.unit_sale_price,
        0
      )

      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          date: payload.date,
          type: 'income',
          amount: total,
          category_id: payload.category_id,
          description: payload.description,
          created_by: user.id,
        })
        .select('id')
        .single()
      if (txErr) throw new Error(txErr.message)

      for (const item of payload.items) {
        const { error: rpcErr } = await supabase.rpc('consume_inventory_fifo', {
          p_product_id: item.product_id,
          p_quantity: item.quantity,
          p_transaction_id: tx.id,
          p_unit_sale_price: item.unit_sale_price,
          p_created_by: user.id,
        })
        if (rpcErr) throw new Error(rpcErr.message)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
