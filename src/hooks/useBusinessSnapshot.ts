import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Product, CatalogItem, FixedCost } from '@/types'
import type { ProfitMonthRow, FinancialCategoryRow } from './useReports'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { daysAgoLocal } from '@/lib/dateRange'

export interface CommissionSummaryRow {
  professional_name: string
  total_commissions: number
  service_count: number
}

export interface RecentTransactionRow {
  date: string
  type: string
  category: string | null
  amount: number
  currency: string
}

export interface BusinessSnapshot {
  businessName: string
  profitRows: ProfitMonthRow[]
  categoryRows: FinancialCategoryRow[]
  products: Product[]
  fixedCosts: FixedCost[]
  catalogItems: CatalogItem[]
  commissions: CommissionSummaryRow[]
  recentTransactions: RecentTransactionRow[]
}

type RawTxHd = {
  hairdresser_id: string
  commission_rate: number
  hairdressers: { name: string } | null
  transactions: { id: string; amount: number; seña_amount: number | null; date: string; currency: string; voided_at: string | null } | null
}

type RawTx = {
  date: string
  amount: number
  currency: string
  transaction_categories: { name: string; transaction_type: string | null } | null
}

type RawSaleItem = {
  transaction_id: string
  quantity: number
  unit_cost: number
  unit_sale_price: number
  transactions: { date: string } | null
}

type RawCatTx = {
  amount: number
  seña_amount: number | null
  is_seña: boolean
  subcategory_id: string | null
  transaction_categories: { name: string; transaction_type: string | null } | null
}

type RawTxProfit = {
  id: string
  date: string
  amount: number
  seña_amount: number | null
  is_seña: boolean
  currency: string
  transaction_categories: { name: string; transaction_type: string | null } | null
}

function monthLabel(month: string) {
  const [y, m] = month.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
}

