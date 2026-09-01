interface CostSource {
  unit_size?: number | null
  min_cost?: number | null
  max_cost?: number | null
}

export function getAvgUnitCost(product: CostSource): number | null {
  if (product.min_cost == null && product.max_cost == null) return null
  const min = product.min_cost ?? product.max_cost ?? 0
  const max = product.max_cost ?? min
  return (min + max) / 2
}

export function getCostPerGram(product: CostSource): number | null {
  if (!product.unit_size) return null
  return (getAvgUnitCost(product) ?? 0) / product.unit_size
}

export function materialCostByService(
  recipes: { catalog_item_id: string; product_id: string; quantity_grams: number }[],
  productById: Map<string, CostSource>,
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const r of recipes) {
    const product = productById.get(r.product_id)
    const costPerGram = product ? getCostPerGram(product) : null
    const current = totals.get(r.catalog_item_id) ?? 0
    totals.set(r.catalog_item_id, current + (costPerGram == null ? 0 : costPerGram * r.quantity_grams))
  }
  return totals
}
