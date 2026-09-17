import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { fetchDisplayPositions, compareByDisplayOrder } from '@/lib/transactionOrder'
import type { Transaction, TransactionType, Currency, PaymentMethod, TransactionPaymentInput, ProfessionalAssignment, TransactionCategory } from '@/types'
import { invalidateAccounting } from '@/lib/invalidateAccounting'

interface TransactionFilters {
  subcategoryIds?: string[]
  currency?: Currency
  from?: string
  to?: string
  showVoided?: boolean
  pendingOnly?: boolean
  search?: string
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, match => `\\${match}`)
}

export function useTransactions(filters: TransactionFilters = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['transactions', filters],
    enabled: options.enabled ?? true,
    queryFn: async () => {
      type RawTx = Omit<Transaction, 'professionals' | 'subcategory'> & {
        subcategory: TransactionCategory | null
        transaction_hairdressers: { hairdresser_id: string; commission_rate: number; hairdressers: Omit<ProfessionalAssignment, 'commission_rate'> | null }[]
      }

      const rows = await fetchAllRows<RawTx>((rangeFrom, rangeTo) => {
        let query = supabase
          .from('transactions')
          .select('*, subcategory:transaction_categories!subcategory_id(id, name, parent_id, transaction_type, created_at), payments:transaction_payments(*), transaction_hairdressers(hairdresser_id, commission_rate, hairdressers(id, name, active, created_at))')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })

        if (!filters.showVoided) query = query.is('voided_at', null)
        if (filters.pendingOnly) query = query.eq('inventory_pending', true)
        if (filters.subcategoryIds && filters.subcategoryIds.length > 0) query = query.in('subcategory_id', filters.subcategoryIds)
        if (filters.currency) query = query.eq('currency', filters.currency)
        if (filters.search) {
          query = query.ilike('description', `%${escapeLikePattern(filters.search)}%`)
        } else {
          if (filters.from) query = query.gte('date', filters.from)
          if (filters.to) query = query.lte('date', filters.to)
        }

        return query.range(rangeFrom, rangeTo)
      })

      const positions = await fetchDisplayPositions(rows.map(tx => tx.id))

      return (rows.map(tx => ({
        ...tx,
        display_position: positions.get(tx.id) ?? null,
        professionals: tx.transaction_hairdressers
          .filter(th => th.hairdressers !== null)
          .map(th => ({ ...th.hairdressers!, commission_rate: th.commission_rate })),
      })) as Transaction[]).sort(compareByDisplayOrder)
    },
  })
}

export type PaymentRow = TransactionPaymentInput

interface TransactionPayload {
  date: string
  transaction_type: TransactionType
  currency: Currency
  subcategory_id?: string | null
  subcategory_name?: string | null
  catalog_item_id: string | null
  description: string | null
  is_seña: boolean
  seña_amount: number | null
  refunds_anticipo_id: string | null
  payments: PaymentRow[]
  professionals: { id: string; commission_rate: number }[]
  product_id?: string | null
  inventory_pending?: boolean
  transfer_direction?: 'entrada' | 'salida'
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      payments,
      professionals,
      transaction_type,
      date,
      currency,
      subcategory_id,
      catalog_item_id,
      description,
      is_seña,
      seña_amount,
      refunds_anticipo_id,
      product_id,
      transfer_direction,
    }: TransactionPayload & { id: string; amount: number }) => {
      const { data, error } = await supabase.rpc('update_transaction_atomic', {
        p_transaction_id: id,
        p_transaction: {
          date,
          currency,
          subcategory_id: subcategory_id ?? null,
          catalog_item_id,
          description,
          is_seña,
          seña_amount,
          refunds_anticipo_id,
          product_id: product_id ?? null,
          transaction_type,
          transfer_direction: transfer_direction ?? null,
        },
        p_payments: payments.map(payment => ({
          payment_method: payment.payment_method,
          instrument: payment.instrument,
          amount: payment.amount,
          ...(transaction_type === 'transfer' ? { type: payment.type } : {}),
        })),
        p_professionals: professionals.map(professional => ({
          hairdresser_id: professional.id,
          commission_rate: professional.commission_rate,
        })),
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => invalidateAccounting(qc, [['products'], ['inventory_lots'], ['transaction-recipe-costs']]),
  })
}

export function useVoidTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .rpc('void_transaction', { p_transaction_id: id })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateAccounting(qc, [['receivables'], ['staff-receivables'], ['products'], ['inventory_lots'], ['transaction-recipe-costs']]),
  })
}

export interface PaymentMethodBalance {
  method: PaymentMethod
  currencies: { currency: string; balance: number }[]
}

export function useUnrefundedAnticipos() {
  return useQuery({
    queryKey: ['unrefunded-anticipos'],
    queryFn: async () => {
      type Anticipo = { id: string; date: string; amount: number; currency: string; subcategory_id: string | null }
      const anticipos = await fetchAllRows<Anticipo>((rangeFrom, rangeTo) =>
        supabase
          .from('transactions')
          .select('id, date, amount, currency, subcategory_id')
          .eq('is_seña', true)
          .is('voided_at', null)
          .order('date', { ascending: false })
          .order('id', { ascending: false })
          .range(rangeFrom, rangeTo),
      )

      const refunded = await fetchAllRows<{ refunds_anticipo_id: string }>((rangeFrom, rangeTo) =>
        supabase
          .from('transactions')
          .select('refunds_anticipo_id')
          .not('refunds_anticipo_id', 'is', null)
          .order('id', { ascending: true })
          .range(rangeFrom, rangeTo),
      )

      const refundedIds = new Set(refunded.map(r => r.refunds_anticipo_id))
      return anticipos.filter(a => !refundedIds.has(a.id))
    },
  })
}

export function usePaymentMethodBalances(filters: { from?: string; to?: string; currency?: Currency } = {}) {
  return useQuery({
    queryKey: ['payment-method-balances', filters],
    queryFn: async () => {
      type Row = { payment_method: PaymentMethod; amount: number; type: string; transactions: { currency: string; voided_at: string | null; date: string } }
      const rows = await fetchAllRows<Row>((rangeFrom, rangeTo) => {
        let query = supabase
          .from('transaction_payments')
          .select('payment_method, amount, type, transactions!inner(date, currency, voided_at)')
          .is('transactions.voided_at', null)
          .order('id', { ascending: true })

        if (filters.from) query = query.gte('transactions.date', filters.from)
        if (filters.to) query = query.lte('transactions.date', filters.to)
        if (filters.currency) query = query.eq('transactions.currency', filters.currency)

        return query.range(rangeFrom, rangeTo)
      })

      const methodKeySet = [...new Set(rows.map(r => r.payment_method.toLowerCase()))].sort()
      return methodKeySet.map(methodKey => {
        const subset = rows.filter(r => r.payment_method.toLowerCase() === methodKey)
        const displayName = subset[0].payment_method
        const currencySet = [...new Set(subset.map(r => r.transactions.currency))].sort()
        const currencies = currencySet.map(currency => {
          const balance = subset
            .filter(r => r.transactions.currency === currency)
            .reduce((sum, r) => sum + (r.type === 'entrada' ? r.amount : -r.amount), 0)
          return { currency, balance }
        })
        return { method: displayName, currencies }
      })
    },
  })
}
