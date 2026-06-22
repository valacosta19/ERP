import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Receivable } from '@/types'

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
      if (!hairdresserId) return 0
      const { data, error } = await supabase
        .from('receivables')
        .select('total_amount, collected_amount')
        .eq('hairdresser_id', hairdresserId)
      if (error) throw new Error(error.message)
      return (data ?? []).reduce(
        (sum, r) => sum + ((r.total_amount as number) - (r.collected_amount as number)),
        0,
      )
    },
  })
}

interface SettleCommissionPayoutPayload {
  hairdresser_id: string
  period_start: string
  period_end: string
  gross_amount: number
  receivable_ids: string[]
  net_amount: number
  payment_method: string
  payment_date: string
  subcategory_id?: string | null
  notes?: string | null
}

export function useSettleCommissionPayout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SettleCommissionPayoutPayload) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No hay usuario autenticado')

      let paidViaTransactionId: string | null = null

      if (payload.net_amount > 0) {
        const { data: tx, error: txErr } = await supabase
          .from('transactions')
          .insert({
            date: payload.payment_date,
            amount: payload.net_amount,
            currency: 'ARS',
            description: `Pago de comisión ${payload.period_start} a ${payload.period_end}`,
            subcategory_id: payload.subcategory_id ?? null,
            catalog_item_id: null,
            is_seña: false,
            seña_amount: null,
            created_by: user.id,
          })
          .select('id')
          .single()
        if (txErr) throw new Error(txErr.message)

        const { error: pmtErr } = await supabase
          .from('transaction_payments')
          .insert({
            transaction_id: tx.id,
            payment_method: payload.payment_method,
            instrument: null,
            amount: payload.net_amount,
            type: 'salida',
          })
        if (pmtErr) throw new Error(pmtErr.message)

        paidViaTransactionId = tx.id
      }

      const { data, error } = await supabase.rpc('settle_commission_payout', {
        p_hairdresser_id: payload.hairdresser_id,
        p_period_start: payload.period_start,
        p_period_end: payload.period_end,
        p_gross_amount: payload.gross_amount,
        p_receivable_ids: payload.receivable_ids,
        p_paid_via_transaction_id: paidViaTransactionId,
        p_payment_method: payload.payment_method,
        p_payment_date: payload.payment_date,
        p_notes: payload.notes ?? null,
        p_created_by: user.id,
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
      qc.invalidateQueries({ queryKey: ['commissions-report'] })
    },
  })
}
