import { useContext } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Profile } from '@/types'
import { AuthContext } from '@/components/layout/AuthContext'

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at')
      if (error) throw new Error(error.message)
      return data as Profile[]
    },
  })
}

export function useInviteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ email, role, full_name }: { email: string; role: 'admin' | 'employee'; full_name: string }) => {
      const { error } = await supabase.functions.invoke('invite-user', {
        body: { email, role, full_name },
      })
      if (error) {
        let msg = error.message
        try {
          const body = await (error as unknown as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.()
          if (body?.error) msg = body.error
        } catch {
          throw new Error(msg)
        }
        throw new Error(msg)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUserRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: 'admin' | 'employee' }) => {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, business_name }: { id: string; business_name: string | null }) => {
      const { data, error } = await supabase
        .from('profiles')
        .update({ business_name })
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as Profile
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  })
}
