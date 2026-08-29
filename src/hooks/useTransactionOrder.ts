import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { fetchDisplayPositions, compareByDisplayOrder } from '@/lib/transactionOrder'
import type { Transaction } from '@/types'

interface ReorderPayload {
  date: string
  orderedIds: string[]
}

export function useReorderTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ date, orderedIds }: ReorderPayload) => {
      const group = await fetchAllRows<{ id: string; created_at: string }>((rangeFrom, rangeTo) =>
        supabase.from('transactions').select('id, created_at').eq('date', date).range(rangeFrom, rangeTo)
      )

      const positions = await fetchDisplayPositions(group.map(tx => tx.id))
      const included = new Set(orderedIds)
      const remaining = group
        .filter(tx => !included.has(tx.id))
        .map(tx => ({ ...tx, date, display_position: positions.get(tx.id) ?? null }))
        .sort(compareByDisplayOrder)
        .map(tx => tx.id)

      const finalOrder = [...orderedIds, ...remaining]

      const { error } = await supabase
        .from('transaction_display_order')
        .upsert(
          finalOrder.map((id, index) => ({ transaction_id: id, position: index + 1 })),
          { onConflict: 'transaction_id' }
        )
      if (error) throw new Error(error.message)

      return finalOrder
    },
    onMutate: ({ date, orderedIds }) => {
      const optimistic = new Map(orderedIds.map((id, index) => [id, index + 1]))
      qc.setQueriesData<Transaction[]>({ queryKey: ['transactions'] }, previous => {
        if (!previous) return previous
        return previous
          .map(tx => (tx.date === date && optimistic.has(tx.id) ? { ...tx, display_position: optimistic.get(tx.id)! } : tx))
          .sort(compareByDisplayOrder)
      })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
