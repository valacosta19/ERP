import { createContext } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import type { Profile } from '@/types'

export interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  profileError: Error | null
  refetchProfile: () => void
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
