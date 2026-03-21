import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { PaymentMethodConfig } from '@/types'

export function usePaymentMethods() {
  return useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return data as PaymentMethodConfig[]
    },
  })
}

export function useCreatePaymentMethod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('payment_methods')
        .insert({ name })
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as PaymentMethodConfig
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-methods'] }),
  })
}

export function useUpdatePaymentMethod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Omit<PaymentMethodConfig, 'created_at'>> & { id: string }) => {
      const { data, error } = await supabase
        .from('payment_methods')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as PaymentMethodConfig
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-methods'] }),
  })
}

export function useDeletePaymentMethod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payment_methods').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-methods'] }),
  })
}
