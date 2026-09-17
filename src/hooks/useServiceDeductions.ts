import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { useProducts } from '@/hooks/useProducts'
import { useTransactionRecipeCosts } from '@/hooks/useTransactionRecipeCosts'
import { useAllServiceRecipes } from '@/hooks/useServiceRecipes'
import { getCostPerGram } from '@/lib/recipeCost'
import type { ServiceRecipe } from '@/types'

export type ServiceDeduction = { commission: number; materials: number }

type TxRevenueRow = {
  id: string
  catalog_item_id: string
  amount: number
  seña_amount: number | null
  currency: string
  date: string
}

export function useServiceRevenueTransactions() {
  return useQuery<TxRevenueRow[]>({
    queryKey: ['tx-revenue-by-catalog-item'],
    queryFn: async () => {
      const rows = await fetchAllRows<TxRevenueRow & { transaction_categories: unknown }>((rangeFrom, rangeTo) =>
        supabase
          .from('transactions')
          .select('id, catalog_item_id, amount, seña_amount, currency, date, transaction_categories!subcategory_id!inner(transaction_type)')
          .eq('transaction_categories.transaction_type', 'income')
          .eq('is_seña', false)
          .not('catalog_item_id', 'is', null)
          .is('voided_at', null)
          .order('id', { ascending: true })
          .range(rangeFrom, rangeTo),
      )
      return rows.map(row => ({
        id: row.id,
        catalog_item_id: row.catalog_item_id,
        amount: row.amount,
        seña_amount: row.seña_amount,
        currency: row.currency,
        date: row.date,
      }))
    },
  })
}

export function useTransactionCommissionRates() {
  return useQuery<{ transaction_id: string; commission_rate: number }[]>({
    queryKey: ['tx-commissions-all'],
    queryFn: async () => {
      return fetchAllRows<{ transaction_id: string; commission_rate: number }>((rangeFrom, rangeTo) =>
        supabase
          .from('transaction_hairdressers')
          .select('transaction_id, commission_rate')
          .order('transaction_id', { ascending: true })
          .order('hairdresser_id', { ascending: true })
          .range(rangeFrom, rangeTo),
      )
    },
  })
}

export function useServiceDeductions(filters: { from?: string; to?: string; usdRate?: number }) {
  const { data: txRevenue = [] } = useServiceRevenueTransactions()
  const { data: txCommissions = [] } = useTransactionCommissionRates()
  const { data: allRecipes = [] } = useAllServiceRecipes()
  const { data: products = [] } = useProducts()
  const { data: txRecipeCosts = [] } = useTransactionRecipeCosts()

  const { from, to, usdRate } = filters

  const byMonth = useMemo(() => {
    if (usdRate == null) return new Map<string, ServiceDeduction>()
    const commRateByTx = new Map<string, number>()
    for (const tc of txCommissions) {
      commRateByTx.set(tc.transaction_id, (commRateByTx.get(tc.transaction_id) ?? 0) + tc.commission_rate)
    }
    const productMap = new Map(products.map(p => [p.id, p]))
    const recipesByService = new Map<string, ServiceRecipe[]>()
    for (const r of allRecipes) {
      if (!recipesByService.has(r.catalog_item_id)) recipesByService.set(r.catalog_item_id, [])
      recipesByService.get(r.catalog_item_id)!.push(r)
    }
    const snapshotByTx = new Map<string, number>()
    for (const s of txRecipeCosts) {
      snapshotByTx.set(s.transaction_id, (snapshotByTx.get(s.transaction_id) ?? 0) + s.quantity_grams * s.avg_unit_cost / s.unit_size)
    }
    const out = new Map<string, ServiceDeduction>()
    for (const tx of txRevenue) {
      if (from && tx.date < from) continue
      if (to && tx.date > to) continue
      const month = tx.date.slice(0, 7)
      if (!out.has(month)) out.set(month, { commission: 0, materials: 0 })
      const row = out.get(month)!
      const base = tx.amount + (tx.seña_amount ?? 0)
      const amountARS = tx.currency === 'USD' ? base * usdRate : base
      row.commission += amountARS * ((commRateByTx.get(tx.id) ?? 0) / 100)
      if (snapshotByTx.has(tx.id)) {
        row.materials += snapshotByTx.get(tx.id)!
      } else {
        for (const recipe of (recipesByService.get(tx.catalog_item_id) ?? [])) {
          const product = productMap.get(recipe.product_id)
          const costPerGram = product ? getCostPerGram(product) : null
          if (costPerGram == null) continue
          row.materials += recipe.quantity_grams * costPerGram
        }
      }
    }
    return out
  }, [txRevenue, txCommissions, allRecipes, products, txRecipeCosts, from, to, usdRate])

  const totals = useMemo(() => {
    let commission = 0
    let materials = 0
    for (const v of byMonth.values()) {
      commission += v.commission
      materials += v.materials
    }
    return { commission, materials }
  }, [byMonth])

  return { byMonth, totals }
}
