import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Currency } from '@/types'

export type TicketUnit = {
  client_uuid: string
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

  async function submitTicket(payload: TicketPayload): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()

    for (const unit of payload.units) {
      const { error } = await supabase.rpc('create_funnel_unit', {
        p_client_uuid: unit.client_uuid,
        p_date: payload.date,
        p_transaction_type: unit.transaction_type,
        p_currency: payload.currency,
        p_subcategory_id: unit.subcategory_id,
        p_subcategory_name: unit.subcategory_name,
        p_catalog_item_id: unit.catalog_item_id,
        p_description: unit.description,
        p_transfer_direction: unit.transfer_direction ?? null,
        p_payments: unit.payments,
        p_professionals: unit.professionals.map(p => ({
          hairdresser_id: p.id,
          commission_rate: p.commission_rate,
        })),
        p_product_id: unit.product_id,
        p_product_qty: unit.product_qty,
        p_unit_sale_price: unit.unit_sale_price,
        p_sena_amount: unit.sena_amount,
        p_created_by: user?.id ?? null,
      })
      if (error) throw new Error(error.message)
    }

    qc.invalidateQueries({ queryKey: ['transactions'] })
    qc.invalidateQueries({ queryKey: ['payment-method-balances'] })
    qc.invalidateQueries({ queryKey: ['unrefunded-anticipos'] })
    qc.invalidateQueries({ queryKey: ['transaction-recipe-costs'] })
    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['anticipo-balance'] })
  }

  return { submitTicket }
}
