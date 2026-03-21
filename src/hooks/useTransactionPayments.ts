import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { TransactionPayment } from '@/types'

export function useTransactionPayments(transactionId: string | null) {
  return useQuery({
    queryKey: ['transaction_payments', transactionId],
    enabled: !!transactionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transaction_payments')
        .select('*')
        .eq('transaction_id', transactionId!)
        .order('created_at')
      if (error) throw new Error(error.message)
      return data as TransactionPayment[]
    },
  })
}
