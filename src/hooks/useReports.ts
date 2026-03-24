import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Currency } from '@/types'

export type ProfitMonthRow = {
  month: string
  month_label: string
  product_revenue: number
  product_cogs: number
  product_profit: number
  service_income: number
  total_expenses: number
  total_profit: number
}

export type ProfitReport = {
  rows: ProfitMonthRow[]
  totals: Omit<ProfitMonthRow, 'month' | 'month_label'>
}

export type FinancialCategoryRow = {
  category_id: string | null
  category_name: string
  income: number
  expense: number
  balance: number
}

export type FinancialReport = {
  summary: { total_income: number; total_expense: number; balance: number }
  categories: FinancialCategoryRow[]
}

export type InventoryValuationRow = {
  product_id: string
  product_name: string
  total_units: number
  total_value: number
}

type RawTx = {
  type: string
  amount: number
  category_id: string | null
  categories: { name: string } | null
}

type RawLot = {
  product_id: string
  remaining_quantity: number
  unit_cost: number
  products: { name: string } | null
}

export function useFinancialReport(filters: { from?: string; to?: string; currency?: Currency } = {}) {
  return useQuery({
    queryKey: ['reports', 'financial', filters],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('type, amount, category_id, categories(name)')

      if (filters.from) query = query.gte('date', filters.from)
      if (filters.to) query = query.lte('date', filters.to)
      if (filters.currency) query = query.eq('currency', filters.currency)

      const { data, error } = await query
      if (error) throw new Error(error.message)

      const rows = (data as unknown as RawTx[]) ?? []
      const map = new Map<string, FinancialCategoryRow>()

      for (const row of rows) {
        const key = row.category_id ?? '__none__'
        const income = row.type === 'income' ? Number(row.amount) : 0
        const expense = row.type === 'expense' ? Number(row.amount) : 0
        const existing = map.get(key)
        if (existing) {
          existing.income += income
          existing.expense += expense
          existing.balance = existing.income - existing.expense
        } else {
          map.set(key, {
            category_id: row.category_id,
            category_name: row.categories?.name ?? 'Sin categoría',
            income,
            expense,
            balance: income - expense,
          })
        }
      }

      const categories = Array.from(map.values()).sort((a, b) => b.income - a.income)
      const total_income = categories.reduce((s, r) => s + r.income, 0)
      const total_expense = categories.reduce((s, r) => s + r.expense, 0)

      return {
        summary: { total_income, total_expense, balance: total_income - total_expense },
        categories,
      } as FinancialReport
    },
  })
}

export function useInventoryValuation() {
  return useQuery({
    queryKey: ['reports', 'inventory-valuation'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_lots')
        .select('product_id, remaining_quantity, unit_cost, products(name)')
        .gt('remaining_quantity', 0)
      if (error) throw new Error(error.message)

      const lots = (data as unknown as RawLot[]) ?? []
      const map = new Map<string, InventoryValuationRow>()

      for (const lot of lots) {
        const units = Number(lot.remaining_quantity)
        const value = units * Number(lot.unit_cost)
        const existing = map.get(lot.product_id)
        if (existing) {
          existing.total_units += units
          existing.total_value += value
        } else {
          map.set(lot.product_id, {
            product_id: lot.product_id,
            product_name: lot.products?.name ?? 'Desconocido',
            total_units: units,
            total_value: value,
          })
        }
      }

      return Array.from(map.values()).sort((a, b) => b.total_value - a.total_value)
    },
  })
}

type RawSaleItem = {
  quantity: number
  unit_cost: number
  unit_sale_price: number
  transactions: { date: string } | null
}

type RawTxProfit = {
  date: string
  type: string
  amount: number
}

function monthLabel(month: string) {
  const [y, m] = month.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
}

export function useProfitReport(filters: { from?: string; to?: string } = {}) {
  return useQuery<ProfitReport>({
    queryKey: ['reports', 'profit', filters],
    queryFn: async () => {
      const [saleItemsRes, txRes] = await Promise.all([
        supabase.from('sale_items').select('quantity, unit_cost, unit_sale_price, transactions(date)'),
        supabase.from('transactions').select('date, type, amount'),
      ])
      if (saleItemsRes.error) throw new Error(saleItemsRes.error.message)
      if (txRes.error) throw new Error(txRes.error.message)

      const saleItems = ((saleItemsRes.data as unknown as RawSaleItem[]) ?? []).filter(si => {
        const date = si.transactions?.date
        if (!date) return false
        if (filters.from && date < filters.from) return false
        if (filters.to && date > filters.to) return false
        return true
      })

      const txs = ((txRes.data as unknown as RawTxProfit[]) ?? []).filter(tx => {
        if (filters.from && tx.date < filters.from) return false
        if (filters.to && tx.date > filters.to) return false
        return true
      })

      const byMonth = new Map<string, Omit<ProfitMonthRow, 'month' | 'month_label'>>()

      function ensure(month: string) {
        if (!byMonth.has(month)) {
          byMonth.set(month, {
            product_revenue: 0, product_cogs: 0, product_profit: 0,
            service_income: 0, total_expenses: 0, total_profit: 0,
          })
        }
        return byMonth.get(month)!
      }

      for (const si of saleItems) {
        const month = si.transactions!.date.slice(0, 7)
        const row = ensure(month)
        const rev = Number(si.unit_sale_price) * Number(si.quantity)
        const cogs = Number(si.unit_cost) * Number(si.quantity)
        row.product_revenue += rev
        row.product_cogs += cogs
      }

      const totalIncomeByMonth = new Map<string, number>()
      for (const tx of txs) {
        const month = tx.date.slice(0, 7)
        ensure(month)
        if (tx.type === 'income') {
          totalIncomeByMonth.set(month, (totalIncomeByMonth.get(month) ?? 0) + Number(tx.amount))
        } else {
          byMonth.get(month)!.total_expenses += Number(tx.amount)
        }
      }

      for (const [month, row] of byMonth) {
        const totalIncome = totalIncomeByMonth.get(month) ?? 0
        row.product_profit = row.product_revenue - row.product_cogs
        row.service_income = Math.max(0, totalIncome - row.product_revenue)
        row.total_profit = row.product_profit + row.service_income - row.total_expenses
      }

      const rows: ProfitMonthRow[] = Array.from(byMonth.entries())
        .map(([month, data]) => ({ month, month_label: monthLabel(month), ...data }))
        .sort((a, b) => b.month.localeCompare(a.month))

      const totals = rows.reduce(
        (acc, r) => ({
          product_revenue: acc.product_revenue + r.product_revenue,
          product_cogs: acc.product_cogs + r.product_cogs,
          product_profit: acc.product_profit + r.product_profit,
          service_income: acc.service_income + r.service_income,
          total_expenses: acc.total_expenses + r.total_expenses,
          total_profit: acc.total_profit + r.total_profit,
        }),
        { product_revenue: 0, product_cogs: 0, product_profit: 0, service_income: 0, total_expenses: 0, total_profit: 0 }
      )

      return { rows, totals }
    },
  })
}
