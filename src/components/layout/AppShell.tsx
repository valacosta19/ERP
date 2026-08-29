import { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu, Scissors } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { AIWidget } from '@/components/AIWidget/AIWidget'
import { useFunnelSubmit } from '@/components/transactions/QuickFunnel/funnelSubmit'
import { flushQueue } from '@/components/transactions/QuickFunnel/offlineQueue'
import { showToast } from '@/lib/toast'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`fixed inset-y-0 left-0 z-30 md:static md:block transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <main className="flex-1 flex flex-col overflow-hidden bg-[var(--color-bg)] min-w-0">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[var(--color-accent)] flex items-center justify-center">
              <Scissors size={12} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-[var(--color-text)]">Buenas Ondas ERP</span>
          </div>
        </div>
        <Outlet />
      </main>
      <AIWidget />
    </div>
  )
}
