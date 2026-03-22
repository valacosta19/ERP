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
  transactions: { id: string; amount: number; seña_amount: number | null; date: string } | null
}

interface CommissionsFilters {
  from?: string
  to?: string
}

export function useCommissionsReport(filters: CommissionsFilters = {}) {
  return useQuery({
    queryKey: ['reports', 'commissions', filters],
    queryFn: async () => {
      let query = supabase
        .from('transaction_hairdressers')
        .select('transaction_id, hairdresser_id, commission_rate, hairdressers(id, name), transactions(id, amount, seña_amount, date)')

      if (filters.from) query = query.gte('transactions.date', filters.from)
      if (filters.to) query = query.lte('transactions.date', filters.to)

      const { data, error } = await query
      if (error) throw new Error(error.message)

      const rows = (data as unknown as RawTxHd[]) ?? []

      return rows
        .filter(row => row.hairdressers !== null && row.transactions !== null)
        .map(row => ({
          transaction_id: row.transaction_id,
          professional_id: row.hairdresser_id,
          professional_name: row.hairdressers!.name,
          date: row.transactions!.date,
          total_amount: Number(row.transactions!.amount) + Number(row.transactions!.seña_amount ?? 0),
          commission_rate: row.commission_rate,
          commission_amount: (Number(row.transactions!.amount) + Number(row.transactions!.seña_amount ?? 0)) * (row.commission_rate / 100),
        })) as CommissionDetailRow[]
    },
  })
}
