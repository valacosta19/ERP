import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Database } from '@/types/database'
import type { PurchaseOrder } from '@/types'

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
  items: POItemInput[]
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreatePOPayload) => {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: po, error: poErr } = await supabase
        .from('purchase_orders')
        .insert({ supplier_id: payload.supplier_id, order_date: payload.order_date, shipping_cost: payload.shipping_cost, created_by: user?.id ?? null } as POInsert)
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

export function useReceivePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ po, items }: { po: PurchaseOrder; items: { id: string; quantity: number }[] }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.rpc('receive_purchase_order', {
        p_po_id: po.id,
        p_created_by: user?.id ?? null,
        p_items: items,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase_orders'] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
