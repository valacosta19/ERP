import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Transaction, TransactionType, Currency, PaymentMethod, PaymentInstrument, ProfessionalAssignment } from '@/types'

interface TransactionFilters {
  type?: TransactionType | 'all'
  categoryId?: string
  currency?: Currency
  from?: string
  to?: string
}

export function useTransactions(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('*, category:categories(*), payments:transaction_payments(*), transaction_hairdressers(hairdresser_id, commission_rate, hairdressers(id, name, active, created_at))')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (filters.type && filters.type !== 'all') query = query.eq('type', filters.type)
      if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
      if (filters.currency) query = query.eq('currency', filters.currency)
      if (filters.from) query = query.gte('date', filters.from)
      if (filters.to) query = query.lte('date', filters.to)

      const { data, error } = await query
      if (error) throw new Error(error.message)

      type RawTx = Omit<Transaction, 'professionals'> & {
        transaction_hairdressers: { hairdresser_id: string; commission_rate: number; hairdressers: Omit<ProfessionalAssignment, 'commission_rate'> | null }[]
      }

      return (data as unknown as RawTx[]).map(tx => ({
        ...tx,
        professionals: tx.transaction_hairdressers
          .filter(th => th.hairdressers !== null)
          .map(th => ({ ...th.hairdressers!, commission_rate: th.commission_rate })),
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
  currency: Currency
  category_id: string | null
  description: string | null
  is_seña: boolean
  seña_amount: number | null
  payments: PaymentRow[]
  professionals: { id: string; commission_rate: number }[]
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
          currency: payload.currency,
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

      if (payload.professionals.length > 0) {
        const { error: hdError } = await supabase
          .from('transaction_hairdressers')
          .insert(payload.professionals.map(p => ({ transaction_id: tx.id, hairdresser_id: p.id, commission_rate: p.commission_rate })))
        if (hdError) throw new Error(hdError.message)
      }

      return tx
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['payment-method-balances'] })
    },
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payments, professionals, ...payload }: TransactionPayload & { id: string; amount: number }) => {
      const { data, error } = await supabase
        .from('transactions')
        .update(payload)
        .eq('id', id)
        .select('*, category:categories(*)')
        .single()
      if (error) throw new Error(error.message)

      const { error: delPmtError } = await supabase
        .from('transaction_payments')
        .delete()
        .eq('transaction_id', id)
      if (delPmtError) throw new Error(delPmtError.message)

      if (payments.length > 0) {
        const direction = payload.type === 'income' ? 'entrada' : 'salida'
        const { error: insError } = await supabase
          .from('transaction_payments')
          .insert(payments.map(p => ({ ...p, type: direction, transaction_id: id })))
        if (insError) throw new Error(insError.message)
      }

      const { error: delHdError } = await supabase
        .from('transaction_hairdressers')
        .delete()
        .eq('transaction_id', id)
      if (delHdError) throw new Error(delHdError.message)

      if (professionals.length > 0) {
        const { error: insHdError } = await supabase
          .from('transaction_hairdressers')
          .insert(professionals.map(p => ({ transaction_id: id, hairdresser_id: p.id, commission_rate: p.commission_rate })))
        if (insHdError) throw new Error(insHdError.message)
      }

      return data as unknown as Transaction
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['payment-method-balances'] })
    },
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['payment-method-balances'] })
    },
  })
}

export interface PaymentMethodBalance {
  method: PaymentMethod
  currencies: { currency: string; balance: number }[]
}

export function usePaymentMethodBalances(filters: { from?: string; to?: string; currency?: Currency } = {}) {
  return useQuery({
    queryKey: ['payment-method-balances', filters],
    queryFn: async () => {
      let query = supabase
        .from('transaction_payments')
        .select('payment_method, amount, transactions!inner(date, type, currency)')

      if (filters.from) query = query.gte('transactions.date', filters.from)
      if (filters.to) query = query.lte('transactions.date', filters.to)
      if (filters.currency) query = query.eq('transactions.currency', filters.currency)

      const { data, error } = await query
      if (error) throw new Error(error.message)

      type Row = { payment_method: PaymentMethod; amount: number; transactions: { type: string; currency: string } }
      const rows = data as unknown as Row[]

      const methodKeySet = [...new Set(rows.map(r => r.payment_method.toLowerCase()))].sort()
      return methodKeySet.map(methodKey => {
        const subset = rows.filter(r => r.payment_method.toLowerCase() === methodKey)
        const displayName = subset[0].payment_method
        const currencySet = [...new Set(subset.map(r => r.transactions.currency))].sort()
        const currencies = currencySet.map(currency => {
          const balance = subset
            .filter(r => r.transactions.currency === currency)
            .reduce((sum, r) => sum + (r.transactions.type === 'income' ? r.amount : -r.amount), 0)
          return { currency, balance }
        })
        return { method: displayName, currencies }
      })
    },
  })
}
