import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { StaffRole } from '@/types'

export function useStaffRoles() {
  return useQuery({
    queryKey: ['staff-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_roles')
        .select('*')
        .order('name')
      if (error) throw new Error(error.message)
      return data as StaffRole[]
    },
  })
}

export function useCreateStaffRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('staff_roles')
        .insert({ name })
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as StaffRole
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-roles'] }),
  })
}

export function useUpdateStaffRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; name?: string; assigns_services?: boolean; earns_commission?: boolean }) => {
      const { data, error } = await supabase
        .from('staff_roles')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as StaffRole
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-roles'] }),
  })
}

export function useDeleteStaffRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('staff_roles').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-roles'] })
      void qc.invalidateQueries({ queryKey: ['hairdressers'] })
    },
  })
}
