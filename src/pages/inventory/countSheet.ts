import { supabase } from '@/lib/supabaseClient'
import { parseNumberOrNull } from '../import/importLogic'
import type { RecountLine } from '@/hooks/useInventoryRecount'
import type { Product } from '@/types'
import { todayLocal } from '@/lib/dateRange'

export const COUNT_SHEET_NAME = 'Conteo'

export const COUNT_COLUMNS = {
  id: 'ID',
  sku: 'SKU',
  name: 'Producto',
  brand: 'Marca',
  unit: 'Unidad',
  systemStock: 'Stock sistema',
  countedQuantity: 'Conteo físico',
  lastPurchaseCost: 'Costo última compra',
  costToUse: 'Costo a usar',
  notes: 'Notas',
} as const

type CountSheetRow = Record<string, string | number>

const LOT_PAGE_SIZE = 1000

// Último costo de compra real por producto: el unit_cost del lote más reciente que
// vino de una orden de compra (ya trae el flete amortizado, o sea el costo puesto
// en el salón). Se pagina porque Supabase corta en 1000 filas por request y un
// producto viejo quedaría sin costo si su lote no entra en la primera página.
async function fetchLastPurchaseCosts(): Promise<Map<string, number>> {
  const costs = new Map<string, number>()

  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('inventory_lots')
      .select('product_id, unit_cost, received_date')
      .not('purchase_order_item_id', 'is', null)
      .order('received_date', { ascending: false })
      .range(page * LOT_PAGE_SIZE, (page + 1) * LOT_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)

    for (const lot of data ?? []) {
      if (!costs.has(lot.product_id)) costs.set(lot.product_id, Number(lot.unit_cost))
    }

    if (!data || data.length < LOT_PAGE_SIZE) break
  }

  return costs
}

function buildCountRows(products: Product[], costs: Map<string, number>): CountSheetRow[] {
  return products.map(p => {
    const lastCost = costs.get(p.id)
    return {
      [COUNT_COLUMNS.id]: p.id,
      [COUNT_COLUMNS.sku]: p.sku,
      [COUNT_COLUMNS.name]: p.name,
      [COUNT_COLUMNS.brand]: p.brand ?? '',
      [COUNT_COLUMNS.unit]: p.unit ?? '',
      [COUNT_COLUMNS.systemStock]: p.stock ?? 0,
      [COUNT_COLUMNS.countedQuantity]: '',
      [COUNT_COLUMNS.lastPurchaseCost]: lastCost ?? '',
      [COUNT_COLUMNS.costToUse]: lastCost ?? '',
      [COUNT_COLUMNS.notes]: lastCost == null ? 'Sin compras registradas — completar el costo a mano' : '',
    }
  })
}

type Xlsx = typeof import('xlsx')

function buildWorkbook(XLSX: Xlsx, rows: CountSheetRow[]) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: Object.values(COUNT_COLUMNS) as string[] })
  ws['!cols'] = [
    { wch: 38 }, { wch: 14 }, { wch: 34 }, { wch: 16 }, { wch: 10 },
    { wch: 13 }, { wch: 14 }, { wch: 19 }, { wch: 14 }, { wch: 42 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, COUNT_SHEET_NAME)
  return wb
}

export async function downloadCountSheet(products: Product[]): Promise<void> {
  const XLSX = await import('xlsx')
  const costs = await fetchLastPurchaseCosts()
  const wb = buildWorkbook(XLSX, buildCountRows(products, costs))
  const today = todayLocal()
  XLSX.writeFile(wb, `conteo-inventario-${today}.xlsx`)
}

export type ParsedCountSheet = {
  lines: RecountLine[]
  omitted: number
  errors: string[]
}

function rowLabel(row: Record<string, string>, index: number): string {
  const name = (row[COUNT_COLUMNS.name] ?? '').trim()
  const sku = (row[COUNT_COLUMNS.sku] ?? '').trim()
  return name || sku || `fila ${index + 2}`
}

// Regla central del recuento: celda vacía en "Conteo físico" significa "no lo conté"
// y el producto queda intacto. Un 0 explícito sí lleva el stock a cero.
export function parseCountSheet(
  rows: Record<string, string>[],
  knownProductIds: Set<string>
): ParsedCountSheet {
  const lines: RecountLine[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  let omitted = 0

  rows.forEach((row, index) => {
    const label = rowLabel(row, index)
    const quantity = parseNumberOrNull(row[COUNT_COLUMNS.countedQuantity] ?? '')

    if (quantity === null) {
      omitted++
      return
    }

    const productId = (row[COUNT_COLUMNS.id] ?? '').trim()
    if (!productId) {
      errors.push(`${label}: falta la columna ${COUNT_COLUMNS.id}. No borres esa columna de la planilla.`)
      return
    }
    if (!knownProductIds.has(productId)) {
      errors.push(`${label}: el producto no existe o está archivado.`)
      return
    }
    if (seen.has(productId)) {
      errors.push(`${label}: el producto aparece más de una vez en la planilla.`)
      return
    }
    if (quantity < 0) {
      errors.push(`${label}: la cantidad contada no puede ser negativa.`)
      return
    }

    const unitCost = parseNumberOrNull(row[COUNT_COLUMNS.costToUse] ?? '')
    if (quantity > 0 && unitCost === null) {
      errors.push(`${label}: falta el ${COUNT_COLUMNS.costToUse}.`)
      return
    }
    if (unitCost !== null && unitCost < 0) {
      errors.push(`${label}: el ${COUNT_COLUMNS.costToUse} no puede ser negativo.`)
      return
    }

    seen.add(productId)
    lines.push({ product_id: productId, quantity, unit_cost: unitCost ?? 0 })
  })

  return { lines, omitted, errors }
}
