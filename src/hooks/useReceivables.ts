import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Receivable, ReceivableCollection } from '@/types'
import type { Database } from '@/types/database'

type ReceivableInsert = Database['public']['Tables']['receivables']['Insert']
type ReceivableUpdate = Database['public']['Tables']['receivables']['Update']
type CollectionInsert = Database['public']['Tables']['receivable_collections']['Insert']

export function useReceivables() {
  return useQuery({
    queryKey: ['receivables'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receivables')
        .select('*, collections:receivable_collections(*)')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data as unknown as Receivable[]
    },
  })
}

interface CreateReceivablePayload {
  debtor_name: string
  concept: string
  total_amount: number
  due_date: string | null
  notes?: string | null
}

export function useCreateReceivable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateReceivablePayload) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('receivables')
        .insert({
          debtor_name: payload.debtor_name,
          concept: payload.concept,
          total_amount: payload.total_amount,
          collected_amount: 0,
          due_date: payload.due_date,
          notes: payload.notes ?? null,
          created_by: user?.id ?? null,
        } as ReceivableInsert)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['receivables'] }),
  })
}

interface RecordCollectionPayload {
  receivable_id: string
  amount: number
  payment_method: string
  date: string
  transaction_id: string | null
  notes?: string | null
}

export function useRecordReceivableCollection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: RecordCollectionPayload) => {
      const { data: collection, error: colErr } = await supabase
        .from('receivable_collections')
        .insert({
          receivable_id: payload.receivable_id,
          amount: payload.amount,
          payment_method: payload.payment_method,
          date: payload.date,
          transaction_id: payload.transaction_id,
          notes: payload.notes ?? null,
        } as CollectionInsert)
        .select('*')
        .single()
      if (colErr) throw new Error(colErr.message)

      const { data: receivable, error: recErr } = await supabase
        .from('receivables')
        .select('collected_amount')
        .eq('id', payload.receivable_id)
        .single()
      if (recErr) throw new Error(recErr.message)

      const newCollected = (receivable.collected_amount as number) + payload.amount
      const { error: updateErr } = await supabase
        .from('receivables')
        .update({ collected_amount: newCollected } as ReceivableUpdate)
        .eq('id', payload.receivable_id)
      if (updateErr) throw new Error(updateErr.message)

      return collection as unknown as ReceivableCollection
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['receivables'] }),
  })
}
