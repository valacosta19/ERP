import { supabase } from '@/lib/supabaseClient'

const ID_CHUNK_SIZE = 500

export async function fetchDisplayPositions(ids: string[]): Promise<Map<string, number>> {
  const positions = new Map<string, number>()
  for (let offset = 0; offset < ids.length; offset += ID_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + ID_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('transaction_display_order')
      .select('transaction_id, position')
      .in('transaction_id', chunk)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) positions.set(row.transaction_id, row.position)
  }
  return positions
}

interface OrderableRow {
  id: string
  date: string
  created_at: string
  display_position?: number | null
}

export function compareByDisplayOrder(a: OrderableRow, b: OrderableRow): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  const posA = a.display_position ?? 0
  const posB = b.display_position ?? 0
  if (posA !== posB) return posA - posB
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1
  return a.id < b.id ? 1 : -1
}
