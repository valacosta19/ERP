import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

export type GrossProfitRow = {
  product_id: string
  product_name: string
  revenue: number
  cogs: number
  gross_profit: number
  margin: number
}

export type InventoryValuationRow = {
  product_id: string
  product_name: string
  total_units: number
  total_value: number
}

type RawSaleItem = {
  product_id: string
  quantity: number
  unit_cost: number
  unit_sale_price: number
  products: { name: string } | null
}

type RawLot = {
  product_id: string
  remaining_quantity: number
  unit_cost: number
  products: { name: string } | null
}

export function useGrossProfitReport() {
  return useQuery({
    queryKey: ['reports', 'gross-profit'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sale_items')
        .select('product_id, quantity, unit_cost, unit_sale_price, products(name)')
      if (error) throw new Error(error.message)

      const items = (data as unknown as RawSaleItem[]) ?? []
      const map = new Map<string, GrossProfitRow>()

      for (const item of items) {
        const revenue = Number(item.quantity) * Number(item.unit_sale_price)
        const cogs = Number(item.quantity) * Number(item.unit_cost)
        const existing = map.get(item.product_id)
        if (existing) {
          existing.revenue += revenue
          existing.cogs += cogs
          existing.gross_profit += revenue - cogs
        } else {
          map.set(item.product_id, {
            product_id: item.product_id,
            product_name: item.products?.name ?? 'Desconocido',
            revenue,
            cogs,
            gross_profit: revenue - cogs,
            margin: 0,
          })
        }
      }

      return Array.from(map.values())
        .map(row => ({
          ...row,
          margin: row.revenue > 0 ? (row.gross_profit / row.revenue) * 100 : 0,
        }))
        .sort((a, b) => b.gross_profit - a.gross_profit)
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
