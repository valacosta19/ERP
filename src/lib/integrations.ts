import type { FiscalDocumentStatus, MpClassification, TransactionType } from '@/types'

export interface FiscalTransactionCandidate {
  amount: number
  currency: string
  voided_at: string | null
  subcategory?: { transaction_type: TransactionType | null } | null
}

export interface FiscalGroupTransactionCandidate extends FiscalTransactionCandidate {
  id: string
}

export interface FiscalLinkedDocument {
  id: string
  status: FiscalDocumentStatus
  transaction_ids?: string[]
}

export function fiscalTransactionEligibility(
  transaction: FiscalTransactionCandidate,
  existingStatus?: FiscalDocumentStatus | null,
) {
  if (existingStatus) return { canCreate: false, canOpenExisting: true, reason: 'La transacción ya tiene un comprobante fiscal.' }
  if (transaction.voided_at) return { canCreate: false, canOpenExisting: false, reason: 'Las transacciones anuladas no se pueden facturar.' }
  if (transaction.subcategory?.transaction_type !== 'income') return { canCreate: false, canOpenExisting: false, reason: 'Solo se pueden facturar ingresos.' }
  if (transaction.currency !== 'ARS') return { canCreate: false, canOpenExisting: false, reason: 'ARCA solo admite transacciones en ARS en esta versión.' }
  if (transaction.amount <= 0) return { canCreate: false, canOpenExisting: false, reason: 'El importe debe ser mayor que cero.' }
  return { canCreate: true, canOpenExisting: false, reason: null }
}

export function fiscalDocumentStatusLabel(status: FiscalDocumentStatus) {
  return {
    draft: 'Borrador',
    queued: 'En cola',
    authorized: 'Autorizada',
    rejected: 'Rechazada',
    recovery_pending: 'Revisar en ARCA',
  }[status]
}

export function fiscalGroupInvoiceState(
  transactions: FiscalGroupTransactionCandidate[],
  documents: FiscalLinkedDocument[],
) {
  const transactionIds = transactions.map(transaction => transaction.id)
  const total = transactions.reduce((sum, transaction) => sum + transaction.amount, 0)
  const linkedDocuments = documents.filter(document =>
    document.transaction_ids?.some(transactionId => transactionIds.includes(transactionId)),
  )
  const linkedDocumentIds = new Set(linkedDocuments.map(document => document.id))

  if (linkedDocuments.length > 0) {
    const document = linkedDocumentIds.size === 1 ? linkedDocuments[0] : null
    const allLinkedToSameDocument = document
      ? transactionIds.every(transactionId => document.transaction_ids?.includes(transactionId))
      : false
    if (document && allLinkedToSameDocument) {
      return { kind: 'existing' as const, transactionIds, total, document, reason: null }
    }
    return {
      kind: 'blocked' as const,
      transactionIds,
      total,
      document: null,
      reason: linkedDocumentIds.size > 1
        ? 'Las transacciones del grupo están vinculadas a comprobantes distintos. Revisalos antes de continuar.'
        : 'Parte del grupo ya pertenece a un comprobante fiscal. Abrí ese comprobante o desagrupá antes de facturar.',
    }
  }

  if (transactions.length === 0) {
    return { kind: 'blocked' as const, transactionIds, total, document: null, reason: 'El grupo no tiene transacciones para facturar.' }
  }
  const invalid = transactions.map(transaction => fiscalTransactionEligibility(transaction)).find(result => !result.canCreate)
  if (invalid) return { kind: 'blocked' as const, transactionIds, total, document: null, reason: invalid.reason }
  return { kind: 'ready' as const, transactionIds, total, document: null, reason: null }
}

export const MP_CLASSIFICATION_LABELS: Record<MpClassification, string> = {
  received_payment: 'Cobro recibido',
  fee: 'Comisión',
  tax: 'Impuesto',
  withholding: 'Retención',
  withdrawal: 'Retiro a otra cuenta',
  refund: 'Devolución',
  chargeback: 'Contracargo',
  unknown: 'Sin clasificar',
}

export function validateFiscalSource(amounts: number[], currencies: string[], alreadyInvoiced = false) {
  if (amounts.length === 0) return 'Seleccioná una transacción o un grupo.'
  if (currencies.some(currency => currency !== 'ARS')) return 'ARCA solo admite tickets en ARS en esta primera versión.'
  if (amounts.reduce((sum, amount) => sum + amount, 0) <= 0) return 'El total del ticket debe ser positivo.'
  if (alreadyInvoiced) return 'El ticket ya pertenece a un comprobante fiscal.'
  return null
}

export function arcaQrPayload(input: { date: string; taxId: string; pointOfSale: number; receiptType: number; receiptNumber: number; total: number; documentType: number; documentNumber: string; cae: string }) {
  const payload = {
    ver: 1,
    fecha: input.date,
    cuit: Number(input.taxId),
    ptoVta: input.pointOfSale,
    tipoCmp: input.receiptType,
    nroCmp: input.receiptNumber,
    importe: Number(input.total.toFixed(2)),
    moneda: 'PES', ctz: 1,
    tipoDocRec: input.documentType,
    nroDocRec: Number(input.documentNumber.replace(/\D/g, '') || 0),
    tipoCodAut: 'E', codAut: Number(input.cae),
  }
  const json = JSON.stringify(payload)
  const base64 = btoa(json)
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`
}

export function reconciliationRequirements(classification: MpClassification) {
  if (classification === 'received_payment') return { category: false, destination: false }
  if (classification === 'withdrawal') return { category: false, destination: true }
  if (classification === 'unknown') return { category: false, destination: false }
  return { category: true, destination: false }
}

export async function edgeFunctionErrorDetail(error: unknown) {
  const fallback = error instanceof Error ? error.message : 'La Edge Function devolvió un error.'
  if (!error || typeof error !== 'object' || !('context' in error)) return fallback
  const context = (error as { context?: unknown }).context
  if (!(context instanceof Response)) return fallback
  try {
    const body = await context.clone().json() as { detail?: unknown }
    return typeof body.detail === 'string' && body.detail.trim() ? body.detail : fallback
  } catch {
    return fallback
  }
}
