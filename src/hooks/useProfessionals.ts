import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Professional } from '@/types'

export function useProfessionals() {
  return useQuery({
    queryKey: ['hairdressers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hairdressers')
        .select('*')
        .order('name')
      if (error) throw new Error(error.message)
      return data as Professional[]
    },
  })
}

export function useCreateProfessional() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('hairdressers')
        .insert({ name })
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as Professional
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hairdressers'] }),
  })
}

export function useUpdateProfessional() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; name?: string; active?: boolean; role_id?: string | null }) => {
      const { data, error } = await supabase
        .from('hairdressers')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as Professional
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hairdressers'] }),
  })
}

export function useDeleteProfessional() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('hairdressers').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hairdressers'] }),
  })
}
