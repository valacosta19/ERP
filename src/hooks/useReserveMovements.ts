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
      reserve_name: string
      amount: number
      date: string
      note?: string | null
    }) => {
      const { reserve_name, ...movementPayload } = payload

      const { data: movement, error: movErr } = await supabase
        .from('reserve_movements')
        .insert(movementPayload)
        .select()
        .single()
      if (movErr) throw new Error(movErr.message)

      const { data: { user } } = await supabase.auth.getUser()
      const isDeposit = payload.amount > 0
      const description = isDeposit
        ? `Transferencia → ${reserve_name}`
        : `Retorno ← ${reserve_name}`

      const { data: subcat } = await supabase
        .from('transaction_categories')
        .select('id')
        .eq('name', 'Transferencia interna')
        .single()

      const { error: txErr } = await supabase
        .from('transactions')
        .insert({
          date: payload.date,
          amount: Math.abs(payload.amount),
          currency: 'ARS',
          description,
          subcategory_id: subcat?.id ?? null,
          catalog_item_id: null,
          is_seña: false,
          seña_amount: null,
          created_by: user?.id ?? null,
        })
      if (txErr) throw new Error(txErr.message)

      return movement as ReserveMovement
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reserve-movements'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['reports', 'financial'] })
    },
  })
}
