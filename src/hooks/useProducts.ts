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
      const { data, error } = await supabase
        .from('products_with_stock')
        .select('*')
        .order('name')
      if (error) throw new Error(error.message)
      return data as Product[]
    },
  })
}

interface ProductPayload {
  name: string
  sku: string
  unit: string | null
  brand: string | null
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

export function useSetRestockSkip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, skip_restock }: { id: string; skip_restock: boolean }) => {
      const { error } = await supabase
        .from('products')
        .update({ skip_restock } as ProductUpdate)
        .eq('id', id)
      if (error) throw new Error(error.message)
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
