import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Transaction, TransactionType, Currency, PaymentMethod, PaymentInstrument, ProfessionalAssignment, TransactionCategory } from '@/types'

interface TransactionFilters {
  subcategoryIds?: string[]
  currency?: Currency
  from?: string
  to?: string
  showVoided?: boolean
}

export function useTransactions(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('*, subcategory:transaction_categories!subcategory_id(id, name, parent_id, transaction_type, created_at), payments:transaction_payments(*), transaction_hairdressers(hairdresser_id, commission_rate, hairdressers(id, name, active, created_at))')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (!filters.showVoided) query = query.is('voided_at', null)
      if (filters.subcategoryIds && filters.subcategoryIds.length > 0) query = query.in('subcategory_id', filters.subcategoryIds)
      if (filters.currency) query = query.eq('currency', filters.currency)
      if (filters.from) query = query.gte('date', filters.from)
      if (filters.to) query = query.lte('date', filters.to)

      const { data, error } = await query
      if (error) throw new Error(error.message)

      type RawTx = Omit<Transaction, 'professionals' | 'subcategory'> & {
        subcategory: TransactionCategory | null
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
  transaction_type: TransactionType
  currency: Currency
  subcategory_id?: string | null
  subcategory_name?: string | null
  catalog_item_id: string | null
  description: string | null
  is_seña: boolean
  seña_amount: number | null
  refunds_anticipo_id: string | null
  transfer_direction?: 'entrada' | 'salida'
  payments: PaymentRow[]
  professionals: { id: string; commission_rate: number }[]
  product_id?: string | null
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
          amount,
          currency: payload.currency,
          subcategory_id: payload.subcategory_id ?? null,
          catalog_item_id: payload.catalog_item_id,
          description: payload.description,
          is_seña: payload.is_seña,
          seña_amount: payload.seña_amount,
          refunds_anticipo_id: payload.refunds_anticipo_id,
          product_id: payload.product_id ?? null,
          created_by: user?.id ?? null,
        })
        .select('*')
        .single()
      if (txError) throw new Error(txError.message)

      if (payload.payments.length > 0) {
        const direction = payload.is_seña
          ? payload.description?.trim().toLowerCase() === 'anticipo' ? 'entrada' : 'salida'
          : payload.transaction_type === 'income' ? 'entrada'
          : payload.transaction_type === 'transfer' ? (payload.transfer_direction ?? 'entrada')
          : 'salida'
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

      if (payload.catalog_item_id) {
        const { data: recipes, error: recipeError } = await supabase
          .from('service_recipes')
          .select('product_id, quantity_grams')
          .eq('catalog_item_id', payload.catalog_item_id)
        if (recipeError) throw new Error(recipeError.message)

        if (recipes && recipes.length > 0) {
          const productIds = recipes.map(r => r.product_id)
          const { data: prods, error: prodsError } = await supabase
            .from('products_with_stock')
            .select('id, min_cost, max_cost, unit_size')
            .in('id', productIds)
          if (prodsError) throw new Error(prodsError.message)

          const prodMap = new Map((prods ?? []).map((p: { id: string; min_cost: number | null; max_cost: number | null; unit_size: number | null }) => [p.id, p]))
          const snapshotRows = recipes
            .filter(r => {
              const p = prodMap.get(r.product_id)
              return p?.unit_size != null
            })
            .map(r => {
              const p = prodMap.get(r.product_id)!
              const min = p.min_cost ?? 0
              const max = p.max_cost ?? min
              return {
                transaction_id: tx.id,
                catalog_item_id: payload.catalog_item_id!,
                product_id: r.product_id,
                quantity_grams: r.quantity_grams,
                avg_unit_cost: (min + max) / 2,
                unit_size: p.unit_size!,
              }
            })

          if (snapshotRows.length > 0) {
            const { error: snapError } = await supabase
              .from('transaction_recipe_costs')
              .insert(snapshotRows)
            if (snapError) throw new Error(snapError.message)
          }
        }
      }

      if (payload.subcategory_name === 'Préstamos otorgados') {
        const { data: { user } } = await supabase.auth.getUser()
        const { error: recvError } = await supabase
          .from('receivables')
          .insert({
            debtor_name: payload.description ?? 'Sin nombre',
            concept: 'Préstamo',
            total_amount: amount,
            source_transaction_id: tx.id,
            created_by: user?.id ?? null,
          })
        if (recvError) throw new Error(recvError.message)
      }

      return tx
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['payment-method-balances'] })
      qc.invalidateQueries({ queryKey: ['unrefunded-anticipos'] })
      qc.invalidateQueries({ queryKey: ['transaction-recipe-costs'] })
    },
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payments, professionals, transaction_type, transfer_direction, ...payload }: TransactionPayload & { id: string; amount: number }) => {
      const { data, error } = await supabase
        .from('transactions')
        .update(payload)
        .eq('id', id)
        .select('*, subcategory:transaction_categories!subcategory_id(id, name, parent_id, transaction_type, created_at)')
        .single()
      if (error) throw new Error(error.message)

      const { error: delPmtError } = await supabase
        .from('transaction_payments')
        .delete()
        .eq('transaction_id', id)
      if (delPmtError) throw new Error(delPmtError.message)

      if (payments.length > 0) {
        const isSeña = payload.is_seña
        const direction = isSeña
          ? payload.description?.trim().toLowerCase() === 'anticipo' ? 'entrada' : 'salida'
          : transaction_type === 'income' ? 'entrada'
          : transaction_type === 'transfer' ? (transfer_direction ?? 'entrada')
          : 'salida'
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
      qc.invalidateQueries({ queryKey: ['unrefunded-anticipos'] })
    },
  })
}

