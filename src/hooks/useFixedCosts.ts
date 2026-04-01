import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { FixedCost, FixedCostRate } from '@/types'

export function useFixedCosts() {
  return useQuery({
    queryKey: ['fixed-costs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fixed_costs').select('*').order('name')
      if (error) throw new Error(error.message)
      return data as FixedCost[]
    },
  })
}

export function useCreateFixedCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; monthly_amount: number; active?: boolean }) => {
      const { data, error } = await supabase.from('fixed_costs').insert(payload).select().single()
      if (error) throw new Error(error.message)
      return data as FixedCost
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fixed-costs'] }),
  })
}

export function useUpdateFixedCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; monthly_amount?: number; active?: boolean }) => {
      const { data, error } = await supabase.from('fixed_costs').update(patch).eq('id', id).select().single()
      if (error) throw new Error(error.message)
      return data as FixedCost
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fixed-costs'] }),
  })
}

export function useDeleteFixedCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fixed_costs').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fixed-costs'] }),
  })
}

export function useAllFixedCostRates() {
  return useQuery({
    queryKey: ['fixed-cost-rates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixed_cost_rates')
        .select('*')
        .order('effective_from', { ascending: true })
      if (error) throw new Error(error.message)
      return data as FixedCostRate[]
    },
  })
}

export function useAddFixedCostRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { fixed_cost_id: string; monthly_amount: number; effective_from: string }) => {
      const { data, error } = await supabase
        .from('fixed_cost_rates')
        .insert(payload)
        .select()
        .single()
      if (error) throw new Error(error.message)
      const today = new Date().toISOString().slice(0, 10)
      if (payload.effective_from <= today) {
        const { error: updateErr } = await supabase
          .from('fixed_costs')
          .update({ monthly_amount: payload.monthly_amount })
          .eq('id', payload.fixed_cost_id)
        if (updateErr) throw new Error(updateErr.message)
      }
      return data as FixedCostRate
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fixed-costs'] })
      qc.invalidateQueries({ queryKey: ['fixed-cost-rates'] })
    },
  })
}
