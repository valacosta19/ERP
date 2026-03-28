import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { SupplierDebt, SupplierDebtPayment } from '@/types'
import type { Database } from '@/types/database'

type DebtInsert = Database['public']['Tables']['supplier_debts']['Insert']
type DebtUpdate = Database['public']['Tables']['supplier_debts']['Update']
type PaymentInsert = Database['public']['Tables']['supplier_debt_payments']['Insert']

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
  debt_id: string
  amount: number
  payment_method: string
  date: string
  transaction_id: string | null
  notes?: string | null
}

export function useRecordSupplierDebtPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: RecordPaymentPayload) => {
      const { data: payment, error: payErr } = await supabase
        .from('supplier_debt_payments')
        .insert({
          debt_id: payload.debt_id,
          amount: payload.amount,
          payment_method: payload.payment_method,
          date: payload.date,
          transaction_id: payload.transaction_id,
          notes: payload.notes ?? null,
        } as PaymentInsert)
        .select('*')
        .single()
      if (payErr) throw new Error(payErr.message)

      const { data: debt, error: debtErr } = await supabase
        .from('supplier_debts')
        .select('paid_amount')
        .eq('id', payload.debt_id)
        .single()
      if (debtErr) throw new Error(debtErr.message)

      const newPaid = (debt.paid_amount as number) + payload.amount
      const { error: updateErr } = await supabase
        .from('supplier_debts')
        .update({ paid_amount: newPaid } as DebtUpdate)
        .eq('id', payload.debt_id)
      if (updateErr) throw new Error(updateErr.message)

      return payment as unknown as SupplierDebtPayment
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier_debts'] }),
  })
}
