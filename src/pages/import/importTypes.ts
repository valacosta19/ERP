export type EntityType = 'categories' | 'suppliers' | 'products' | 'services' | 'transactions' | 'lots' | 'professionals'

export type ParsedSheet = {
  name: string
  headers: string[]
  rows: Record<string, string>[]
}

export type SheetAssignments = Record<string, EntityType | ''>
export type ColumnMappings = Record<string, Record<string, string>>

export type ImportResult = {
  entity: EntityType
  inserted: number
  skipped: number
  errors: string[]
}
