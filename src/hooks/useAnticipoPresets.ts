import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { AnticipoPreset } from '@/types'

export function useAnticipoPresets() {
  return useQuery({
    queryKey: ['anticipo-presets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('anticipo_presets')
        .select('*')
        .order('amount', { ascending: true })
      if (error) throw new Error(error.message)
      return data as AnticipoPreset[]
    },
  })
}

export function useCreateAnticipoPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (amount: number) => {
      const { data, error } = await supabase
        .from('anticipo_presets')
        .insert({ amount })
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as AnticipoPreset
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['anticipo-presets'] }),
  })
}

export function useDeleteAnticipoPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('anticipo_presets').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['anticipo-presets'] }),
  })
}
