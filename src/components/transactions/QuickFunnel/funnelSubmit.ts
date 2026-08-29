import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { createTransactionGroup } from '@/hooks/useTransactionGroups'
import type { Currency } from '@/types'

export type TicketUnit = {
  client_uuid: string
  kind: 'service' | 'product' | 'tip' | 'simple' | 'staff_advance' | 'staff_withdrawal'
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
  hairdresser_id?: string | null
  staff_quantity?: number | null
  value_amount?: number | null
  due_date?: string | null
  notes?: string | null
}

export type TicketPayload = {
  date: string
  currency: Currency
  group_label: string | null
  units: TicketUnit[]
}

function unitError(message: string, index: number, total: number): Error {
  if (total <= 1) return new Error(message)
  const suffix = index > 0 ? ' — lo ya grabado no se duplica al reintentar' : ''
  return new Error(`Unidad ${index + 1} de ${total}: ${message}${suffix}`)
}

async function ensureTicketGroup(payload: TicketPayload, transactionIds: string[]): Promise<void> {
  if (!payload.group_label || transactionIds.length < 2) return

  const { count, error } = await supabase
    .from('transaction_group_members')
    .select('transaction_id', { count: 'exact', head: true })
    .in('transaction_id', transactionIds)
  if (error) throw new Error(error.message)
  if ((count ?? 0) > 0) return

  await createTransactionGroup({ label: payload.group_label, currency: payload.currency, transactionIds })
}

export function useFunnelSubmit() {
  const qc = useQueryClient()

  async function submitTicket(payload: TicketPayload): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    const total = payload.units.length
    const transactionIds: string[] = []

    for (const [index, unit] of payload.units.entries()) {
      if (unit.kind === 'staff_advance') {
        const { error } = await supabase.rpc('create_staff_advance', {
          p_client_uuid: unit.client_uuid,
          p_hairdresser_id: unit.hairdresser_id!,
          p_amount: unit.value_amount!,
          p_currency: payload.currency,
          p_payment_method: unit.payments[0].payment_method,
          p_date: payload.date,
          p_subcategory_id: unit.subcategory_id,
          p_notes: unit.notes ?? null,
          p_created_by: user?.id ?? null,
        })
        if (error) throw unitError(error.message, index, total)
        continue
      }

      if (unit.kind === 'staff_withdrawal') {
        const { error } = await supabase.rpc('create_staff_receivable', {
          p_client_uuid: unit.client_uuid,
          p_hairdresser_id: unit.hairdresser_id!,
          p_product_id: unit.product_id!,
          p_quantity: unit.staff_quantity!,
          p_value_amount: unit.value_amount!,
          p_due_date: unit.due_date ?? null,
          p_notes: unit.notes ?? null,
          p_created_by: user?.id ?? null,
        })
        if (error) throw unitError(error.message, index, total)
        continue
      }

      const { data, error } = await supabase.rpc('create_funnel_unit', {
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
      if (error) throw unitError(error.message, index, total)
      transactionIds.push((data as { transaction_id: string }).transaction_id)
    }

    await ensureTicketGroup(payload, transactionIds)

    qc.invalidateQueries({ queryKey: ['transactions'] })
    qc.invalidateQueries({ queryKey: ['transaction-groups'] })
    qc.invalidateQueries({ queryKey: ['payment-method-balances'] })
    qc.invalidateQueries({ queryKey: ['unrefunded-anticipos'] })
    qc.invalidateQueries({ queryKey: ['transaction-recipe-costs'] })
    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['anticipo-balance'] })
    qc.invalidateQueries({ queryKey: ['staff-receivables'] })
    qc.invalidateQueries({ queryKey: ['staff-receivable-balance'] })
    qc.invalidateQueries({ queryKey: ['receivables'] })
    qc.invalidateQueries({ queryKey: ['inventory-lots'] })
    qc.invalidateQueries({ queryKey: ['inventory-movements'] })
  }

  return { submitTicket }
}
