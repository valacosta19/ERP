import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchInventoryPurchaseCategoryId } from '@/lib/inventoryPurchaseCategory'
import type { SupplierDebt } from '@/types'
import type { Database } from '@/types/database'

type DebtInsert = Database['public']['Tables']['supplier_debts']['Insert']

export function useSupplierDebts() {
  return useQuery({
    queryKey: ['supplier_debts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_debts')
        .select('*, supplier:suppliers(*), payments:supplier_debt_payments(*)')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data as unknown as SupplierDebt[]
    },
  })
}

interface CreateDebtPayload {
  purchase_order_id: string | null
  supplier_id: string | null
  total_amount: number
  due_date: string | null
  notes?: string | null
}

export function useCreateSupplierDebt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateDebtPayload) => {
      const { data, error } = await supabase
        .from('supplier_debts')
        .insert({
          purchase_order_id: payload.purchase_order_id,
          supplier_id: payload.supplier_id,
          total_amount: payload.total_amount,
          paid_amount: 0,
          due_date: payload.due_date,
          notes: payload.notes ?? null,
        } as DebtInsert)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier_debts'] }),
  })
}

interface RecordPaymentPayload {
  client_uuid: string
  debt_id: string
  amount: number
  payment_method: string
  date: string
  notes?: string | null
}

export function useRecordSupplierDebtPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: RecordPaymentPayload) => {
      const subcategoryId = await fetchInventoryPurchaseCategoryId()
      const { data, error } = await supabase.rpc('record_supplier_debt_payment', {
        p_client_uuid: payload.client_uuid,
        p_debt_id: payload.debt_id,
        p_amount: payload.amount,
        p_payment_method: payload.payment_method,
        p_date: payload.date,
        p_subcategory_id: subcategoryId,
        p_notes: payload.notes ?? null,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier_debts'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['payment-method-balances'] })
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
