import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { edgeFunctionErrorDetail } from '@/lib/integrations'
import type { FiscalCustomer, FiscalDocument, FiscalDocumentItem, MpClassification, MpMovement, MpSaleApproval, MpSyncRun, PublishMpSalesInput, PublishMpSalesResult } from '@/types'

export function useFiscalCustomers() {
  return useQuery({
    queryKey: ['fiscal-customers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fiscal_customers').select('*').order('name')
      if (error) throw new Error(error.message)
      return data as FiscalCustomer[]
    },
  })
}

export function useCreateFiscalCustomer() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (customer: Pick<FiscalCustomer, 'name' | 'document_type' | 'document_number' | 'tax_condition_id' | 'address' | 'email'>) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase.from('fiscal_customers').insert({ ...customer, created_by: user?.id ?? null }).select('*').single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['fiscal-customers'] }),
  })
}

export function useFiscalDocuments(enabled = true) {
  return useQuery({
    queryKey: ['fiscal-documents'],
    enabled,
    queryFn: async () => {
      type Raw = FiscalDocument & { items: FiscalDocumentItem[]; links: { transaction_id: string }[] }
      const { data, error } = await supabase
        .from('fiscal_documents')
        .select('*, items:fiscal_document_items(*), links:fiscal_document_transactions(transaction_id)')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data as unknown as Raw[]).map(document => ({ ...document, transaction_ids: document.links.map(link => link.transaction_id) }))
    },
  })
}

export function useCreateFiscalDraft() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { transactionIds: string[]; customerId: string | null; pointOfSale: number; environment: 'homologation' | 'production'; issueDate: string }) => {
      const { data, error } = await supabase.rpc('create_fiscal_draft', {
        p_transaction_ids: payload.transactionIds,
        p_customer_id: payload.customerId,
        p_point_of_sale: payload.pointOfSale,
        p_environment: payload.environment,
        p_issue_date: payload.issueDate,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['fiscal-documents'] }),
  })
}

export function useUpdateFiscalDraftIssueDate() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ documentId, issueDate }: { documentId: string; issueDate: string }) => {
      const { error } = await supabase.rpc('update_fiscal_draft_issue_date', {
        p_document_id: documentId,
        p_issue_date: issueDate,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['fiscal-documents'] }),
  })
}

export function useIssueFiscalDocument() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ documentId, action = 'issue' }: { documentId: string; action?: 'issue' | 'recover' }) => {
      const { data, error } = await supabase.functions.invoke<{ status?: string; detail?: string }>('arca-issue', { body: { documentId, action } })
      if (error) throw new Error(data?.detail || error.message)
      if (data?.status !== 'authorized') throw new Error(data?.detail || 'ARCA no autorizó el comprobante.')
      return data
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['fiscal-documents'] }),
  })
}

export function useMpMovements(status: 'pending' | 'reconciled' | 'all' = 'pending') {
  return useQuery({
    queryKey: ['mp-movements', status],
    queryFn: async () => {
      let query = supabase.from('mp_movements').select('*').order('occurred_at', { ascending: false }).limit(500)
      if (status !== 'all') query = query.eq('status', status)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      const movements = data as MpMovement[]
      if (movements.length === 0) return movements
      const { data: approvals, error: approvalsError } = await supabase
        .from('mp_sale_approvals')
        .select('*, tickets:mp_sale_approval_tickets(group_id, position), links:mp_reconciliation_links(transaction_id)')
        .in('movement_id', movements.map(movement => movement.id))
        .is('reversed_at', null)
      if (approvalsError) throw new Error(approvalsError.message)
      const byMovement = new Map((approvals ?? []).map(raw => {
        const approval = raw as unknown as MpSaleApproval & { links: { transaction_id: string }[] }
        return [approval.movement_id, { ...approval, transaction_ids: approval.links.map(link => link.transaction_id) }]
      }))
      return movements.map(movement => ({ ...movement, approval: byMovement.get(movement.id) ?? null }))
    },
  })
}

export function useMpMovement(movementId: string | undefined) {
  return useQuery({
    queryKey: ['mp-movement', movementId],
    enabled: Boolean(movementId),
    queryFn: async () => {
      const { data, error } = await supabase.from('mp_movements').select('*').eq('id', movementId!).single()
      if (error) throw new Error(error.message)
      return data as MpMovement
    },
  })
}

export function usePublishMpSales() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (payload: PublishMpSalesInput) => {
      const { data, error } = await supabase.rpc('publish_mp_sales', {
        p_movement_id: payload.movementId,
        p_idempotency_key: payload.idempotencyKey,
        p_tickets: payload.tickets,
        p_additional_payments: payload.additionalPayments,
        p_notes: null,
      })
      if (error) throw new Error(error.message)
      return data as unknown as PublishMpSalesResult
    },
    onSuccess: (_, payload) => {
      client.invalidateQueries({ queryKey: ['mp-movements'] })
      client.invalidateQueries({ queryKey: ['mp-movement', payload.movementId] })
      client.invalidateQueries({ queryKey: ['transactions'] })
      client.invalidateQueries({ queryKey: ['transaction-groups'] })
      client.invalidateQueries({ queryKey: ['payment-method-balances'] })
      client.invalidateQueries({ queryKey: ['transaction-recipe-costs'] })
      client.invalidateQueries({ queryKey: ['products'] })
      client.invalidateQueries({ queryKey: ['inventory_lots'] })
    },
  })
}

export function useReverseMpSaleApproval() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (approvalId: string) => {
      const { data, error } = await supabase.rpc('reverse_mp_sale_approval', { p_approval_id: approvalId })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['mp-movements'] })
      client.invalidateQueries({ queryKey: ['transactions'] })
      client.invalidateQueries({ queryKey: ['transaction-groups'] })
      client.invalidateQueries({ queryKey: ['payment-method-balances'] })
      client.invalidateQueries({ queryKey: ['products'] })
      client.invalidateQueries({ queryKey: ['inventory_lots'] })
    },
  })
}

export function useMpSyncRuns() {
  return useQuery({
    queryKey: ['mp-sync-runs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('mp_sync_runs').select('*').order('created_at', { ascending: false }).limit(10)
      if (error) throw new Error(error.message)
      return data as MpSyncRun[]
    },
  })
}

export function useMpSync() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { action: 'start'; days: number } | { action: 'poll'; runId: string }) => {
      const { data, error } = await supabase.functions.invoke<{ status: string; runId?: string; detail?: string }>('mercadopago-sync', { body: payload })
      if (error) throw new Error(await edgeFunctionErrorDetail(error))
      return data
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: ['mp-sync-runs'] })
      client.invalidateQueries({ queryKey: ['mp-movements'] })
    },
  })
}

export function usePublishMpReconciliation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { movementId: string; classification: MpClassification; subcategoryId?: string; destinationPaymentMethod?: string; notes?: string }) => {
      const { data, error } = await supabase.rpc('publish_mp_reconciliation', {
        p_movement_id: payload.movementId,
        p_classification: payload.classification,
        p_subcategory_id: payload.subcategoryId || null,
        p_destination_payment_method: payload.destinationPaymentMethod || null,
        p_notes: payload.notes || null,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['mp-movements'] })
      client.invalidateQueries({ queryKey: ['transactions'] })
      client.invalidateQueries({ queryKey: ['payment-method-balances'] })
    },
  })
}
