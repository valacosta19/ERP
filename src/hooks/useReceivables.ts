import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Currency, Receivable } from '@/types'
import type { Database } from '@/types/database'
import { invalidateAccounting } from '@/lib/invalidateAccounting'

type ReceivableInsert = Database['public']['Tables']['receivables']['Insert']

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
  currency?: Currency
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
          currency: payload.currency ?? 'ARS',
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
  client_uuid: string
  receivable_id: string
  amount: number
  payment_method: string
  date: string
  notes?: string | null
}

export function useRecordReceivableCollection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: RecordCollectionPayload) => {
      const { data, error } = await supabase.rpc('record_receivable_collection', {
        p_client_uuid: payload.client_uuid,
        p_receivable_id: payload.receivable_id,
        p_amount: payload.amount,
        p_payment_method: payload.payment_method,
        p_date: payload.date,
        p_notes: payload.notes ?? null,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => invalidateAccounting(qc, [['receivables'], ['staff-receivables'], ['staff-receivable-balance']]),
  })
}
