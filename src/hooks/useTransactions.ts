import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Transaction, TransactionType } from '@/types'

interface TransactionFilters {
  type?: TransactionType | 'all'
  categoryId?: string
  from?: string
  to?: string
}

export function useTransactions(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('*, category:categories(*)')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (filters.type && filters.type !== 'all') query = query.eq('type', filters.type)
      if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
      if (filters.from) query = query.gte('date', filters.from)
      if (filters.to) query = query.lte('date', filters.to)

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data as unknown as Transaction[]
    },
  })
}

interface TransactionPayload {
  date: string
  type: TransactionType
  amount: number
  category_id: string | null
  description: string | null
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: TransactionPayload) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('transactions')
        .insert({ ...payload, created_by: user?.id ?? null })
        .select('*, category:categories(*)')
        .single()
      if (error) throw new Error(error.message)
      return data as unknown as Transaction
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: TransactionPayload & { id: string }) => {
      const { data, error } = await supabase
        .from('transactions')
        .update(payload)
        .eq('id', id)
        .select('*, category:categories(*)')
        .single()
      if (error) throw new Error(error.message)
      return data as unknown as Transaction
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}
