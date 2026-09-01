import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { HairdresserService } from '@/types'

export function useHairdresserServices() {
  return useQuery({
    queryKey: ['hairdresser-services'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hairdresser_services').select('*')
      if (error) throw new Error(error.message)
      return data as HairdresserService[]
    },
  })
}

export function useSetHairdresserServices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      hairdresser_id,
      rows,
    }: {
      hairdresser_id: string
      rows: { catalog_item_id: string; commission_rate: number | null }[]
    }) => {
      const toDelete = rows.filter(r => r.commission_rate == null).map(r => r.catalog_item_id)
      const toUpsert = rows
        .filter((r): r is { catalog_item_id: string; commission_rate: number } => r.commission_rate != null)
        .map(r => ({ hairdresser_id, catalog_item_id: r.catalog_item_id, commission_rate: r.commission_rate }))

      if (toDelete.length > 0) {
        const { error } = await supabase
          .from('hairdresser_services')
          .delete()
          .eq('hairdresser_id', hairdresser_id)
          .in('catalog_item_id', toDelete)
        if (error) throw new Error(error.message)
      }
      if (toUpsert.length > 0) {
        const { error } = await supabase.from('hairdresser_services').upsert(toUpsert)
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hairdresser-services'] }),
  })
}
