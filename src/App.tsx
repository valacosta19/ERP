import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { AuthGuard } from '@/components/layout/AuthGuard'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import { LoginPage } from '@/pages/auth/LoginPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { TransactionsPage } from '@/pages/transactions/TransactionsPage'
import { QuickFunnelPage } from '@/pages/transactions/QuickFunnelPage'
import { InventoryPage } from '@/pages/inventory/InventoryPage'
import { PurchaseOrdersPage } from '@/pages/purchase-orders/PurchaseOrdersPage'
import { SuppliersPage } from '@/pages/suppliers/SuppliersPage'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { ImportPage } from '@/pages/import/ImportPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { FondosPage } from '@/pages/fondos/FondosPage'
import { CuentasPage } from '@/pages/cuentas/CuentasPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <AuthGuard>
                <AppShell />
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
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
