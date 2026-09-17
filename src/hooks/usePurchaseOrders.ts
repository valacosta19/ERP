import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchInventoryPurchaseCategoryId } from '@/lib/inventoryPurchaseCategory'
import type { Database } from '@/types/database'
import type { PurchaseOrder } from '@/types'
import { invalidateAccounting } from '@/lib/invalidateAccounting'

type POInsert = Database['public']['Tables']['purchase_orders']['Insert']
type POUpdate = Database['public']['Tables']['purchase_orders']['Update']
type POItemInsert = Database['public']['Tables']['purchase_order_items']['Insert']

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
      paymentOption,
    }: {
      po: PurchaseOrder
      items: { id: string; quantity: number }[]
      paymentOption: POPaymentOption
    }) => {
      const subcategoryId = paymentOption.mode === 'immediate' ? await fetchInventoryPurchaseCategoryId() : null
      const { error } = await supabase.rpc('receive_purchase_order_accounted', {
        p_po_id: po.id,
        p_items: items,
        p_mode: paymentOption.mode,
        p_payment_method: paymentOption.mode === 'immediate' ? paymentOption.payment_method : null,
        p_payment_date: paymentOption.mode === 'immediate' ? paymentOption.date : null,
        p_due_date: paymentOption.mode === 'deferred' ? paymentOption.due_date : null,
        p_notes: paymentOption.mode === 'deferred' ? paymentOption.notes ?? null : null,
        p_subcategory_id: subcategoryId,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      invalidateAccounting(qc, [['purchase_orders'], ['products'], ['inventory_lots'], ['supplier_debts']])
    },
  })
}
