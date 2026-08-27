import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRows } from '@/lib/fetchAllRows'
import type { TransactionRecipeCost } from '@/types'

type RecipeCostRow = Pick<TransactionRecipeCost, 'transaction_id' | 'quantity_grams' | 'avg_unit_cost' | 'unit_size'>

// Se pagina con fetchAllRows: Supabase corta en 1000 filas por request. Sin paginar, las
// transacciones cuyas filas quedaban afuera parecían NO tener foto de costo, así que el
// informe caía al costo en vivo de products_with_stock y su costo de material se recalculaba
// con los costos de hoy. Eso hacía que un recuento de inventario moviera la utilidad de meses
// cerrados. El ORDER BY id es necesario para que la paginación sea determinística.
export function useTransactionRecipeCosts() {
  return useQuery({
    queryKey: ['transaction-recipe-costs'],
    queryFn: async () =>
      fetchAllRows<RecipeCostRow>((rangeFrom, rangeTo) =>
        supabase
          .from('transaction_recipe_costs')
          .select('transaction_id, quantity_grams, avg_unit_cost, unit_size')
          .order('id', { ascending: true })
          .range(rangeFrom, rangeTo),
      ),
  })
}
