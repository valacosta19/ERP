import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { CatalogItem } from '@/types'

export function useCatalogItems() {
  return useQuery({
    queryKey: ['catalog_items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog_items').select('*').order('name')
      if (error) throw new Error(error.message)
      return data as CatalogItem[]
    },
  })
}

export function useCreateCatalogItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; price: number; price_transfer?: number | null; price_card?: number | null; hours?: number | null }) => {
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
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; price?: number; price_transfer?: number | null; price_card?: number | null; hours?: number | null }) => {
      const { data, error } = await supabase.from('catalog_items').update(patch).eq('id', id).select().single()
      if (error) throw new Error(error.message)
      return data as CatalogItem
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog_items'] }),
  })
}

export function useUpdateCatalogItemHours() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, hours }: { id: string; hours: number | null }) => {
      const { data, error } = await supabase.from('catalog_items').update({ hours }).eq('id', id).select().single()
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
