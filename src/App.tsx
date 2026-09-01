import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/Toaster'
import { ConfirmHost } from '@/components/ui/ConfirmHost'
import { showToast } from '@/lib/toast'
import { AppShell } from '@/components/layout/AppShell'
import { AuthGuard } from '@/components/layout/AuthGuard'
import { AuthProvider } from '@/components/layout/AuthProvider'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import { LoginPage } from '@/pages/auth/LoginPage'
import { TransactionsPage } from '@/pages/transactions/TransactionsPage'
import { QuickFunnelPage } from '@/pages/transactions/QuickFunnelPage'
import { InventoryPage } from '@/pages/inventory/InventoryPage'
import { SuppliersPage } from '@/pages/suppliers/SuppliersPage'

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })))
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage').then(m => ({ default: m.ReportsPage })))
const ImportPage = lazy(() => import('@/pages/import/ImportPage').then(m => ({ default: m.ImportPage })))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage').then(m => ({ default: m.SettingsPage })))
const PurchaseOrdersPage = lazy(() => import('@/pages/purchase-orders/PurchaseOrdersPage').then(m => ({ default: m.PurchaseOrdersPage })))
const FondosPage = lazy(() => import('@/pages/fondos/FondosPage').then(m => ({ default: m.FondosPage })))
const CuentasPage = lazy(() => import('@/pages/cuentas/CuentasPage').then(m => ({ default: m.CuentasPage })))
const RecipesPage = lazy(() => import('@/pages/recipes/RecipesPage').then(m => ({ default: m.RecipesPage })))

function RouteFallback() {
  return (
    <div className="flex justify-center py-16">
      <span className="inline-block w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
  mutationCache: new MutationCache({
    onError: error => showToast(error.message || 'No se pudo guardar el cambio.'),
  }),
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <AuthGuard>
                <ErrorBoundary>
                  <AppShell />
                </ErrorBoundary>
              </AuthGuard>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
            <Route path="/transactions" element={<ErrorBoundary><TransactionsPage /></ErrorBoundary>} />
            <Route path="/transactions/cargar" element={<ErrorBoundary><QuickFunnelPage /></ErrorBoundary>} />
            <Route path="/inventory" element={<ErrorBoundary><InventoryPage /></ErrorBoundary>} />
            <Route path="/purchase-orders" element={<ErrorBoundary><PurchaseOrdersPage /></ErrorBoundary>} />
            <Route path="/suppliers" element={<ErrorBoundary><SuppliersPage /></ErrorBoundary>} />
            <Route path="/reports" element={<ErrorBoundary><ReportsPage /></ErrorBoundary>} />
            <Route
              path="/import"
              element={
                <AuthGuard requireAdmin>
                  <ErrorBoundary><ImportPage /></ErrorBoundary>
                </AuthGuard>
              }
            />
            <Route
              path="/settings"
              element={
                <AuthGuard requireAdmin>
                  <ErrorBoundary><SettingsPage /></ErrorBoundary>
                </AuthGuard>
              }
            />
            <Route
              path="/fondos"
              element={
                <AuthGuard requireAdmin>
                  <ErrorBoundary><FondosPage /></ErrorBoundary>
                </AuthGuard>
              }
            />
            <Route
              path="/cuentas"
              element={
                <AuthGuard requireAdmin>
                  <ErrorBoundary><CuentasPage /></ErrorBoundary>
                </AuthGuard>
              }
            />
            <Route
              path="/recetas"
              element={
                <AuthGuard requireAdmin>
                  <ErrorBoundary><RecipesPage /></ErrorBoundary>
                </AuthGuard>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </AuthProvider>
      <Toaster />
      <ConfirmHost />
    </QueryClientProvider>
  )
}
