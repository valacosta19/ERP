import { useEffect, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { LogOut, Scissors } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { MobileBottomNav } from './MobileBottomNav'
import { useAuth } from '@/hooks/useAuth'
import { useFunnelSubmit } from '@/components/transactions/QuickFunnel/funnelSubmit'
import { flushQueue } from '@/components/transactions/QuickFunnel/offlineQueue'
import { showToast } from '@/lib/toast'

export function AppShell() {
  const { profile, signOut } = useAuth()
  const { submitTicket } = useFunnelSubmit()
  const submitRef = useRef(submitTicket)
  useEffect(() => {
    submitRef.current = submitTicket
  }, [submitTicket])

  useEffect(() => {
    const doFlush = () => void flushQueue(payload => submitRef.current(payload)).catch((e: Error) => showToast(`Cola offline: ${e.message}`))
    doFlush()
    window.addEventListener('online', doFlush)
    const id = setInterval(doFlush, 20_000)
    return () => {
      window.removeEventListener('online', doFlush)
      clearInterval(id)
    }
  }, [])

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <div className="hidden md:block md:static">
        <Sidebar />
      </div>

      <main className="flex-1 flex flex-col overflow-hidden bg-[var(--color-bg)] min-w-0">
        <div className="mobile-app-header md:hidden">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[var(--color-accent)] flex items-center justify-center">
              <Scissors size={12} className="text-white" />
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-semibold text-[var(--color-text)] truncate">{profile?.business_name || 'Buenas Ondas ERP'}</span>
              <span className="block text-[10px] text-[var(--color-muted)] truncate">{profile?.full_name || 'Usuario'}</span>
            </div>
          </div>
          <button onClick={() => void signOut()} className="mobile-icon-button" aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </div>
        <div className="app-shell__content flex-1 min-h-0 flex flex-col">
          <Outlet />
        </div>
        <MobileBottomNav />
      </main>
    </div>
  )
}
