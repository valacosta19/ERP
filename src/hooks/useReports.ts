import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Currency } from '@/types'

export type BalanceSheet = {
  cash: { method: string; amount: number }[]
  totalCash: number
  receivables: number
  inventoryValue: number
  totalAssets: number
  payables: number
  totalLiabilities: number
  equity: number
}

export type ProfitMonthRow = {
  month: string
  month_label: string
  product_revenue: number
  product_cogs: number
  product_profit: number
  service_income: number
  direct_costs: number
  operating_expenses: number
  total_profit: number
}

export type ProfitReport = {
  rows: ProfitMonthRow[]
  totals: Omit<ProfitMonthRow, 'month' | 'month_label'>
}

export type FinancialCategoryRow = {
  subcategory_id: string | null
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
  amount: number
  subcategory_id: string | null
  transaction_categories: { id: string; name: string; parent_id: string | null; transaction_type: string | null } | null
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
        .select('amount, subcategory_id, transaction_categories!subcategory_id(id, name, parent_id, transaction_type)')
        .is('voided_at', null)

      if (filters.from) query = query.gte('date', filters.from)
      if (filters.to) query = query.lte('date', filters.to)
      if (filters.currency) query = query.eq('currency', filters.currency)

      const { data, error } = await query
      if (error) throw new Error(error.message)

      const rows = (data as unknown as RawTx[]) ?? []
      const map = new Map<string, FinancialCategoryRow>()

      for (const row of rows) {
        if (row.transaction_categories?.transaction_type === 'transfer') continue
        const key = row.subcategory_id ?? '__none__'
        const income = row.transaction_categories?.transaction_type === 'income' ? Number(row.amount) : 0
        const expense = row.transaction_categories?.transaction_type === 'expense' ? Number(row.amount) : 0
        const existing = map.get(key)
        if (existing) {
          existing.income += income
          existing.expense += expense
          existing.balance = existing.income - existing.expense
        } else {
          map.set(key, {
            subcategory_id: row.subcategory_id,
            category_name: row.transaction_categories?.name ?? 'Sin categoría',
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

type RawPaymentWithTx = {
  payment_method: string
  amount: number
  transactions: {
    date: string
    voided_at: string | null
    transaction_categories: { transaction_type: string | null } | null
  } | null
}

export function useBalanceSheet(asOfDate?: string) {
  return useQuery<BalanceSheet>({
    queryKey: ['reports', 'balance-sheet', asOfDate],
    queryFn: async () => {
      const dateFilter = asOfDate ?? new Date().toISOString().slice(0, 10)

      const [paymentsRes, receivablesRes, lotsRes, debtsRes] = await Promise.all([
        supabase
          .from('transaction_payments')
          .select('payment_method, amount, transactions!inner(date, voided_at, transaction_categories!subcategory_id(transaction_type))')
          .is('transactions.voided_at', null)
          .lte('transactions.date', dateFilter),
        supabase.from('receivables').select('total_amount, collected_amount'),
        supabase.from('inventory_lots').select('remaining_quantity, unit_cost').gt('remaining_quantity', 0),
        supabase.from('supplier_debts').select('total_amount, paid_amount'),
      ])

      if (paymentsRes.error) throw new Error(paymentsRes.error.message)
      if (receivablesRes.error) throw new Error(receivablesRes.error.message)
      if (lotsRes.error) throw new Error(lotsRes.error.message)
      if (debtsRes.error) throw new Error(debtsRes.error.message)

      const cashMap = new Map<string, number>()
      for (const p of (paymentsRes.data as unknown as RawPaymentWithTx[])) {
        const txType = p.transactions?.transaction_categories?.transaction_type
        if (!txType || txType === 'transfer') continue
        const sign = txType === 'income' ? 1 : -1
        cashMap.set(p.payment_method, (cashMap.get(p.payment_method) ?? 0) + sign * Number(p.amount))
      }

      const cash = Array.from(cashMap.entries())
        .map(([method, amount]) => ({ method, amount }))
        .sort((a, b) => b.amount - a.amount)
      const totalCash = cash.reduce((s, c) => s + c.amount, 0)

      const receivables = ((receivablesRes.data ?? []) as { total_amount: number; collected_amount: number }[])
        .reduce((s, r) => s + (Number(r.total_amount) - Number(r.collected_amount)), 0)

      const inventoryValue = ((lotsRes.data ?? []) as { remaining_quantity: number; unit_cost: number }[])
        .reduce((s, l) => s + Number(l.remaining_quantity) * Number(l.unit_cost), 0)

      const payables = ((debtsRes.data ?? []) as { total_amount: number; paid_amount: number }[])
        .reduce((s, d) => s + (Number(d.total_amount) - Number(d.paid_amount)), 0)

      const totalAssets = totalCash + receivables + inventoryValue
      const totalLiabilities = payables
      const equity = totalAssets - totalLiabilities

      return { cash, totalCash, receivables, inventoryValue, totalAssets, payables, totalLiabilities, equity }
    },
  })
}

type RawSaleItem = {
  transaction_id: string
  quantity: number
  unit_cost: number
  unit_sale_price: number
  transactions: { date: string } | null
}

type RawTxProfit = {
  id: string
  date: string
  amount: number
  seña_amount: number | null
  is_seña: boolean
  currency: string
  subcategory_id: string | null
  transaction_categories: { name: string; transaction_type: string | null; parent_id: string | null } | null
}

function monthLabel(month: string) {
  const [y, m] = month.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
}

export function useProfitReport(filters: { from?: string; to?: string; usdRate?: number } = {}) {
  return useQuery<ProfitReport>({
    queryKey: ['reports', 'profit', filters],
    queryFn: async () => {
      const usdRate = filters.usdRate ?? 1
      const toARS = (amount: number, currency: string) =>
        currency === 'USD' ? amount * usdRate : amount

      const [saleItemsRes, txRes, catsRes] = await Promise.all([
        supabase.from('sale_items').select('transaction_id, quantity, unit_cost, unit_sale_price, transactions(date)'),
        supabase.from('transactions').select('id, date, amount, seña_amount, is_seña, currency, subcategory_id, transaction_categories!subcategory_id(name, transaction_type, parent_id)').is('voided_at', null),
        supabase.from('transaction_categories').select('id, name'),
      ])
      if (saleItemsRes.error) throw new Error(saleItemsRes.error.message)
      if (txRes.error) throw new Error(txRes.error.message)
      if (catsRes.error) throw new Error(catsRes.error.message)

      const catNameById = new Map<string, string>()
      for (const c of ((catsRes.data ?? []) as { id: string; name: string }[])) {
        catNameById.set(c.id, c.name)
      }

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

      const saleItemTxIds = new Set(saleItems.map(si => si.transaction_id))

      const byMonth = new Map<string, Omit<ProfitMonthRow, 'month' | 'month_label'>>()

      function ensure(month: string) {
        if (!byMonth.has(month)) {
          byMonth.set(month, {
            product_revenue: 0, product_cogs: 0, product_profit: 0,
            service_income: 0, direct_costs: 0, operating_expenses: 0, total_profit: 0,
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
        if (tx.is_seña) continue
        const serviceTotal = Number(tx.amount) + Number(tx.seña_amount ?? 0)
        const amountARS = toARS(serviceTotal, tx.currency)
        if (tx.transaction_categories?.transaction_type === 'income') {
          totalIncomeByMonth.set(month, (totalIncomeByMonth.get(month) ?? 0) + amountARS)
          const cat = tx.transaction_categories?.name?.toLowerCase()
          if (cat === 'servicio') {
            byMonth.get(month)!.service_income += amountARS
          } else if (cat === 'produto' && !saleItemTxIds.has(tx.id)) {
            byMonth.get(month)!.product_revenue += amountARS
          }
        } else if (tx.transaction_categories?.transaction_type === 'expense') {
          const parentId = tx.transaction_categories.parent_id
          const parentName = parentId ? (catNameById.get(parentId) ?? '') : ''
          if (parentName.toLowerCase() === 'costos') {
            byMonth.get(month)!.direct_costs += amountARS
          } else {
            byMonth.get(month)!.operating_expenses += amountARS
          }
        }
      }

      for (const [month, row] of byMonth) {
        const totalIncome = totalIncomeByMonth.get(month) ?? 0
        row.product_profit = row.product_revenue - row.product_cogs
        row.total_profit = totalIncome - row.product_cogs - row.direct_costs - row.operating_expenses
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
          direct_costs: acc.direct_costs + r.direct_costs,
          operating_expenses: acc.operating_expenses + r.operating_expenses,
          total_profit: acc.total_profit + r.total_profit,
        }),
        { product_revenue: 0, product_cogs: 0, product_profit: 0, service_income: 0, direct_costs: 0, operating_expenses: 0, total_profit: 0 }
      )

      return { rows, totals }
    },
  })
}
