import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRows } from '@/lib/fetchAllRows'
import type { Currency, GroupMemberTransaction, TransactionGroupWithMembers } from '@/types'

const MEMBER_SELECT = `
  *,
  members:transaction_group_members(
    transaction:transactions(
      id, date, amount, currency, description, voided_at, is_seña, subcategory_id,
      subcategory:transaction_categories!subcategory_id(id, name, parent_id, transaction_type, deducts_inventory, created_at),
      payments:transaction_payments(payment_method, type, amount)
    )
  )
`

type RawGroup = Omit<TransactionGroupWithMembers, 'members'> & {
  members: { transaction: GroupMemberTransaction | null }[]
}

export function useTransactionGroups() {
  return useQuery({
    queryKey: ['transaction-groups'],
    queryFn: async () => {
      const rows = await fetchAllRows<RawGroup>((rangeFrom, rangeTo) =>
        supabase
          .from('transaction_groups')
          .select(MEMBER_SELECT)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(rangeFrom, rangeTo) as unknown as PromiseLike<{ data: unknown; error: { message: string } | null }>
      )

      return rows.map(group => ({
        ...group,
        members: group.members
          .map(m => m.transaction)
          .filter((tx): tx is GroupMemberTransaction => tx !== null)
          .sort((a, b) => b.date.localeCompare(a.date)),
      })) as TransactionGroupWithMembers[]
    },
  })
}

interface CreateGroupPayload {
  label: string
  currency: Currency
  transactionIds: string[]
}

export async function createTransactionGroup({ label, currency, transactionIds }: CreateGroupPayload): Promise<string> {
  if (transactionIds.length < 2) throw new Error('Un grupo necesita al menos dos transacciones.')

  const { data: { user } } = await supabase.auth.getUser()

  const { data: group, error: groupError } = await supabase
    .from('transaction_groups')
    .insert({ label, currency, created_by: user?.id ?? null })
    .select('id')
    .single()
  if (groupError) throw new Error(groupError.message)

  const { error: membersError } = await supabase
    .from('transaction_group_members')
    .insert(transactionIds.map(transaction_id => ({ group_id: group.id, transaction_id })))
  if (membersError) {
    await supabase.from('transaction_groups').delete().eq('id', group.id)
    throw new Error(membersError.message)
  }

  return group.id
}

export function useCreateTransactionGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createTransactionGroup,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transaction-groups'] })
    },
  })
}

export function useDeleteTransactionGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from('transaction_groups').delete().eq('id', groupId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transaction-groups'] })
    },
  })
}

export function useRemoveGroupMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupId, transactionId }: { groupId: string; transactionId: string }) => {
      const { error } = await supabase
        .from('transaction_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('transaction_id', transactionId)
      if (error) throw new Error(error.message)

      const { count, error: countError } = await supabase
        .from('transaction_group_members')
        .select('transaction_id', { count: 'exact', head: true })
        .eq('group_id', groupId)
      if (countError) throw new Error(countError.message)

      if ((count ?? 0) < 2) {
        const { error: deleteError } = await supabase.from('transaction_groups').delete().eq('id', groupId)
        if (deleteError) throw new Error(deleteError.message)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transaction-groups'] })
    },
  })
}
