import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { ReserveMovement } from '@/types'
import { invalidateAccounting } from '@/lib/invalidateAccounting'

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
      reserve_name: string
      amount: number
      date: string
      payment_method: string
      note?: string | null
    }) => {
      const { data, error } = await supabase.rpc('create_reserve_movement_atomic', {
        p_reserve_id: payload.reserve_id,
        p_amount: payload.amount,
        p_date: payload.date,
        p_payment_method: payload.payment_method,
        p_note: payload.note ?? null,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => invalidateAccounting(qc, [['reserve-movements']]),
  })
}

export function useUpdateReserveMovement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { id: string; amount: number; date: string }) => {
      const { data, error } = await supabase.rpc('update_reserve_movement', {
        p_id: payload.id,
        p_amount: payload.amount,
        p_date: payload.date,
      })
      if (error) throw new Error(error.message)
      return data as { mirror_updated: boolean }
    },
    onSuccess: () => invalidateAccounting(qc, [['reserve-movements']]),
  })
}
