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
