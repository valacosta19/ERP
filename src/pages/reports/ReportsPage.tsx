import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Table } from '@/components/ui/Table'
import { Input } from '@/components/ui/Input'
import { useGrossProfitReport, useInventoryValuation } from '@/hooks/useReports'
import { useCommissionsReport } from '@/hooks/useCommissionsReport'
import type { GrossProfitRow, InventoryValuationRow } from '@/hooks/useReports'
import type { CommissionRow } from '@/hooks/useCommissionsReport'

type Tab = 'financiero' | 'comisiones'

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

const commissionColumns = [
  { key: 'hairdresser_name', header: 'Peluquera' },
  {
    key: 'transaction_count',
    header: 'Transacciones',
    render: (r: CommissionRow) => r.transaction_count,
    className: 'text-right',
  },
  {
    key: 'total_amount',
    header: 'Total facturado',
    render: (r: CommissionRow) => fmt.format(r.total_amount),
    className: 'text-right',
  },
  {
    key: 'effective_rate',
    header: 'Tasa efectiva',
    render: (r: CommissionRow) => `${(r.effective_rate * 100).toFixed(1)}%`,
    className: 'text-right',
  },
  {
    key: 'commission_amount',
    header: 'Comisión',
    render: (r: CommissionRow) => fmt.format(r.commission_amount),
    className: 'text-right font-semibold',
  },
]

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('financiero')
  const [commFrom, setCommFrom] = useState('')
  const [commTo, setCommTo] = useState('')

  const grossProfit = useGrossProfitReport()
  const valuation = useInventoryValuation()
  const commissions = useCommissionsReport({ from: commFrom || undefined, to: commTo || undefined })

  const totalRevenue = grossProfit.data?.reduce((s, r) => s + r.revenue, 0) ?? 0
  const totalGrossProfit = grossProfit.data?.reduce((s, r) => s + r.gross_profit, 0) ?? 0
  const totalInventoryValue = valuation.data?.reduce((s, r) => s + r.total_value, 0) ?? 0
  const totalCommissions = commissions.data?.reduce((s, r) => s + r.commission_amount, 0) ?? 0

  return (
    <div className="animate-fade-in">
      <TopBar title="Reportes" />
      <div className="p-6 space-y-6">
        <div className="flex gap-1 border-b border-[var(--color-border)]">
          <button
            onClick={() => setActiveTab('financiero')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'financiero'
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Financiero
          </button>
          <button
            onClick={() => setActiveTab('comisiones')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'comisiones'
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Comisiones
          </button>
        </div>

        {activeTab === 'financiero' && (
          <>
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
          </>
        )}

        {activeTab === 'comisiones' && (
          <>
            <div className="flex flex-wrap gap-3 items-end">
              <Input
                label="Desde"
                type="date"
                value={commFrom}
                onChange={e => setCommFrom(e.target.value)}
                className="w-40"
              />
              <Input
                label="Hasta"
                type="date"
                value={commTo}
                onChange={e => setCommTo(e.target.value)}
                className="w-40"
              />
            </div>

            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4 w-fit">
              <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Total comisiones</p>
              <p className="text-2xl font-semibold text-[var(--color-text)] mt-1">{fmt.format(totalCommissions)}</p>
            </div>

            <section>
              <h2 className="text-base font-semibold text-[var(--color-text)] mb-3">Comisiones por peluquera</h2>
              <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                <Table<CommissionRow>
                  columns={commissionColumns}
                  data={commissions.data ?? []}
                  keyField="hairdresser_id"
                  loading={commissions.isLoading}
                  emptyMessage="Sin transacciones con peluqueras en el período"
                />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
