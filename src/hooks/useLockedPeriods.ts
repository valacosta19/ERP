import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

export interface LockedPeriod {
  year: number
  month: number
  locked_at: string
  locked_by: string | null
}

export function useLockedPeriods() {
  return useQuery({
    queryKey: ['locked-periods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locked_periods')
        .select('*')
        .order('year', { ascending: false })
        .order('month', { ascending: false })
      if (error) throw new Error(error.message)
      return data as LockedPeriod[]
    },
  })
}

export function useLockPeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ year, month }: { year: number; month: number }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('locked_periods')
        .insert({ year, month, locked_by: user?.id ?? null })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locked-periods'] })
    },
  })
}

export function useUnlockPeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ year, month }: { year: number; month: number }) => {
      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await supabase
        .from('locked_periods')
        .delete()
        .eq('year', year)
        .eq('month', month)
      if (error) throw new Error(error.message)

      const { error: logError } = await supabase
        .from('user_action_logs')
        .insert({
          user_id: user?.id ?? null,
          action: 'unlock_period',
          entity: 'locked_periods',
          entity_id: null,
          metadata: { year, month },
        })
      if (logError) throw new Error(logError.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locked-periods'] })
    },
  })
}

export function useIsMonthLocked(year: number, month: number): boolean {
  const { data } = useLockedPeriods()
  if (!data) return false
  return data.some(p => p.year === year && p.month === month)
}
