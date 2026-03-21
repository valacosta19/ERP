import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Database } from '@/types/database'
import type { Product } from '@/types'

type ProductInsert = Database['public']['Tables']['products']['Insert']
type ProductUpdate = Database['public']['Tables']['products']['Update']

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data: products, error: pErr } = await supabase
        .from('products')
        .select('*')
        .is('deleted_at', null)
        .order('name')
      if (pErr) throw new Error(pErr.message)

      const { data: lots, error: lErr } = await supabase
        .from('inventory_lots')
        .select('product_id, remaining_quantity')
      if (lErr) throw new Error(lErr.message)

      const stockMap = new Map<string, number>()
      for (const lot of lots ?? []) {
        stockMap.set(lot.product_id, (stockMap.get(lot.product_id) ?? 0) + Number(lot.remaining_quantity))
      }

      return (products as Product[]).map(p => ({ ...p, stock: stockMap.get(p.id) ?? 0 }))
    },
  })
}

interface ProductPayload {
  name: string
  sku: string
  unit: string | null
  sale_price: number
  min_stock: number
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: ProductPayload) => {
      const { data, error } = await supabase
        .from('products')
        .insert(payload as ProductInsert)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as Product
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: ProductPayload & { id: string }) => {
      const { data, error } = await supabase
        .from('products')
        .update(payload as ProductUpdate)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as Product
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('products')
        .update({ deleted_at: new Date().toISOString() } as ProductUpdate)
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}
