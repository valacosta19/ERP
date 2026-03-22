import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Transaction, TransactionType, PaymentMethod, PaymentInstrument, Professional } from '@/types'

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

      type RawTx = Omit<Transaction, 'professionals'> & {
        transaction_hairdressers: { hairdresser_id: string; hairdressers: Professional | null }[]
      }

      return (data as unknown as RawTx[]).map(tx => ({
        ...tx,
        professionals: tx.transaction_hairdressers.map(th => th.hairdressers).filter(Boolean),
      })) as Transaction[]
    },
  })
}

export interface PaymentRow {
  payment_method: PaymentMethod
  instrument: PaymentInstrument | null
  amount: number
}

interface TransactionPayload {
  date: string
  type: TransactionType
  category_id: string | null
  description: string | null
  is_seña: boolean
  seña_amount: number | null
  payments: PaymentRow[]
  professional_ids: string[]
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
        const direction = payload.type === 'income' ? 'entrada' : 'salida'
        const { error: pmtError } = await supabase
          .from('transaction_payments')
          .insert(payload.payments.map(p => ({ ...p, type: direction, transaction_id: tx.id })))
        if (pmtError) throw new Error(pmtError.message)
      }

      if (payload.professional_ids.length > 0) {
        const { error: hdError } = await supabase
          .from('transaction_hairdressers')
          .insert(payload.professional_ids.map(hid => ({ transaction_id: tx.id, hairdresser_id: hid })))
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
    mutationFn: async ({ id, ...payload }: Omit<TransactionPayload, 'payments' | 'professional_ids'> & { id: string; amount: number }) => {
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

export interface PaymentMethodBalance {
  method: PaymentMethod
  balance: number
}

export function usePaymentMethodBalances(filters: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['payment-method-balances', filters],
    queryFn: async () => {
      let query = supabase
        .from('transaction_payments')
        .select('payment_method, amount, transactions!inner(date, type)')

      if (filters.from) query = query.gte('transactions.date', filters.from)
      if (filters.to) query = query.lte('transactions.date', filters.to)

      const { data, error } = await query
      if (error) throw new Error(error.message)

      type Row = { payment_method: PaymentMethod; amount: number; transactions: { type: string } }
      const rows = data as unknown as Row[]

      const methodSet = [...new Set(rows.map(r => r.payment_method))].sort()
      return methodSet.map(method => {
        const subset = rows.filter(r => r.payment_method === method)
        const balance = subset.reduce((sum, r) => sum + (r.transactions.type === 'income' ? r.amount : -r.amount), 0)
        return { method, balance }
      })
    },
  })
}