export function useVoidTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await supabase
        .from('transactions')
        .update({ voided_at: new Date().toISOString(), voided_by: user?.id ?? null })
        .eq('id', id)
      if (error) throw new Error(error.message)

      const { error: logError } = await supabase
        .from('user_action_logs')
        .insert({ user_id: user?.id ?? null, action: 'void_transaction', entity: 'transactions', entity_id: id })
      if (logError) throw new Error(logError.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['payment-method-balances'] })
      qc.invalidateQueries({ queryKey: ['unrefunded-anticipos'] })
    },
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
      const { data: anticipos, error: aErr } = await supabase
        .from('transactions')
        .select('id, date, amount, currency, subcategory_id')
        .eq('is_seña', true)
        .is('voided_at', null)
        .order('date', { ascending: false })
      if (aErr) throw new Error(aErr.message)

      const { data: refunded, error: rErr } = await supabase
        .from('transactions')
        .select('refunds_anticipo_id')
        .not('refunds_anticipo_id', 'is', null)
      if (rErr) throw new Error(rErr.message)

      const refundedIds = new Set((refunded as { refunds_anticipo_id: string }[]).map(r => r.refunds_anticipo_id))
      return (anticipos as { id: string; date: string; amount: number; currency: string; subcategory_id: string | null }[]).filter(a => !refundedIds.has(a.id))
    },
  })
}

export function usePaymentMethodBalances(filters: { from?: string; to?: string; currency?: Currency } = {}) {
  return useQuery({
    queryKey: ['payment-method-balances', filters],
    queryFn: async () => {
      let query = supabase
        .from('transaction_payments')
        .select('payment_method, amount, type, transactions!inner(date, currency, voided_at)')
        .is('transactions.voided_at', null)

      if (filters.from) query = query.gte('transactions.date', filters.from)
      if (filters.to) query = query.lte('transactions.date', filters.to)
      if (filters.currency) query = query.eq('transactions.currency', filters.currency)

      const { data, error } = await query
      if (error) throw new Error(error.message)

      type Row = { payment_method: PaymentMethod; amount: number; type: string; transactions: { currency: string; voided_at: string | null; date: string } }
      const rows = data as unknown as Row[]

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
