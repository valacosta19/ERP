import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { CatalogItem } from '@/types'

export function useCatalogItems(categoryId?: string) {
  return useQuery({
    queryKey: ['catalog_items', categoryId],
    queryFn: async () => {
      let q = supabase.from('catalog_items').select('*').order('name')
      if (categoryId) q = q.eq('category_id', categoryId)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data as CatalogItem[]
    },
  })
}

export function useCreateCatalogItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; category_id: string; price: number }) => {
      const { data, error } = await supabase.from('catalog_items').insert(payload).select().single()
      if (error) throw new Error(error.message)
      return data as CatalogItem
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog_items'] }),
  })
}

export function useUpdateCatalogItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; price?: number }) => {
      const { data, error } = await supabase.from('catalog_items').update(patch).eq('id', id).select().single()
      if (error) throw new Error(error.message)
      return data as CatalogItem
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog_items'] }),
  })
}

export function useDeleteCatalogItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('catalog_items').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog_items'] }),
  })
}
