import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { TransactionRecipeCost } from '@/types'

export function useTransactionRecipeCosts() {
  return useQuery({
    queryKey: ['transaction-recipe-costs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transaction_recipe_costs')
        .select('transaction_id, quantity_grams, avg_unit_cost, unit_size')
      if (error) throw new Error(error.message)
      return data as Pick<TransactionRecipeCost, 'transaction_id' | 'quantity_grams' | 'avg_unit_cost' | 'unit_size'>[]
    },
  })
}
