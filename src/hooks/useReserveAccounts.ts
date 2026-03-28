import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { ReserveAccount } from '@/types'

export function useReserveAccounts() {
  return useQuery({
    queryKey: ['reserve-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reserve_accounts')
        .select('*')
        .order('created_at')
      if (error) throw new Error(error.message)
      return data as ReserveAccount[]
    },
  })
}

export function useCreateReserveAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; description?: string | null }) => {
      const { data, error } = await supabase
        .from('reserve_accounts')
        .insert(payload)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as ReserveAccount
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reserve-accounts'] }),
  })
}

export function useDeleteReserveAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('reserve_accounts')
        .delete()
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reserve-accounts'] })
      qc.invalidateQueries({ queryKey: ['reserve-movements'] })
    },
  })
}