export function useBusinessSnapshot(enabled = true) {
  return useQuery<BusinessSnapshot>({
    queryKey: ['ai-snapshot'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const from90 = daysAgoLocal(90)
      const from180 = daysAgoLocal(180)
      const from30 = daysAgoLocal(30)

      const [
        profileRes,
        productsRes,
        fixedCostsRes,
        catalogRes,
        commissionRows,
        recentTxRows,
        saleItemRows,
        txs,
        catTxRows,
      ] = await Promise.all([
        supabase.from('profiles').select('business_name').limit(1),
        supabase.from('products_with_stock').select('*').order('name'),
        supabase.from('fixed_costs').select('*').order('name'),
        supabase.from('catalog_items').select('*').order('name'),
        fetchAllRows<RawTxHd>((rangeFrom, rangeTo) =>
          supabase
            .from('transaction_hairdressers')
            .select('hairdresser_id, commission_rate, hairdressers(name), transactions!inner(id, amount, seña_amount, date, currency, voided_at)')
            .is('transactions.voided_at', null)
            .gte('transactions.date', from90)
            .order('transaction_id', { ascending: true })
            .order('hairdresser_id', { ascending: true })
            .range(rangeFrom, rangeTo),
        ),
        fetchAllRows<RawTx>((rangeFrom, rangeTo) =>
          supabase
            .from('transactions')
            .select('date, amount, currency, transaction_categories!subcategory_id(name, transaction_type)')
            .is('voided_at', null)
            .gte('date', from30)
            .order('date', { ascending: false })
            .order('id', { ascending: false })
            .range(rangeFrom, rangeTo),
        ),
        fetchAllRows<RawSaleItem>((rangeFrom, rangeTo) =>
          supabase
            .from('sale_items')
            .select('transaction_id, quantity, unit_cost, unit_sale_price, transactions!inner(date)')
            .gte('transactions.date', from180)
            .order('id', { ascending: true })
            .range(rangeFrom, rangeTo),
        ),
        fetchAllRows<RawTxProfit>((rangeFrom, rangeTo) =>
          supabase
            .from('transactions')
            .select('id, date, amount, seña_amount, is_seña, currency, transaction_categories!subcategory_id(name, transaction_type)')
            .is('voided_at', null)
            .gte('date', from180)
            .order('id', { ascending: true })
            .range(rangeFrom, rangeTo),
        ),
        fetchAllRows<RawCatTx>((rangeFrom, rangeTo) =>
          supabase
            .from('transactions')
            .select('amount, seña_amount, is_seña, subcategory_id, transaction_categories!subcategory_id(name, transaction_type)')
            .is('voided_at', null)
            .gte('date', from90)
            .order('id', { ascending: true })
            .range(rangeFrom, rangeTo),
        ),
      ])

      if (profileRes.error) throw new Error(profileRes.error.message)
      if (productsRes.error) throw new Error(productsRes.error.message)
      if (fixedCostsRes.error) throw new Error(fixedCostsRes.error.message)
      if (catalogRes.error) throw new Error(catalogRes.error.message)

      const businessName = (profileRes.data as unknown as { business_name: string | null }[] | null)?.[0]?.business_name ?? 'Mi negocio'

      const commissionMap = new Map<string, CommissionSummaryRow>()
      for (const row of commissionRows) {
        if (!row.hairdressers || !row.transactions) continue
        const name = row.hairdressers.name
        const tx = row.transactions
        const total = Number(tx.amount) + Number(tx.seña_amount ?? 0)
        const commission = total * (row.commission_rate / 100)
        const existing = commissionMap.get(name)
        if (existing) {
          existing.total_commissions += commission
          existing.service_count += 1
        } else {
          commissionMap.set(name, { professional_name: name, total_commissions: commission, service_count: 1 })
        }
      }
      const commissions = Array.from(commissionMap.values()).sort((a, b) => b.total_commissions - a.total_commissions)

      const recentTransactions: RecentTransactionRow[] = recentTxRows.map(tx => ({
        date: tx.date,
        type: tx.transaction_categories?.transaction_type ?? 'expense',
        category: tx.transaction_categories?.name ?? null,
        amount: Number(tx.amount),
        currency: tx.currency,
      }))

      const saleItems = saleItemRows.filter(si => si.transactions?.date)
      const saleItemTxIds = new Set(saleItems.map(si => si.transaction_id))

      const byMonth = new Map<string, Omit<ProfitMonthRow, 'month' | 'month_label'>>()
      function ensure(month: string) {
        if (!byMonth.has(month)) {
          byMonth.set(month, { product_revenue: 0, product_cogs: 0, product_profit: 0, service_income: 0, direct_costs: 0, operating_expenses: 0, total_profit: 0 })
        }
        return byMonth.get(month)!
      }

      for (const si of saleItems) {
        const month = si.transactions!.date.slice(0, 7)
        const row = ensure(month)
        row.product_revenue += Number(si.unit_sale_price) * Number(si.quantity)
        row.product_cogs += Number(si.unit_cost) * Number(si.quantity)
      }

      const totalIncomeByMonth = new Map<string, number>()
      for (const tx of txs) {
        const month = tx.date.slice(0, 7)
        ensure(month)
        if (tx.is_seña) continue
        const serviceTotal = Number(tx.amount) + Number(tx.seña_amount ?? 0)
        if (tx.transaction_categories?.transaction_type === 'income') {
          totalIncomeByMonth.set(month, (totalIncomeByMonth.get(month) ?? 0) + serviceTotal)
          const cat = tx.transaction_categories?.name?.toLowerCase()
          if (cat === 'servicio') {
            byMonth.get(month)!.service_income += serviceTotal
          } else if (cat === 'producto' && !saleItemTxIds.has(tx.id)) {
            byMonth.get(month)!.product_revenue += serviceTotal
          }
        } else if (tx.transaction_categories?.transaction_type === 'expense') {
          byMonth.get(month)!.operating_expenses += serviceTotal
        }
      }

      for (const [month, row] of byMonth) {
        const totalIncome = totalIncomeByMonth.get(month) ?? 0
        row.product_profit = row.product_revenue - row.product_cogs
        row.total_profit = totalIncome - row.product_cogs - row.direct_costs - row.operating_expenses
      }

      const profitRows: ProfitMonthRow[] = Array.from(byMonth.entries())
        .map(([month, data]) => ({ month, month_label: monthLabel(month), ...data }))
        .sort((a, b) => b.month.localeCompare(a.month))
        .slice(0, 6)

      const catMap = new Map<string, FinancialCategoryRow>()
      for (const row of catTxRows) {
        if (row.is_seña) continue
        if (row.transaction_categories?.transaction_type === 'transfer') continue
        const key = row.subcategory_id ?? '__none__'
        const total = Number(row.amount) + Number(row.seña_amount ?? 0)
        const income = row.transaction_categories?.transaction_type === 'income' ? total : 0
        const expense = row.transaction_categories?.transaction_type === 'expense' ? total : 0
        const existing = catMap.get(key)
        if (existing) {
          existing.income += income
          existing.expense += expense
          existing.balance = existing.income - existing.expense
        } else {
          catMap.set(key, {
            subcategory_id: row.subcategory_id,
            category_name: row.transaction_categories?.name ?? 'Sin categoría',
            income,
            expense,
            balance: income - expense,
          })
        }
      }
      const categoryRows = Array.from(catMap.values()).sort((a, b) => b.income - a.income)

      return {
        businessName,
        profitRows,
        categoryRows,
        products: productsRes.data as Product[],
        fixedCosts: fixedCostsRes.data as FixedCost[],
        catalogItems: catalogRes.data as CatalogItem[],
        commissions,
        recentTransactions,
      }
    },
  })
}
