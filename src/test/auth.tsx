import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '@/components/layout/AuthContext'

export function makeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    session: null,
    profile: null,
    loading: false,
    profileError: null,
    refetchProfile: () => {},
    signIn: async () => ({ error: null }),
    signOut: async () => {},
    ...overrides,
  }
}

export function withAuth(value: AuthContextValue, guarded: ReactNode) {
  return (
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={guarded} />
          <Route path="/login" element={<p>login page</p>} />
          <Route path="/dashboard" element={<p>dashboard page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  )
}
