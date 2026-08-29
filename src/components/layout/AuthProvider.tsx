import { useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { Profile } from '@/types'
import { AuthContext, type AuthContextValue } from './AuthContext'

interface SessionState {
  user: User | null
  session: Session | null
  sessionLoading: boolean
}

async function fetchProfile(user: User): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (error) throw new Error(error.message)
  return { ...data, email: user.email ?? '' } as Profile
}

async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return { error }
}

async function signOut() {
  await supabase.auth.signOut()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ user: null, session: null, sessionLoading: true })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({ user: session?.user ?? null, session, sessionLoading: false })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: session?.user ?? null, session, sessionLoading: false })
    })

    return () => subscription.unsubscribe()
  }, [])

  const user = state.user
  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => fetchProfile(user as User),
    enabled: !!user,
  })

  const value: AuthContextValue = {
    user,
    session: state.session,
    profile: user ? profileQuery.data ?? null : null,
    loading: state.sessionLoading || (!!user && profileQuery.isPending),
    profileError: profileQuery.error,
    refetchProfile: () => { void profileQuery.refetch() },
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
