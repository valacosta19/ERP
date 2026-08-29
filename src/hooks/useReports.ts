import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { INVENTORY_PURCHASE_CATEGORY } from '@/lib/inventoryPurchaseCategory'
import type { Currency } from '@/types'
import { todayLocal } from '@/lib/dateRange'

export type BalanceSheet = {
  cash: { method: string; currency: Currency; amount: number }[]
  totalCash: number
  receivables: number
  receivablesByCurrency: { currency: Currency; amount: number }[]
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
      const rows = await fetchAllRows<RawTx>((rangeFrom, rangeTo) => {
        let query = supabase
          .from('transactions')
          .select('amount, subcategory_id, transaction_categories!subcategory_id(id, name, parent_id, transaction_type)')
          .is('voided_at', null)
          .order('id', { ascending: true })

        if (filters.from) query = query.gte('date', filters.from)
        if (filters.to) query = query.lte('date', filters.to)
        if (filters.currency) query = query.eq('currency', filters.currency)

        return query.range(rangeFrom, rangeTo)
      })

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
      const lots = await fetchAllRows<RawLot>((rangeFrom, rangeTo) =>
        supabase
          .from('inventory_lots')
          .select('product_id, remaining_quantity, unit_cost, products(name)')
          .gt('remaining_quantity', 0)
          .order('id', { ascending: true })
          .range(rangeFrom, rangeTo),
      )
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
    currency: Currency
    voided_at: string | null
    transaction_categories: { transaction_type: string | null } | null
  } | null
}

export function useBalanceSheet(asOfDate?: string) {
  return useQuery<BalanceSheet>({
    queryKey: ['reports', 'balance-sheet', asOfDate],
    queryFn: async () => {
      const dateFilter = asOfDate ?? todayLocal()

      type RawReceivable = { total_amount: number; collected_amount: number; currency: Currency }
      type RawOpenLot = { remaining_quantity: number; unit_cost: number }
      type RawDebt = { total_amount: number; paid_amount: number }
      const [payments, receivableRows, lotRows, debtRows] = await Promise.all([
        fetchAllRows<RawPaymentWithTx>((rangeFrom, rangeTo) =>
          supabase
            .from('transaction_payments')
            .select('payment_method, amount, transactions!inner(date, currency, voided_at, transaction_categories!subcategory_id(transaction_type))')
            .is('transactions.voided_at', null)
            .lte('transactions.date', dateFilter)
            .order('id', { ascending: true })
            .range(rangeFrom, rangeTo),
        ),
        fetchAllRows<RawReceivable>((rangeFrom, rangeTo) =>
          supabase.from('receivables').select('total_amount, collected_amount, currency').order('id', { ascending: true }).range(rangeFrom, rangeTo),
        ),
        fetchAllRows<RawOpenLot>((rangeFrom, rangeTo) =>
          supabase.from('inventory_lots').select('remaining_quantity, unit_cost').gt('remaining_quantity', 0).order('id', { ascending: true }).range(rangeFrom, rangeTo),
        ),
        fetchAllRows<RawDebt>((rangeFrom, rangeTo) =>
          supabase.from('supplier_debts').select('total_amount, paid_amount').order('id', { ascending: true }).range(rangeFrom, rangeTo),
        ),
      ])

      const cashMap = new Map<string, { method: string; currency: Currency; amount: number }>()
      for (const payment of payments) {
        const txType = payment.transactions?.transaction_categories?.transaction_type
        if (!txType || txType === 'transfer') continue
        const currency = payment.transactions?.currency ?? 'ARS'
        const key = `${payment.payment_method}:${currency}`
        const current = cashMap.get(key) ?? { method: payment.payment_method, currency, amount: 0 }
        current.amount += (txType === 'income' ? 1 : -1) * Number(payment.amount)
        cashMap.set(key, current)
      }

      const cash = Array.from(cashMap.values())
        .sort((a, b) => a.method.localeCompare(b.method) || a.currency.localeCompare(b.currency))
      const totalCash = cash
        .filter(balance => balance.currency === 'ARS')
        .reduce((sum, balance) => sum + balance.amount, 0)

      const receivablesMap = new Map<Currency, number>([['ARS', 0], ['USD', 0], ['EUR', 0]])
      for (const receivable of receivableRows) {
        receivablesMap.set(
          receivable.currency,
          (receivablesMap.get(receivable.currency) ?? 0)
            + Number(receivable.total_amount) - Number(receivable.collected_amount),
        )
      }
      const receivablesByCurrency = Array.from(receivablesMap.entries())
        .map(([currency, amount]) => ({ currency, amount }))
        .filter(balance => Math.abs(balance.amount) > 0.001)
      const receivables = receivablesMap.get('ARS') ?? 0

      const inventoryValue = lotRows
        .reduce((s, l) => s + Number(l.remaining_quantity) * Number(l.unit_cost), 0)

      const payables = debtRows
        .reduce((s, d) => s + (Number(d.total_amount) - Number(d.paid_amount)), 0)

      const totalAssets = totalCash + receivables + inventoryValue
      const totalLiabilities = payables
      const equity = totalAssets - totalLiabilities

      return { cash, totalCash, receivables, receivablesByCurrency, inventoryValue, totalAssets, payables, totalLiabilities, equity }
    },
  })
}

