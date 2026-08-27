import { supabase } from './supabaseClient'

// Categoría DEDICADA al pago de órdenes de compra de mercadería con lotes.
// `useProfitReport` la EXCLUYE de `direct_costs` a propósito: el costo de esa mercadería entra
// al resultado vía `product_cogs` cuando se vende (docs/accounting.md, sección 16). Contarla en
// los dos lugares duplicaba el costo.
//
// Tiene que ser una categoría propia y no reutilizar 'Productos profesionales': esa se usa
// también para compras de gasto directo (tinturas, oxidantes) que NO tienen lotes y por lo tanto
// nunca generan COGS. Excluir esa categoría entera borraba costos reales de la utilidad.
// Ver migración 070.
export const INVENTORY_PURCHASE_CATEGORY = 'Compra de inventario (OC)'

export async function fetchInventoryPurchaseCategoryId(): Promise<string> {
  const { data, error } = await supabase
    .from('transaction_categories')
    .select('id')
    .eq('name', INVENTORY_PURCHASE_CATEGORY)
    .single()
  if (error) {
    throw new Error(
      `No se pudo resolver la categoría "${INVENTORY_PURCHASE_CATEGORY}": ${error.message}. ` +
      'Si está duplicada en Configuración, dejá una sola fila con ese nombre.'
    )
  }
  return data.id
}
