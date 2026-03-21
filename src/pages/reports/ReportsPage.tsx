import { TopBar } from '@/components/layout/TopBar'
import { Table } from '@/components/ui/Table'
import { useGrossProfitReport, useInventoryValuation } from '@/hooks/useReports'
import type { GrossProfitRow, InventoryValuationRow } from '@/hooks/useReports'

const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

const grossProfitColumns = [
  { key: 'product_name', header: 'Producto' },
  {
    key: 'revenue',
    header: 'Ingresos',
    render: (r: GrossProfitRow) => fmt.format(r.revenue),
    className: 'text-right',
  },
  {
    key: 'cogs',
    header: 'Costo (COGS)',
    render: (r: GrossProfitRow) => fmt.format(r.cogs),
    className: 'text-right',
  },
  {
    key: 'gross_profit',
    header: 'Utilidad bruta',
    render: (r: GrossProfitRow) => fmt.format(r.gross_profit),
    className: 'text-right',
  },
  {
    key: 'margin',
    header: 'Margen',
    render: (r: GrossProfitRow) => `${r.margin.toFixed(1)}%`,
    className: 'text-right',
  },
]

const valuationColumns = [
  { key: 'product_name', header: 'Producto' },
  {
    key: 'total_units',
    header: 'Unidades en stock',
    render: (r: InventoryValuationRow) => r.total_units.toFixed(2),
    className: 'text-right',
  },
  {
    key: 'total_value',
    header: 'Valor total',
    render: (r: InventoryValuationRow) => fmt.format(r.total_value),
    className: 'text-right',
  },
]

export function ReportsPage() {
  const grossProfit = useGrossProfitReport()
  const valuation = useInventoryValuation()

  const totalRevenue = grossProfit.data?.reduce((s, r) => s + r.revenue, 0) ?? 0
  const totalGrossProfit = grossProfit.data?.reduce((s, r) => s + r.gross_profit, 0) ?? 0
  const totalInventoryValue = valuation.data?.reduce((s, r) => s + r.total_value, 0) ?? 0

  return (
    <div className="animate-fade-in">
      <TopBar title="Reportes" />
      <div className="p-6 space-y-8">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Ingresos totales</p>
            <p className="text-2xl font-semibold text-[var(--color-text)] mt-1">{fmt.format(totalRevenue)}</p>
          </div>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Utilidad bruta total</p>
            <p className="text-2xl font-semibold text-[var(--color-text)] mt-1">{fmt.format(totalGrossProfit)}</p>
          </div>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Valor de inventario</p>
            <p className="text-2xl font-semibold text-[var(--color-text)] mt-1">{fmt.format(totalInventoryValue)}</p>
          </div>
        </div>

        <section>
          <h2 className="text-base font-semibold text-[var(--color-text)] mb-3">Utilidad bruta por producto</h2>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <Table<GrossProfitRow>
              columns={grossProfitColumns}
              data={grossProfit.data ?? []}
              keyField="product_id"
              loading={grossProfit.isLoading}
              emptyMessage="Sin ventas registradas"
            />
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--color-text)] mb-3">Valorización de inventario</h2>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <Table<InventoryValuationRow>
              columns={valuationColumns}
              data={valuation.data ?? []}
              keyField="product_id"
              loading={valuation.isLoading}
              emptyMessage="Sin lotes en inventario"
            />
          </div>
        </section>
      </div>
    </div>
  )
}
