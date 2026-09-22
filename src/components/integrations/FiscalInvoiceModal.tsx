import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { FileCheck2, Landmark, Plus, Printer, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import {
  useCreateFiscalCustomer,
  useCreateFiscalDraft,
  useFiscalCustomers,
  useFiscalDocuments,
  useIssueFiscalDocument,
} from '@/hooks/useIntegrations'
import { fiscalDocumentStatusLabel, fiscalTransactionEligibility, validateFiscalSource } from '@/lib/integrations'
import { formatDate } from '@/lib/formatDate'
import { showToast } from '@/lib/toast'
import type { Currency, FiscalDocument, TransactionCategory } from '@/types'

export interface FiscalSourceTransaction {
  id: string
  date: string
  amount: number
  currency: Currency
  description: string | null
  voided_at: string | null
  subcategory?: TransactionCategory | null
}

interface FiscalInvoiceModalProps {
  open: boolean
  onClose: () => void
  transactions: FiscalSourceTransaction[]
  sourceLabel?: string
  initialDocument?: FiscalDocument | null
}

const money = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount)

export function FiscalStatusBadge({ status }: { status: FiscalDocument['status'] }) {
  const variant = {
    draft: 'default', queued: 'warning', authorized: 'success', rejected: 'danger', recovery_pending: 'warning',
  }[status] as 'default' | 'warning' | 'success' | 'danger'
  return <Badge variant={variant}>{fiscalDocumentStatusLabel(status)}</Badge>
}

export function FiscalPrint({ document }: { document: FiscalDocument }) {
  const [qr, setQr] = useState('')
  useEffect(() => {
    if (!document.qr_payload) return
    void QRCode.toDataURL(document.qr_payload, { width: 180, margin: 1, errorCorrectionLevel: 'M' }).then(setQr)
  }, [document.qr_payload])

  return (
    <article className="fiscal-print rounded-xl border border-[var(--color-border)] bg-white p-5">
      <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-muted)]">Comprobante fiscal</p><h2 className="mt-1 text-xl font-bold">Factura C</h2></div>
        <div className="text-right text-sm"><strong>PV {String(document.point_of_sale).padStart(5, '0')} · Nº {String(document.receipt_number ?? 0).padStart(8, '0')}</strong><p>{formatDate(document.issue_date)}</p></div>
      </header>
      <div className="grid gap-2 py-4 text-sm md:grid-cols-2"><p><span className="text-[var(--color-muted)]">Receptor:</span> {document.customer_snapshot.name}</p><p><span className="text-[var(--color-muted)]">Documento:</span> {document.customer_snapshot.document_number || '0'}</p></div>
      <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
        {(document.items ?? []).map(item => <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-[var(--color-border)] px-3 py-2 text-sm last:border-0"><span>{item.description}</span><strong>{money(item.line_total)}</strong></div>)}
      </div>
      <p className="mt-4 text-right text-xl font-bold">Total {money(document.total)}</p>
      {document.status === 'authorized' && <><footer className="mt-5 flex items-end justify-between gap-4 border-t border-[var(--color-border)] pt-4"><div className="text-sm"><p><strong>CAE:</strong> {document.cae}</p><p><strong>Vencimiento:</strong> {document.cae_expires_on ? formatDate(document.cae_expires_on) : '—'}</p></div>{qr && <img src={qr} alt="Código QR del comprobante para consultar en ARCA" className="h-32 w-32" />}</footer><p className="print:hidden mt-4 rounded-lg bg-[var(--color-warning-light)] p-3 text-xs text-amber-800">Una factura autorizada no se puede editar ni anular. La Nota de Crédito C está modelada, pero su emisión todavía no está habilitada en esta pantalla.</p></>}
    </article>
  )
}