type RawSaleItem = {
  transaction_id: string
  quantity: number
  unit_cost: number
  unit_sale_price: number
  transactions: { date: string; transaction_categories: { transaction_type: string | null } | null } | null
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
    enabled: filters.usdRate != null,
    queryFn: async () => {
      const usdRate = filters.usdRate
      if (usdRate == null) throw new Error('Cotización USD no disponible')
      const toARS = (amount: number, currency: string) =>
        currency === 'USD' ? amount * usdRate : amount

      const [allSaleItems, allTxs, catsRes] = await Promise.all([
        fetchAllRows<RawSaleItem>((rangeFrom, rangeTo) =>
          supabase
            .from('sale_items')
            .select('transaction_id, quantity, unit_cost, unit_sale_price, transactions(date, transaction_categories!subcategory_id(transaction_type))')
            .order('id', { ascending: true })
            .range(rangeFrom, rangeTo),
        ),
        fetchAllRows<RawTxProfit>((rangeFrom, rangeTo) =>
          supabase
            .from('transactions')
            .select('id, date, amount, seña_amount, is_seña, currency, subcategory_id, transaction_categories!subcategory_id(name, transaction_type, parent_id)')
            .is('voided_at', null)
            .order('id', { ascending: true })
            .range(rangeFrom, rangeTo),
        ),
        supabase.from('transaction_categories').select('id, name'),
      ])
      if (catsRes.error) throw new Error(catsRes.error.message)

      const catNameById = new Map<string, string>()
      for (const c of ((catsRes.data ?? []) as { id: string; name: string }[])) {
        catNameById.set(c.id, c.name)
      }

      const saleItems = allSaleItems.filter(si => {
        const date = si.transactions?.date
        if (!date) return false
        if (filters.from && date < filters.from) return false
        if (filters.to && date > filters.to) return false
        return true
      })

      const txs = allTxs.filter(tx => {
        if (tx.currency === 'EUR') return false
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
        if (si.transactions?.transaction_categories?.transaction_type !== 'income') continue
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
          } else if (cat === 'producto' && !saleItemTxIds.has(tx.id)) {
            byMonth.get(month)!.product_revenue += amountARS
          }
        } else if (tx.transaction_categories?.transaction_type === 'expense') {
          // La compra de mercadería de inventario no entra al resultado: su costo se reconoce
          // vía product_cogs al venderse. Contarla también acá duplicaba el costo.
          if (tx.transaction_categories.name === INVENTORY_PURCHASE_CATEGORY) continue
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
