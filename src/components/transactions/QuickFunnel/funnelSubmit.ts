import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useCreateTransaction } from '@/hooks/useTransactions'
import type { Currency } from '@/types'

export type TicketUnit = {
  kind: 'service' | 'product' | 'tip' | 'simple'
  transaction_type: 'income' | 'expense' | 'transfer'
  description: string | null
  catalog_item_id: string | null
  product_id: string | null
  product_qty: number
  unit_sale_price: number
  subcategory_id: string | null
  subcategory_name: string | null
  professionals: { id: string; commission_rate: number }[]
  sena_amount: number | null
  transfer_direction?: 'entrada' | 'salida'
  payments: { payment_method: string; instrument: null; amount: number }[]
}

export type TicketPayload = {
  date: string
  currency: Currency
  units: TicketUnit[]
}

export function useFunnelSubmit() {
  const qc = useQueryClient()
  const createTx = useCreateTransaction()

  async function submitTicket(payload: TicketPayload): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()

    for (const unit of payload.units) {
      let inventoryPending = false
      let runFifo = false

      if (unit.product_id) {
        const { data: prod, error: stockError } = await supabase
          .from('products_with_stock')
          .select('stock')
          .eq('id', unit.product_id)
          .single()
        if (stockError) throw new Error(stockError.message)
        const stock = (prod as { stock: number } | null)?.stock ?? 0
        if (stock >= unit.product_qty) runFifo = true
        else inventoryPending = true
      }

      const tx = await createTx.mutateAsync({
        date: payload.date,
        transaction_type: unit.transaction_type,
        currency: payload.currency,
        subcategory_id: unit.subcategory_id,
        subcategory_name: unit.subcategory_name,
        catalog_item_id: unit.catalog_item_id,
        description: unit.description,
        is_seña: false,
        seña_amount: unit.sena_amount,
        refunds_anticipo_id: null,
        transfer_direction: unit.transfer_direction,
        payments: unit.payments,
        professionals: unit.professionals,
        product_id: unit.product_id,
        inventory_pending: inventoryPending,
      })

      if (runFifo && unit.product_id) {
        const { error: fifoError } = await supabase.rpc('consume_inventory_fifo', {
          p_product_id: unit.product_id,
          p_quantity: unit.product_qty,
          p_transaction_id: tx.id,
          p_unit_sale_price: unit.unit_sale_price,
          p_created_by: user!.id,
        })
        if (fifoError) throw new Error(fifoError.message)
      }
    }

    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['anticipo-balance'] })
  }

  return { submitTicket, isPending: createTx.isPending }
}
