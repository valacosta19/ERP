import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Database } from '@/types/database'
import type { PurchaseOrder, PurchaseOrderItem } from '@/types'

type POInsert = Database['public']['Tables']['purchase_orders']['Insert']
type POUpdate = Database['public']['Tables']['purchase_orders']['Update']
type POItemInsert = Database['public']['Tables']['purchase_order_items']['Insert']
type POItemUpdate = Database['public']['Tables']['purchase_order_items']['Update']
type LotInsert = Database['public']['Tables']['inventory_lots']['Insert']
type MovementInsert = Database['public']['Tables']['inventory_movements']['Insert']

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
  items: POItemInput[]
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreatePOPayload) => {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: po, error: poErr } = await supabase
        .from('purchase_orders')
        .insert({ supplier_id: payload.supplier_id, order_date: payload.order_date, created_by: user?.id ?? null } as POInsert)
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
    mutationFn: async ({ po, items }: { po: PurchaseOrder; items: PurchaseOrderItem[] }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const receivedDate = new Date().toISOString().slice(0, 10)

      for (const item of items) {
        const { data: lot, error: lotErr } = await supabase
          .from('inventory_lots')
          .insert({
            product_id: item.product_id,
            purchase_order_item_id: item.id,
            received_date: receivedDate,
            initial_quantity: item.quantity,
            remaining_quantity: item.quantity,
            unit_cost: item.unit_cost,
          } as LotInsert)
          .select('id')
          .single()
        if (lotErr) throw new Error(lotErr.message)

        const { error: poiErr } = await supabase
          .from('purchase_order_items')
          .update({ lot_id: lot.id } as POItemUpdate)
          .eq('id', item.id)
        if (poiErr) throw new Error(poiErr.message)

        const { error: movErr } = await supabase
          .from('inventory_movements')
          .insert({
            lot_id: lot.id,
            product_id: item.product_id,
            movement_type: 'in',
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            reference_type: 'purchase_order',
            reference_id: po.id,
            created_by: user?.id ?? null,
          } as MovementInsert)
        if (movErr) throw new Error(movErr.message)
      }

      const { error: statusErr } = await supabase
        .from('purchase_orders')
        .update({ status: 'received' } as POUpdate)
        .eq('id', po.id)
      if (statusErr) throw new Error(statusErr.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase_orders'] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
