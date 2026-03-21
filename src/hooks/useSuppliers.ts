import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Database } from '@/types/database'
import type { Supplier } from '@/types'

type SupplierInsert = Database['public']['Tables']['suppliers']['Insert']
type SupplierUpdate = Database['public']['Tables']['suppliers']['Update']

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name')
      if (error) throw new Error(error.message)
      return data as Supplier[]
    },
  })
}

interface SupplierPayload {
  name: string
  contact: string | null
  phone: string | null
  email: string | null
  notes: string | null
}

export function useCreateSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SupplierPayload) => {
      const { data, error } = await supabase
        .from('suppliers')
        .insert(payload as SupplierInsert)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as Supplier
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

export function useUpdateSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: SupplierPayload & { id: string }) => {
      const { data, error } = await supabase
        .from('suppliers')
        .update(payload as SupplierUpdate)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as Supplier
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

export function useDeleteSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('suppliers').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}
