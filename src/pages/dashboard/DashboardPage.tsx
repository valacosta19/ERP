import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Wallet, Receipt } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { TopBar } from '@/components/layout/TopBar'
import { useTransactions } from '@/hooks/useTransactions'
import type { Transaction } from '@/types'

function kpiCard(label: string, value: string, sub: string, icon: React.ReactNode, color: string) {
  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-[var(--color-muted)] font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-[var(--color-text)] mt-0.5 font-display">{value}</p>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

function fmt(n: number) {
  return `$${n.toLocaleString('es-CO', { minimumFractionDigits: 0 })}`
}

function getMonthKey(dateStr: string) {
  return dateStr.slice(0, 7)
}

function getMonthLabel(key: string) {
  const [year, month] = key.split('-')
  return new Date(Number(year), Number(month) - 1).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' })
}

function buildChartData(transactions: Transaction[]) {
  const now = new Date()
  const months: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const map: Record<string, { ingresos: number; gastos: number }> = {}
  for (const m of months) map[m] = { ingresos: 0, gastos: 0 }

  for (const tx of transactions) {
    const key = getMonthKey(tx.date)
    if (!map[key]) continue
    if (tx.type === 'income') map[key].ingresos += tx.amount
    else map[key].gastos += tx.amount
  }

  return months.map(m => ({ mes: getMonthLabel(m), ingresos: map[m].ingresos, gastos: map[m].gastos }))
}

export function DashboardPage() {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const { data: transactions = [], isLoading } = useTransactions()

  const thisMonth = useMemo(
    () => transactions.filter(tx => tx.date.startsWith(currentMonth)),
    [transactions, currentMonth]
  )

  const ingresos = useMemo(() => thisMonth.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), [thisMonth])
  const gastos = useMemo(() => thisMonth.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0), [thisMonth])
  const balance = ingresos - gastos
  const chartData = useMemo(() => buildChartData(transactions), [transactions])

  const monthLabel = new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <TopBar title="Dashboard" subtitle="Resumen general del negocio" />
        <div className="p-6 flex justify-center pt-20">
          <span className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <TopBar title="Dashboard" subtitle={`Resumen de ${monthLabel}`} />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpiCard(
            'Ingresos del mes',
            fmt(ingresos),
            monthLabel,
            <TrendingUp size={18} className="text-[var(--color-success)]" />,
            'bg-[var(--color-success-light)]'
          )}
          {kpiCard(
            'Gastos del mes',
            fmt(gastos),
            monthLabel,
            <TrendingDown size={18} className="text-[var(--color-danger)]" />,
            'bg-[var(--color-danger-light)]'
          )}
          {kpiCard(
            'Balance neto',
            fmt(balance),
            balance >= 0 ? 'Superávit' : 'Déficit',
            <Wallet size={18} className={balance >= 0 ? 'text-[var(--color-accent)]' : 'text-[var(--color-warning)]'} />,
            balance >= 0 ? 'bg-[var(--color-accent-light)]' : 'bg-[var(--color-warning-light)]'
          )}
          {kpiCard(
            'Transacciones',
            String(thisMonth.length),
            'este mes',
            <Receipt size={18} className="text-[var(--color-muted)]" />,
            'bg-[var(--color-bg)]'
          )}
        </div>

        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Ingresos vs Gastos — últimos 6 meses</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => fmt(v)}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Area type="monotone" dataKey="ingresos" name="Ingresos" stroke="#10B981" strokeWidth={2} fill="url(#gradIncome)" />
              <Area type="monotone" dataKey="gastos" name="Gastos" stroke="#EF4444" strokeWidth={2} fill="url(#gradExpense)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
