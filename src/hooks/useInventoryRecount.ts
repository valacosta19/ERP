import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Json } from '@/types/database'

export type RecountLine = {
  product_id: string
  quantity: number
  unit_cost: number
}

export type RecountPreviewLine = {
  product_id: string
  product_name: string
  sku: string
  system_quantity: number
  counted_quantity: number
  delta_quantity: number
  unit_cost: number
  value_before: number
  value_after: number
  delta_value: number
}

export type RecountTotals = {
  contados: number
  omitidos: number
  valor_antes: number
  valor_despues: number
  delta_valor: number
  faltantes: number
  sobrantes: number
}

export type RecountPreview = {
  lines: RecountPreviewLine[]
  totals: RecountTotals
}

export type RecountApplyResult = {
  recount_id: string
  totals: RecountTotals
  already_applied: boolean
}

export type InventoryRecount = {
  id: string
  cutoff_date: string
  totals: RecountTotals
  created_at: string
}

export function useInventoryRecounts() {
  return useQuery({
    queryKey: ['inventory_recounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_recounts')
        .select('id, cutoff_date, totals, created_at')
        .order('cutoff_date', { ascending: false })
      if (error) throw new Error(error.message)
      return data as unknown as InventoryRecount[]
    },
  })
}

export function useInventoryRecountPreview() {
  return useMutation({
    mutationFn: async (lines: RecountLine[]) => {
      const { data, error } = await supabase.rpc('preview_inventory_recount', {
        p_lines: lines as unknown as Json,
      })
      if (error) throw new Error(error.message)
      return data as unknown as RecountPreview
    },
  })
}

interface ApplyRecountPayload {
  clientUuid: string
  cutoffDate: string
  lines: RecountLine[]
  createdBy: string | null
}

export function useApplyInventoryRecount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ clientUuid, cutoffDate, lines, createdBy }: ApplyRecountPayload) => {
      const { data, error } = await supabase.rpc('apply_inventory_recount', {
        p_client_uuid: clientUuid,
        p_cutoff_date: cutoffDate,
        p_lines: lines as unknown as Json,
        p_created_by: createdBy,
      })
      if (error) throw new Error(error.message)
      return data as unknown as RecountApplyResult
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['inventory_lots'] })
      qc.invalidateQueries({ queryKey: ['inventory_recounts'] })
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
