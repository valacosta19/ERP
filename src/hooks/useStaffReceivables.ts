import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRows } from '@/lib/fetchAllRows'
import type { CommissionPayout, Currency, Receivable } from '@/types'

export function useStaffReceivables() {
  return useQuery({
    queryKey: ['staff-receivables'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receivables')
        .select('*, collections:receivable_collections(*)')
        .not('hairdresser_id', 'is', null)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data as unknown as Receivable[]
    },
  })
}

export function useStaffReceivableBalance(hairdresserId: string | null | undefined) {
  return useQuery({
    queryKey: ['staff-receivable-balance', hairdresserId],
    enabled: !!hairdresserId,
    queryFn: async () => {
      if (!hairdresserId) return { ARS: 0, USD: 0, EUR: 0 } satisfies Record<Currency, number>
      const { data, error } = await supabase
        .from('receivables')
        .select('total_amount, collected_amount, currency')
        .eq('hairdresser_id', hairdresserId)
      if (error) throw new Error(error.message)
      return (data ?? []).reduce<Record<Currency, number>>(
        (balances, receivable) => {
          const currency = receivable.currency as Currency
          balances[currency] += Number(receivable.total_amount) - Number(receivable.collected_amount)
          return balances
        },
        { ARS: 0, USD: 0, EUR: 0 },
      )
    },
  })
}

interface CommissionPayoutFilters {
  period_start?: string
  period_end?: string
}

export function useCommissionPayouts(filters: CommissionPayoutFilters = {}) {
  return useQuery({
    queryKey: ['commission-payouts', filters],
    enabled: !!filters.period_start && !!filters.period_end,
    queryFn: async () => fetchAllRows<CommissionPayout>((rangeFrom, rangeTo) => {
      let query = supabase
        .from('commission_payouts')
        .select('*')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })

      if (filters.period_start) query = query.eq('period_start', filters.period_start)
      if (filters.period_end) query = query.eq('period_end', filters.period_end)

      return query.range(rangeFrom, rangeTo)
    }),
  })
}

interface SettleCommissionPayoutPayload {
  client_uuid: string
  hairdresser_id: string
  period_start: string
  period_end: string
  installment_amount: number
  receivable_ids: string[]
  payment_method: string
  payment_date: string
  subcategory_id?: string | null
  notes?: string | null
}

export function useSettleCommissionPayout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SettleCommissionPayoutPayload) => {
      const { data, error } = await supabase.rpc('record_partial_commission_payout', {
        p_client_uuid: payload.client_uuid,
        p_hairdresser_id: payload.hairdresser_id,
        p_period_start: payload.period_start,
        p_period_end: payload.period_end,
        p_installment_amount: payload.installment_amount,
        p_receivable_ids: payload.receivable_ids,
        p_payment_method: payload.payment_method,
        p_payment_date: payload.payment_date,
        p_subcategory_id: payload.subcategory_id ?? null,
        p_notes: payload.notes ?? null,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-receivables'] })
      qc.invalidateQueries({ queryKey: ['staff-receivable-balance'] })
      qc.invalidateQueries({ queryKey: ['receivables'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['payment-method-balances'] })
      qc.invalidateQueries({ queryKey: ['commission-payouts'] })
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
