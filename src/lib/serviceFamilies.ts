import type { CatalogItem } from '@/types'

export type ServiceSize = 'corto' | 'mediano' | 'largo'
export type FamilyColumn = ServiceSize | 'unico'

export interface ServiceFamily {
  family: string
  columns: { size: FamilyColumn; item: CatalogItem }[]
}

export const SIZE_LABELS: Record<FamilyColumn, string> = {
  corto: 'Corto',
  mediano: 'Mediano',
  largo: 'Largo',
  unico: 'Único',
}

const SIZE_SUFFIX = /\s+(corto|mediano|largo)\s*$/i
const COLUMN_ORDER: Record<FamilyColumn, number> = { corto: 0, mediano: 1, largo: 2, unico: 3 }
const EXCLUDED_NAMES = new Set(['anticipo', 'seña'])

export function splitServiceName(name: string): { family: string; size: ServiceSize | null } {
  const match = name.match(SIZE_SUFFIX)
  if (!match || match.index === undefined) return { family: name.trim(), size: null }
  return { family: name.slice(0, match.index).trim(), size: match[1].toLowerCase() as ServiceSize }
}

export function groupServiceFamilies(items: CatalogItem[]): ServiceFamily[] {
  const byFamily = new Map<string, ServiceFamily>()
  for (const item of items) {
    if (EXCLUDED_NAMES.has(item.name.trim().toLowerCase())) continue
    const { family, size } = splitServiceName(item.name)
    const key = family.toLowerCase()
    const entry = byFamily.get(key) ?? { family, columns: [] }
    entry.columns.push({ size: size ?? 'unico', item })
    byFamily.set(key, entry)
  }
  return [...byFamily.values()]
    .map(f => ({ ...f, columns: [...f.columns].sort((a, b) => COLUMN_ORDER[a.size] - COLUMN_ORDER[b.size]) }))
    .sort((a, b) => a.family.localeCompare(b.family, 'es'))
}
