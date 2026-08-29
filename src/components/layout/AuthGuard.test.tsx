// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types'
import { AuthGuard } from './AuthGuard'
import { makeAuth, withAuth } from '@/test/auth'

const user = { id: 'u1' } as User
const admin = { id: 'u1', role: 'admin' } as Profile
const employee = { id: 'u1', role: 'employee' } as Profile

afterEach(cleanup)

describe('AuthGuard', () => {
  it('shows a spinner while the session resolves', () => {
    const { container } = render(withAuth(makeAuth({ loading: true }), <AuthGuard>secret</AuthGuard>))
    expect(container.querySelector('.animate-spin')).not.toBeNull()
    expect(screen.queryByText('secret')).toBeNull()
  })

  it('redirects to login without a user', () => {
    render(withAuth(makeAuth(), <AuthGuard>secret</AuthGuard>))
    expect(screen.getByText('login page')).toBeTruthy()
  })

  it('renders children for a logged-in user on a non-admin route even without a profile', () => {
    render(withAuth(makeAuth({ user }), <AuthGuard>secret</AuthGuard>))
    expect(screen.getByText('secret')).toBeTruthy()
  })

  it('renders children for an admin on an admin route', () => {
    render(withAuth(makeAuth({ user, profile: admin }), <AuthGuard requireAdmin>secret</AuthGuard>))
    expect(screen.getByText('secret')).toBeTruthy()
  })

  it('redirects an employee away from an admin route', () => {
    render(withAuth(makeAuth({ user, profile: employee }), <AuthGuard requireAdmin>secret</AuthGuard>))
    expect(screen.getByText('dashboard page')).toBeTruthy()
  })

  it('shows a retry state instead of redirecting when the profile failed to load', () => {
    const refetchProfile = vi.fn()
    render(withAuth(makeAuth({ user, profileError: new Error('RLS'), refetchProfile }), <AuthGuard requireAdmin>secret</AuthGuard>))
    expect(screen.getByText('No se pudo cargar tu perfil')).toBeTruthy()
    expect(screen.queryByText('dashboard page')).toBeNull()
    fireEvent.click(screen.getByText('Reintentar'))
    expect(refetchProfile).toHaveBeenCalledTimes(1)
  })
})
