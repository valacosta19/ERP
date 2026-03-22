import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Currency } from '@/types'

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
