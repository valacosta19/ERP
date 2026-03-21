import { TopBar } from '@/components/layout/TopBar'

export function DashboardPage() {
  return (
    <div className="animate-fade-in">
      <TopBar title="Dashboard" subtitle="Resumen general del negocio" />
      <div className="p-6">
        <p className="text-[var(--color-muted)] text-sm">Próximamente — Fase 2</p>
      </div>
    </div>
  )
}
