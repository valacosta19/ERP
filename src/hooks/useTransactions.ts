import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Transaction, TransactionType, PaymentMethod, PaymentInstrument, PaymentDirection } from '@/types'

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
        .select('*, category:categories(*), payments:transaction_payments(*), transaction_hairdressers(hairdresser_id, hairdressers(id, name, active, created_at))')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (filters.type && filters.type !== 'all') query = query.eq('type', filters.type)
      if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
      if (filters.from) query = query.gte('date', filters.from)
      if (filters.to) query = query.lte('date', filters.to)

      const { data, error } = await query
      if (error) throw new Error(error.message)

      type RawTx = Omit<Transaction, 'hairdressers'> & {
        transaction_hairdressers: { hairdresser_id: string; hairdressers: Transaction['hairdressers'] extends (infer H)[] ? H : never }[]
      }

      return (data as unknown as RawTx[]).map(tx => ({
        ...tx,
        hairdressers: tx.transaction_hairdressers.map(th => th.hairdressers).filter(Boolean),
      })) as Transaction[]
    },
  })
}

export interface PaymentRow {
  payment_method: PaymentMethod
  instrument: PaymentInstrument | null
  amount: number
  type: PaymentDirection
}

interface TransactionPayload {
  date: string
  type: TransactionType
  category_id: string | null
  description: string | null
  is_seña: boolean
  seña_amount: number | null
  payments: PaymentRow[]
  hairdresser_ids: string[]
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: TransactionPayload) => {
      const { data: { user } } = await supabase.auth.getUser()

      const amount = payload.payments.reduce((sum, p) => sum + p.amount, 0)

      const { data: tx, error: txError } = await supabase
        .from('transactions')
        .insert({
          date: payload.date,
          type: payload.type,
          amount,
          category_id: payload.category_id,
          description: payload.description,
          is_seña: payload.is_seña,
          seña_amount: payload.seña_amount,
          created_by: user?.id ?? null,
        })
        .select('*')
        .single()
      if (txError) throw new Error(txError.message)

      if (payload.payments.length > 0) {
        const { error: pmtError } = await supabase
          .from('transaction_payments')
          .insert(payload.payments.map(p => ({ ...p, transaction_id: tx.id })))
        if (pmtError) throw new Error(pmtError.message)
      }

      if (payload.hairdresser_ids.length > 0) {
        const { error: hdError } = await supabase
          .from('transaction_hairdressers')
          .insert(payload.hairdresser_ids.map(hid => ({ transaction_id: tx.id, hairdresser_id: hid })))
        if (hdError) throw new Error(hdError.message)
      }

      return tx
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: Omit<TransactionPayload, 'payments' | 'hairdresser_ids'> & { id: string; amount: number }) => {
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
