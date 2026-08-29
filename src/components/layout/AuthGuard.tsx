import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import type { ReactNode } from 'react'

interface AuthGuardProps {
  children: ReactNode
  requireAdmin?: boolean
}

function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
      <span className="w-7 h-7 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function ProfileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-medium text-[var(--color-text)]">No se pudo cargar tu perfil</p>
      <p className="text-xs text-[var(--color-muted)]">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>Reintentar</Button>
    </div>
  )
}

export function AuthGuard({ children, requireAdmin }: AuthGuardProps) {
  const { user, profile, loading, profileError, refetchProfile } = useAuth()

  if (loading) return <FullScreenSpinner />
  if (!user) return <Navigate to="/login" replace />

  if (requireAdmin) {
    if (profileError) return <ProfileError message={profileError.message} onRetry={refetchProfile} />
    if (profile?.role !== 'admin') return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
