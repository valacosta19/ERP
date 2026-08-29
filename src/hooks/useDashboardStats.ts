import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRows } from '@/lib/fetchAllRows'

type LeanTx = {
  date: string
  amount: number
  voided_at: string | null
  subcategory: { transaction_type: string } | null
}

const SELECT = 'date, amount, voided_at, subcategory:transaction_categories!subcategory_id(transaction_type)'

function monthStart(offsetMonths: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offsetMonths)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function monthEnd(offsetMonths: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + offsetMonths + 1)
  d.setDate(0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useDashboardStats() {
  const currentMonthFrom = monthStart(0)
  const currentMonthTo = monthEnd(0)
  const chartFrom = monthStart(-5)

  const { data: thisMonth = [], isLoading: loadingMonth } = useQuery({
    queryKey: ['dashboard-current-month', currentMonthFrom],
    queryFn: () =>
      fetchAllRows<LeanTx>(async (from, to) => {
        const result = await supabase
          .from('transactions')
          .select(SELECT)
          .is('voided_at', null)
          .gte('date', currentMonthFrom)
          .lte('date', currentMonthTo)
          .order('date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
        return result as { data: unknown; error: { message: string } | null }
      }),
  })

  const { data: last6Months = [], isLoading: loadingChart } = useQuery({
    queryKey: ['dashboard-last-6-months', chartFrom],
    queryFn: () =>
      fetchAllRows<LeanTx>(async (from, to) => {
        const result = await supabase
          .from('transactions')
          .select(SELECT)
          .is('voided_at', null)
          .gte('date', chartFrom)
          .order('date', { ascending: false })
          .range(from, to)
        return result as { data: unknown; error: { message: string } | null }
      }),
  })

  return { thisMonth, last6Months, isLoading: loadingMonth || loadingChart }
}
