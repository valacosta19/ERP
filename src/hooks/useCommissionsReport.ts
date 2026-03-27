import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

export type CommissionDetailRow = {
  transaction_id: string
  professional_id: string
  professional_name: string
  date: string
  total_amount: number
  commission_rate: number
  commission_amount: number
}

type RawTxHd = {
  transaction_id: string
  hairdresser_id: string
  commission_rate: number
  hairdressers: { id: string; name: string } | null
  transactions: { id: string; amount: number; seña_amount: number | null; date: string; currency: string; voided_at: string | null } | null
}

interface CommissionsFilters {
  from?: string
  to?: string
  usdRate?: number
}

export function useCommissionsReport(filters: CommissionsFilters = {}) {
  return useQuery({
    queryKey: ['reports', 'commissions', filters],
    queryFn: async () => {
      const usdRate = filters.usdRate ?? 1
      const toARS = (amount: number, currency: string) =>
        currency === 'USD' ? amount * usdRate : amount

      let query = supabase
        .from('transaction_hairdressers')
        .select('transaction_id, hairdresser_id, commission_rate, hairdressers(id, name), transactions(id, amount, seña_amount, date, currency, voided_at)')
        .is('transactions.voided_at', null)

      if (filters.from) query = query.gte('transactions.date', filters.from)
      if (filters.to) query = query.lte('transactions.date', filters.to)

      const { data, error } = await query
      if (error) throw new Error(error.message)

      const rows = (data as unknown as RawTxHd[]) ?? []

      return rows
        .filter(row => row.hairdressers !== null && row.transactions !== null)
        .map(row => {
          const tx = row.transactions!
          const amountARS = toARS(Number(tx.amount), tx.currency)
          const señaARS = toARS(Number(tx.seña_amount ?? 0), tx.currency)
          const totalARS = amountARS + señaARS
          return {
            transaction_id: row.transaction_id,
            professional_id: row.hairdresser_id,
            professional_name: row.hairdressers!.name,
            date: tx.date,
            total_amount: totalARS,
            commission_rate: row.commission_rate,
            commission_amount: totalARS * (row.commission_rate / 100),
          }
        }) as CommissionDetailRow[]
    },
  })
}
