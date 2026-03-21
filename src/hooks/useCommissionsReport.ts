import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

export type CommissionRow = {
  professional_id: string
  professional_name: string
  transaction_count: number
  total_amount: number
  commission_amount: number
  effective_rate: number
}

type RawTxHd = {
  transaction_id: string
  hairdresser_id: string
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
        .select('transaction_id, hairdresser_id, hairdressers(id, name), transactions(id, amount, seña_amount, date)')

      if (filters.from) query = query.gte('transactions.date', filters.from)
      if (filters.to) query = query.lte('transactions.date', filters.to)

      const { data, error } = await query
      if (error) throw new Error(error.message)

      const rows = (data as unknown as RawTxHd[]) ?? []

      const txHairdresserCount = new Map<string, number>()
      for (const row of rows) {
        const count = (txHairdresserCount.get(row.transaction_id) ?? 0) + 1
        txHairdresserCount.set(row.transaction_id, count)
      }

      const hdMap = new Map<string, CommissionRow>()

      for (const row of rows) {
        if (!row.hairdressers || !row.transactions) continue

        const hairdresserCount = txHairdresserCount.get(row.transaction_id) ?? 1
        const rate = hairdresserCount === 1 ? 0.4 : 0.2
        const amount = Number(row.transactions.amount) + Number(row.transactions.seña_amount ?? 0)
        const commission = amount * rate

        const existing = hdMap.get(row.hairdresser_id)
        if (existing) {
          existing.transaction_count += 1
          existing.total_amount += amount
          existing.commission_amount += commission
          existing.effective_rate = existing.total_amount > 0 ? existing.commission_amount / existing.total_amount : 0
        } else {
          hdMap.set(row.hairdresser_id, {
            professional_id: row.hairdresser_id,
            professional_name: row.hairdressers.name,
            transaction_count: 1,
            total_amount: amount,
            commission_amount: commission,
            effective_rate: rate,
          })
        }
      }

      return Array.from(hdMap.values()).sort((a, b) => b.commission_amount - a.commission_amount)
    },
  })
}
