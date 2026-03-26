import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Product, CatalogItem, FixedCost } from '@/types'
import type { ProfitMonthRow, FinancialCategoryRow } from './useReports'

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
  transactions: { id: string; amount: number; seña_amount: number | null; date: string; currency: string } | null
}

type RawTx = {
  date: string
  type: string
  amount: number
  currency: string
  categories: { name: string } | null
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
  type: string
  amount: number
  seña_amount: number | null
  is_seña: boolean
  currency: string
  categories: { name: string } | null
}

function monthLabel(month: string) {
  const [y, m] = month.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
}

export function useBusinessSnapshot() {
  return useQuery<BusinessSnapshot>({
    queryKey: ['ai-snapshot'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const now = new Date()
      const ago90 = new Date(now)
      ago90.setDate(ago90.getDate() - 90)
      const ago180 = new Date(now)
      ago180.setDate(ago180.getDate() - 180)
      const ago30 = new Date(now)
      ago30.setDate(ago30.getDate() - 30)

      const from90 = ago90.toISOString().slice(0, 10)
      const from180 = ago180.toISOString().slice(0, 10)
      const from30 = ago30.toISOString().slice(0, 10)

      const [
        profileRes,
        productsRes,
        fixedCostsRes,
        catalogRes,
        commissionsRes,
        recentTxRes,
        saleItemsRes,
        txProfitRes,
        catTxRes,
      ] = await Promise.all([
        supabase.from('profiles').select('business_name').limit(1),
        supabase.from('products_with_stock').select('*').order('name'),
        supabase.from('fixed_costs').select('*').order('name'),
        supabase.from('catalog_items').select('*').order('name'),
        supabase
          .from('transaction_hairdressers')
          .select('hairdresser_id, commission_rate, hairdressers(name), transactions(id, amount, seña_amount, date, currency)')
          .gte('transactions.date', from90),
        supabase
          .from('transactions')
          .select('date, type, amount, currency, categories(name)')
          .gte('date', from30)
          .order('date', { ascending: false }),
        supabase
          .from('sale_items')
          .select('transaction_id, quantity, unit_cost, unit_sale_price, transactions(date)')
          .gte('transactions.date', from180),
        supabase
          .from('transactions')
          .select('id, date, type, amount, seña_amount, is_seña, currency, categories(name)')
          .gte('date', from180),
        supabase
          .from('transactions')
          .select('type, amount, category_id, categories(name)')
          .gte('date', from90),
      ])

      if (profileRes.error) throw new Error(profileRes.error.message)
      if (productsRes.error) throw new Error(productsRes.error.message)
      if (fixedCostsRes.error) throw new Error(fixedCostsRes.error.message)
      if (catalogRes.error) throw new Error(catalogRes.error.message)
      if (commissionsRes.error) throw new Error(commissionsRes.error.message)
      if (recentTxRes.error) throw new Error(recentTxRes.error.message)
      if (saleItemsRes.error) throw new Error(saleItemsRes.error.message)
      if (txProfitRes.error) throw new Error(txProfitRes.error.message)
      if (catTxRes.error) throw new Error(catTxRes.error.message)

      const businessName = (profileRes.data as unknown as { business_name: string | null }[] | null)?.[0]?.business_name ?? 'Mi negocio'

      const commissionRows = (commissionsRes.data as unknown as RawTxHd[]) ?? []
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

      const recentTransactions: RecentTransactionRow[] = ((recentTxRes.data as unknown as RawTx[]) ?? []).map(tx => ({
        date: tx.date,
        type: tx.type,
        category: (tx as unknown as { categories: { name: string } | null }).categories?.name ?? null,
        amount: Number(tx.amount),
        currency: tx.currency,
      }))

      const saleItems = ((saleItemsRes.data as unknown as RawSaleItem[]) ?? []).filter(si => si.transactions?.date)
      const txs = (txProfitRes.data as unknown as RawTxProfit[]) ?? []
      const saleItemTxIds = new Set(saleItems.map(si => si.transaction_id))

      const byMonth = new Map<string, Omit<ProfitMonthRow, 'month' | 'month_label'>>()
      function ensure(month: string) {
        if (!byMonth.has(month)) {
          byMonth.set(month, { product_revenue: 0, product_cogs: 0, product_profit: 0, service_income: 0, total_expenses: 0, total_profit: 0 })
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
        if (tx.type === 'income') {
          totalIncomeByMonth.set(month, (totalIncomeByMonth.get(month) ?? 0) + serviceTotal)
          const cat = tx.categories?.name?.toLowerCase()
          if (cat === 'servicio') {
            byMonth.get(month)!.service_income += serviceTotal
          } else if (cat === 'producto' && !saleItemTxIds.has(tx.id)) {
            byMonth.get(month)!.product_revenue += serviceTotal
          }
        } else {
          byMonth.get(month)!.total_expenses += serviceTotal
        }
      }

      for (const [month, row] of byMonth) {
        const totalIncome = totalIncomeByMonth.get(month) ?? 0
        row.product_profit = row.product_revenue - row.product_cogs
        row.total_profit = totalIncome - row.product_cogs - row.total_expenses
      }

      const profitRows: ProfitMonthRow[] = Array.from(byMonth.entries())
        .map(([month, data]) => ({ month, month_label: monthLabel(month), ...data }))
        .sort((a, b) => b.month.localeCompare(a.month))
        .slice(0, 6)

      type RawCatTx = { type: string; amount: number; category_id: string | null; categories: { name: string } | null }
      const catTxRows = (catTxRes.data as unknown as RawCatTx[]) ?? []
      const catMap = new Map<string, FinancialCategoryRow>()
      for (const row of catTxRows) {
        const key = row.category_id ?? '__none__'
        const income = row.type === 'income' ? Number(row.amount) : 0
        const expense = row.type === 'expense' ? Number(row.amount) : 0
        const existing = catMap.get(key)
        if (existing) {
          existing.income += income
          existing.expense += expense
          existing.balance = existing.income - existing.expense
        } else {
          catMap.set(key, {
            category_id: row.category_id,
            category_name: row.categories?.name ?? 'Sin categoría',
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
