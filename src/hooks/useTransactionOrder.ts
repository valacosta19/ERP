import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { fetchDisplayPositions, compareByDisplayOrder, reorderIds, type ReorderAnchor } from '@/lib/transactionOrder'
import type { Transaction } from '@/types'

type ReorderPayload = ReorderAnchor & { date: string }

export function applyOptimisticReorder(qc: QueryClient, { date, movedIds, anchorIds, position }: ReorderPayload) {
  qc.setQueriesData<Transaction[]>({ queryKey: ['transactions'] }, previous => {
    if (!previous) return previous

    const cachedOrder = previous.filter(tx => tx.date === date).map(tx => tx.id)
    const nextOrder = reorderIds(cachedOrder, { movedIds, anchorIds, position })
    if (nextOrder === cachedOrder) return previous

    const optimistic = new Map(nextOrder.map((id, index) => [id, index + 1]))
    return previous
      .map(tx => (optimistic.has(tx.id) ? { ...tx, display_position: optimistic.get(tx.id)! } : tx))
      .sort(compareByDisplayOrder)
  })
}

export function useReorderTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ date, movedIds, anchorIds, position }: ReorderPayload) => {
      const group = await fetchAllRows<{ id: string; created_at: string }>((rangeFrom, rangeTo) =>
        supabase.from('transactions').select('id, created_at').eq('date', date).range(rangeFrom, rangeTo)
      )

      const positions = await fetchDisplayPositions(group.map(tx => tx.id))
      const currentOrder = group
        .map(tx => ({ ...tx, date, display_position: positions.get(tx.id) ?? null }))
        .sort(compareByDisplayOrder)
        .map(tx => tx.id)

      const finalOrder = reorderIds(currentOrder, { movedIds, anchorIds, position })

      const { error } = await supabase
        .from('transaction_display_order')
        .upsert(
          finalOrder.map((id, index) => ({ transaction_id: id, position: index + 1 })),
          { onConflict: 'transaction_id' }
        )
      if (error) throw new Error(error.message)

      return finalOrder
    },
    onMutate: payload => applyOptimisticReorder(qc, payload),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
