import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

// Transacciones que debían descontar inventario y no lo hicieron (por falta de stock
// al momento de registrarlas). Es la señal temprana de desvío entre sistema y físico.
export function usePendingInventoryCount() {
  return useQuery({
    queryKey: ['transactions', 'inventory-pending-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('inventory_pending', true)
        .is('voided_at', null)
      if (error) throw new Error(error.message)
      return count ?? 0
    },
  })
}
