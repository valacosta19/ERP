import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchInventoryPurchaseCategoryId } from '@/lib/inventoryPurchaseCategory'
import type { Database } from '@/types/database'
import type { PurchaseOrder } from '@/types'

type POInsert = Database['public']['Tables']['purchase_orders']['Insert']
type POUpdate = Database['public']['Tables']['purchase_orders']['Update']
type POItemInsert = Database['public']['Tables']['purchase_order_items']['Insert']
type DebtInsert = Database['public']['Tables']['supplier_debts']['Insert']

export function usePurchaseOrders() {
  return useQuery({
    queryKey: ['purchase_orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*, supplier:suppliers(*), items:purchase_order_items(*, product:products(*))')
        .order('order_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data as unknown as PurchaseOrder[]
    },
  })
}

interface POItemInput {
  product_id: string
  quantity: number
  unit_cost: number
}

interface CreatePOPayload {
  supplier_id: string | null
  order_date: string
  shipping_cost: number
  discount_amount: number
  items: POItemInput[]
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreatePOPayload) => {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: po, error: poErr } = await supabase
        .from('purchase_orders')
        .insert({ supplier_id: payload.supplier_id, order_date: payload.order_date, shipping_cost: payload.shipping_cost, discount_amount: payload.discount_amount, created_by: user?.id ?? null } as POInsert)
        .select('*')
        .single()
      if (poErr) throw new Error(poErr.message)

      const itemsToInsert: POItemInsert[] = payload.items.map(item => ({
        purchase_order_id: po.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
      }))

      const { error: itemsErr } = await supabase.from('purchase_order_items').insert(itemsToInsert as POItemInsert[])
      if (itemsErr) throw new Error(itemsErr.message)

      return po
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase_orders'] }),
  })
}

export function useUpdateShippingCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, shipping_cost }: { id: string; shipping_cost: number }) => {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ shipping_cost } as POUpdate)
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase_orders'] }),
  })
}

export function useCancelPurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'cancelled' } as POUpdate)
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase_orders'] }),
  })
}

export type POPaymentOption =
  | { mode: 'immediate'; payment_method: string; date: string }
  | { mode: 'deferred'; due_date: string | null; notes?: string | null }
  | { mode: 'none' }

export function useReceivePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      po,
      items,
      totalAmount,
      paymentOption,
    }: {
      po: PurchaseOrder
      items: { id: string; quantity: number }[]
      totalAmount: number
      paymentOption: POPaymentOption
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.rpc('receive_purchase_order', {
        p_po_id: po.id,
        p_created_by: user?.id ?? null,
        p_items: items,
      })
      if (error) throw new Error(error.message)

      if (paymentOption.mode === 'immediate') {
        const subcategoryId = await fetchInventoryPurchaseCategoryId()

        const { data: tx, error: txErr } = await supabase
          .from('transactions')
          .insert({
            date: paymentOption.date,
            amount: totalAmount,
            currency: 'ARS',
            subcategory_id: subcategoryId,
            description: `Pago OC - ${po.supplier?.name ?? ''}`.trim().replace(/- $/, ''),
            is_seña: false,
            seña_amount: null,
            created_by: user?.id ?? null,
          })
          .select('id')
          .single()
        if (txErr) throw new Error(txErr.message)

        const { error: pmtErr } = await supabase
          .from('transaction_payments')
          .insert({
            transaction_id: tx.id,
            payment_method: paymentOption.payment_method,
            instrument: null,
            amount: totalAmount,
            type: 'salida',
          })
        if (pmtErr) throw new Error(pmtErr.message)
      } else if (paymentOption.mode === 'deferred') {
        const { error: debtErr } = await supabase
          .from('supplier_debts')
          .insert({
            purchase_order_id: po.id,
            supplier_id: po.supplier_id,
            total_amount: totalAmount,
            paid_amount: 0,
            due_date: paymentOption.due_date,
            notes: paymentOption.notes ?? null,
          } as DebtInsert)
        if (debtErr) throw new Error(debtErr.message)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase_orders'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['supplier_debts'] })
      qc.invalidateQueries({ queryKey: ['payment-method-balances'] })
    },
  })
}
