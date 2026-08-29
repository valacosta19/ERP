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

export interface ReorderAnchor {
  movedIds: string[]
  anchorIds: string[]
  position: 'before' | 'after'
}

export function reorderIds(currentOrder: string[], { movedIds, anchorIds, position }: ReorderAnchor): string[] {
  const moved = new Set(movedIds)
  if (anchorIds.some(id => moved.has(id))) return currentOrder

  const block = currentOrder.filter(id => moved.has(id))
  if (block.length === 0) return currentOrder

  const rest = currentOrder.filter(id => !moved.has(id))
  const anchors = new Set(anchorIds)
  const anchorIndexes = rest.reduce<number[]>((acc, id, index) => {
    if (anchors.has(id)) acc.push(index)
    return acc
  }, [])
  if (anchorIndexes.length === 0) return currentOrder

  const insertAt = position === 'before' ? anchorIndexes[0] : anchorIndexes[anchorIndexes.length - 1] + 1
  return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)]
}
