import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { TransactionCategory } from '@/types'

export function useTransactionCategories() {
  return useQuery({
    queryKey: ['transaction-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transaction_categories')
        .select('*')
        .order('parent_id', { nullsFirst: true })
        .order('name')
      if (error) throw new Error(error.message)
      return data as TransactionCategory[]
    },
  })
}

export function useCreateTransactionCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; parent_id: string; deducts_inventory?: boolean }) => {
      const { data, error } = await supabase
        .from('transaction_categories')
        .insert(payload)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as TransactionCategory
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transaction-categories'] }),
  })
}

export function useUpdateTransactionCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name, deducts_inventory }: { id: string; name?: string; deducts_inventory?: boolean }) => {
      const patch: Record<string, unknown> = {}
      if (name !== undefined) patch.name = name
      if (deducts_inventory !== undefined) patch.deducts_inventory = deducts_inventory
      const { data, error } = await supabase
        .from('transaction_categories')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as TransactionCategory
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transaction-categories'] }),
  })
}

export function useDeleteTransactionCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transaction_categories').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transaction-categories'] }),
  })
}