export function FiscalInvoiceModal({ open, onClose, transactions, sourceLabel, initialDocument }: FiscalInvoiceModalProps) {
  const documentsQuery = useFiscalDocuments()
  const { data: customers = [] } = useFiscalCustomers()
  const createCustomer = useCreateFiscalCustomer()
  const createDraft = useCreateFiscalDraft()
  const issue = useIssueFiscalDocument()
  const [customerId, setCustomerId] = useState('consumer')
  const [pointOfSale, setPointOfSale] = useState('1')
  const [environment, setEnvironment] = useState<'homologation' | 'production'>('homologation')
  const [customerOpen, setCustomerOpen] = useState(false)
  const [createdDocumentId, setCreatedDocumentId] = useState<string | null>(null)
  const [customerForm, setCustomerForm] = useState({ name: '', document_type: '96', document_number: '', tax_condition_id: '5', address: '', email: '' })
  const documents = documentsQuery.data ?? []
  const linkedDocument = documents.find(document => transactions.some(transaction => document.transaction_ids?.includes(transaction.id)))
  const documentId = createdDocumentId ?? initialDocument?.id ?? linkedDocument?.id
  const document = documents.find(item => item.id === documentId) ?? (initialDocument?.id === documentId ? initialDocument : null)
  const eligibilityError = transactions.map(transaction => fiscalTransactionEligibility(transaction)).find(result => !result.canCreate)?.reason ?? null
  const sourceError = validateFiscalSource(
    transactions.map(transaction => transaction.amount),
    transactions.map(transaction => transaction.currency),
    Boolean(linkedDocument || initialDocument),
  ) ?? eligibilityError
  const draftError = documentsQuery.isLoading ? 'Verificando comprobantes vinculados…' : sourceError

  async function handleCreateDraft() {
    if (draftError || transactions.length === 0) return
    const id = await createDraft.mutateAsync({
      transactionIds: transactions.map(transaction => transaction.id),
      customerId: customerId === 'consumer' ? null : customerId,
      pointOfSale: Number(pointOfSale),
      environment,
    })
    setCreatedDocumentId(String(id))
    await documentsQuery.refetch()
    showToast('Borrador fiscal preparado. Revisalo antes de emitir.', 'success')
  }

  async function handleCustomer() {
    const customer = await createCustomer.mutateAsync({
      name: customerForm.name.trim(),
      document_type: Number(customerForm.document_type),
      document_number: customerForm.document_number.replace(/\D/g, ''),
      tax_condition_id: Number(customerForm.tax_condition_id),
      address: customerForm.address || null,
      email: customerForm.email || null,
    })
    setCustomerId(customer.id)
    setCustomerOpen(false)
    setCustomerForm({ name: '', document_type: '96', document_number: '', tax_condition_id: '5', address: '', email: '' })
    showToast('Cliente fiscal guardado.', 'success')
  }

  async function handleIssue(action: 'issue' | 'recover' = 'issue') {
    if (!document) return
    await issue.mutateAsync({ documentId: document.id, action })
    await documentsQuery.refetch()
    showToast(action === 'recover' ? 'Comprobante recuperado desde ARCA.' : 'Comprobante autorizado por ARCA.', 'success')
  }

  const footer = document ? (
    <>
      <Button variant="secondary" onClick={onClose}>Cerrar</Button>
      {document.status === 'authorized' ? (
        <Button variant="secondary" onClick={() => window.print()}><Printer size={16} /> Imprimir / PDF</Button>
      ) : document.status === 'recovery_pending' || document.status === 'queued' ? (
        <Button variant="secondary" loading={issue.isPending} onClick={() => void handleIssue('recover')}><ShieldAlert size={16} /> {document.status === 'queued' ? 'Verificar emisión pendiente' : 'Recuperar sin reemitir'}</Button>
      ) : (
        <Button loading={issue.isPending} onClick={() => void handleIssue()}><Landmark size={16} /> Confirmar emisión</Button>
      )}
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={onClose}>Cancelar</Button>
      <Button disabled={Boolean(draftError) || Number(pointOfSale) < 1} loading={createDraft.isPending} onClick={() => void handleCreateDraft()}><FileCheck2 size={16} /> Preparar borrador</Button>
    </>
  )

  return (
    <Modal open={open} onClose={onClose} title={document ? `Factura C · ${fiscalDocumentStatusLabel(document.status)}` : `Facturar · ${sourceLabel || transactions[0]?.description || 'Transacción'}`} size="xl" footer={footer}>
      {document ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3"><p className="text-sm text-[var(--color-muted)]">Esta transacción ya está vinculada a este comprobante.</p><FiscalStatusBadge status={document.status} /></div>
          <FiscalPrint document={document} />
          {document.last_error && <p className="rounded-lg bg-[var(--color-danger-light)] p-3 text-sm text-[var(--color-danger)]">{document.last_error}</p>}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-lg bg-[var(--color-bg)] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">Origen exacto</p>
            {transactions.map(transaction => <div key={transaction.id} className="mt-2 flex justify-between gap-4 text-sm"><span>{transaction.description || 'Servicio'} · {formatDate(transaction.date)}</span><strong>{money(transaction.amount)}</strong></div>)}
            <div className="mt-3 flex justify-between border-t border-[var(--color-border)] pt-3"><strong>Total</strong><strong>{money(transactions.reduce((sum, transaction) => sum + transaction.amount, 0))}</strong></div>
            {transactions.length === 1 && <p className="mt-2 text-xs text-[var(--color-muted)]">Se vinculará únicamente la transacción seleccionada.</p>}
          </div>
          {draftError && <p className="rounded-lg bg-[var(--color-danger-light)] p-3 text-sm text-[var(--color-danger)]">{draftError}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <Select label="Receptor" value={customerId} onChange={event => setCustomerId(event.target.value)} options={[{ value: 'consumer', label: 'Consumidor final' }, ...customers.map(customer => ({ value: customer.id, label: `${customer.name} · ${customer.document_number}` }))]} />
            <div className="flex items-end"><Button variant="secondary" onClick={() => setCustomerOpen(open => !open)}><Plus size={16} /> {customerOpen ? 'Ocultar cliente' : 'Guardar cliente fiscal'}</Button></div>
            <Input label="Punto de venta Web Services" type="number" min="1" value={pointOfSale} onChange={event => setPointOfSale(event.target.value)} />
            <Select label="Ambiente" value={environment} onChange={event => setEnvironment(event.target.value as typeof environment)} options={[{ value: 'homologation', label: 'Homologación' }, { value: 'production', label: 'Producción' }]} />
          </div>
          {customerOpen && <div className="grid gap-4 rounded-lg border border-[var(--color-border)] p-4 md:grid-cols-2"><Input label="Nombre o razón social" value={customerForm.name} onChange={event => setCustomerForm(form => ({ ...form, name: event.target.value }))} /><Select label="Tipo de documento" value={customerForm.document_type} onChange={event => setCustomerForm(form => ({ ...form, document_type: event.target.value }))} options={[{ value: '96', label: 'DNI' }, { value: '80', label: 'CUIT' }, { value: '86', label: 'CUIL' }]} /><Input label="Número" inputMode="numeric" value={customerForm.document_number} onChange={event => setCustomerForm(form => ({ ...form, document_number: event.target.value }))} /><Select label="Condición frente al IVA" value={customerForm.tax_condition_id} onChange={event => setCustomerForm(form => ({ ...form, tax_condition_id: event.target.value }))} options={[{ value: '5', label: 'Consumidor final' }, { value: '6', label: 'Monotributista' }, { value: '1', label: 'Responsable inscripto' }, { value: '4', label: 'Exento' }]} /><Input label="Domicilio" value={customerForm.address} onChange={event => setCustomerForm(form => ({ ...form, address: event.target.value }))} /><Input label="Email" type="email" value={customerForm.email} onChange={event => setCustomerForm(form => ({ ...form, email: event.target.value }))} /><div className="md:col-span-2 flex justify-end"><Button loading={createCustomer.isPending} disabled={!customerForm.name.trim() || !customerForm.document_number.trim()} onClick={() => void handleCustomer()}>Guardar cliente</Button></div></div>}
          {environment === 'production' && <div className="flex gap-2 rounded-lg bg-[var(--color-warning-light)] p-3 text-sm text-amber-800"><ShieldAlert size={18} className="shrink-0" /> Producción emitirá un comprobante real. Prepará y revisá el borrador antes de confirmar.</div>}
        </div>
      )}
    </Modal>
  )
}
