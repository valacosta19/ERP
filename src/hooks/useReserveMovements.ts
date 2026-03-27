import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { ReserveMovement } from '@/types'

export function useReserveMovements() {
  return useQuery({
    queryKey: ['reserve-movements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reserve_movements')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data as ReserveMovement[]
    },
  })
}

export function useCreateReserveMovement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      reserve_id: string
      amount: number
      date: string
      note?: string | null
    }) => {
      const { data, error } = await supabase
        .from('reserve_movements')
        .insert(payload)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as ReserveMovement
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reserve-movements'] }),
  })
}
