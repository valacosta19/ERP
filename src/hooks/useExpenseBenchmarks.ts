import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { ExpenseBenchmark } from '@/types'

export function useExpenseBenchmarks() {
  return useQuery({
    queryKey: ['expense-benchmarks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_benchmarks')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw new Error(error.message)
      return data as ExpenseBenchmark[]
    },
  })
}

// Consulta aparte y no en `useProfitReport`: si falta la migración 096, lo único
// que se degrada es la asignación de rubros, no el resultado del período.
export function useCategoryBenchmarkKeys() {
  return useQuery({
    queryKey: ['category-benchmark-keys'],
    queryFn: async () => {
      const { data, error } = await supabase.from('transaction_categories').select('id, benchmark_key')
      if (error) throw new Error(error.message)
      const out: Record<string, string | null> = {}
      for (const row of (data as { id: string; benchmark_key: string | null }[])) {
        out[row.id] = row.benchmark_key
      }
      return out
    },
    retry: false,
  })
}

export function useUpdateExpenseBenchmark() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, min_pct, max_pct }: { key: string; min_pct: number; max_pct: number }) => {
      if (min_pct < 0 || max_pct < min_pct || max_pct > 100) {
        throw new Error('El rango debe cumplir 0 ≤ mínimo ≤ máximo ≤ 100')
      }
      const { data, error } = await supabase
        .from('expense_benchmarks')
        .update({ min_pct, max_pct })
        .eq('key', key)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as ExpenseBenchmark
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense-benchmarks'] }),
  })
}
