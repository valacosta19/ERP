import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloudDownload, Landmark, RefreshCw, ReceiptText } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useTransactions } from '@/hooks/useTransactions'
import { useTransactionGroups } from '@/hooks/useTransactionGroups'
import {
  useFiscalDocuments, useMpSync, useMpSyncRuns,
} from '@/hooks/useIntegrations'
import { fiscalTransactionEligibility, validateFiscalSource } from '@/lib/integrations'
import { formatDate } from '@/lib/formatDate'
import { showToast } from '@/lib/toast'
import { FiscalInvoiceModal, FiscalStatusBadge, type FiscalSourceTransaction } from '@/components/integrations/FiscalInvoiceModal'
import type { FiscalDocument } from '@/types'

type Tab = 'arca' | 'mercadopago'

const money = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount)
function ArcaPanel() {
  const transactionsQuery = useTransactions()
  const { data: groups = [] } = useTransactionGroups()
  const { data: documents = [], isLoading } = useFiscalDocuments()
  const [sourceKey, setSourceKey] = useState('')
  const [modalSource, setModalSource] = useState<{ label: string; transactions: FiscalSourceTransaction[] } | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<FiscalDocument | null>(null)

  const transactions = (transactionsQuery.data ?? []).filter(transaction => !transaction.voided_at)
  const invoiced = new Set(documents.flatMap(document => document.transaction_ids ?? []))
  const source = useMemo(() => {
    if (sourceKey.startsWith('tx:')) {
      const tx = transactions.find(transaction => transaction.id === sourceKey.slice(3))
      return tx ? { label: tx.description || 'Transacción', transactions: [tx] } : null
    }
    const group = groups.find(item => item.id === sourceKey.slice(6))
    return group ? { label: group.label, transactions: group.members as FiscalSourceTransaction[] } : null
  }, [sourceKey, transactions, groups])
  const sourceError = source
    ? validateFiscalSource(source.transactions.map(transaction => transaction.amount), source.transactions.map(transaction => transaction.currency), source.transactions.some(transaction => invoiced.has(transaction.id)))
      ?? source.transactions.map(transaction => fiscalTransactionEligibility(transaction)).find(result => !result.canCreate)?.reason
      ?? null
    : null
  const groupedTransactionIds = new Set(groups.flatMap(group => group.members.map(member => member.id)))

  const sourceOptions = [
    ...groups.map(group => ({ value: `group:${group.id}`, label: `Ticket · ${group.label} · ${money(group.members.reduce((sum, item) => sum + item.amount, 0))}` })),
    ...transactions.filter(transaction => !groupedTransactionIds.has(transaction.id)).slice(0, 100).map(transaction => ({ value: `tx:${transaction.id}`, label: `${formatDate(transaction.date)} · ${transaction.description || 'Sin descripción'} · ${money(transaction.amount)}` })),
  ]

  function openDocument(document: FiscalDocument) {
    setSelectedDocument(document)
    setModalSource({
      label: `Factura C · ${document.customer_snapshot.name}`,
      transactions: transactions.filter(transaction => document.transaction_ids?.includes(transaction.id)),
    })
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="font-bold">Preparar Factura C</h2><p className="mt-1 text-sm text-[var(--color-muted)]">Elegí una transacción o un ticket. La revisión y emisión usan el mismo flujo disponible desde Transacciones.</p></div><ReceiptText className="text-[var(--color-accent)]" /></div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <Select label="Transacción o ticket" value={sourceKey} onChange={event => setSourceKey(event.target.value)} placeholder="Elegir origen" options={sourceOptions} error={sourceError ?? undefined} />
          <Button disabled={!source || Boolean(sourceError)} onClick={() => source && setModalSource(source)}><ReceiptText size={16} /> Revisar y facturar</Button>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] p-4"><h2 className="font-bold">Comprobantes</h2></div>
        {isLoading ? <p className="p-5 text-sm text-[var(--color-muted)]">Cargando…</p> : documents.length === 0 ? <p className="p-5 text-sm text-[var(--color-muted)]">Todavía no hay comprobantes fiscales.</p> : <div className="divide-y divide-[var(--color-border)]">{documents.map(document => <button key={document.id} onClick={() => openDocument(document)} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-[var(--color-bg)]"><div><div className="flex items-center gap-2"><strong className="text-sm">Factura C · {document.customer_snapshot.name}</strong><FiscalStatusBadge status={document.status} /></div><p className="mt-1 text-xs text-[var(--color-muted)]">{formatDate(document.issue_date)} · PV {document.point_of_sale} · {money(document.total)}</p>{document.last_error && <p className="mt-1 text-xs text-[var(--color-danger)]">{document.last_error}</p>}</div><span className="text-sm font-semibold">{document.receipt_number ? `#${document.receipt_number}` : 'Ver'}</span></button>)}</div>}
      </section>

      {modalSource && <FiscalInvoiceModal key={selectedDocument?.id ?? modalSource.transactions.map(transaction => transaction.id).join(':')} open onClose={() => { setModalSource(null); setSelectedDocument(null); setSourceKey('') }} sourceLabel={modalSource.label} transactions={modalSource.transactions} initialDocument={selectedDocument} />}
    </div>
  )
}

function MercadoPagoPanel() {
  const navigate = useNavigate()
  const { data: runs = [] } = useMpSyncRuns()
  const sync = useMpSync()
  const processing = runs.find(run => run.status === 'processing' || run.status === 'requested')
  async function synchronize() {
    if (processing) await sync.mutateAsync({ action: 'poll', runId: processing.id })
    else await sync.mutateAsync({ action: 'start', days: 3 })
    showToast(processing ? 'Se consultó el reporte pendiente.' : 'Reporte solicitado. Volvé a consultar cuando Mercado Pago lo procese.', 'success')
  }
  return <div className="space-y-5 p-4 md:p-6">
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div><div className="flex items-center gap-2"><CloudDownload className="text-sky-600" /><h2 className="font-bold">Conexión con Mercado Pago</h2></div><p className="mt-1 text-sm text-[var(--color-muted)]">La integración importa movimientos como pendientes. Ninguno se contabiliza sin una decisión explícita.</p></div>
        <Button loading={sync.isPending} onClick={() => void synchronize()}>{processing ? <RefreshCw size={16} /> : <CloudDownload size={16} />}{processing ? 'Consultar reporte' : 'Probar sincronización'}</Button>
      </div>
      {runs[0] && <p className="mt-4 text-xs text-[var(--color-muted)]">Última ejecución: {new Date(runs[0].created_at).toLocaleString('es-AR')} · {runs[0].status}{runs[0].status === 'completed' ? ` · ${runs[0].imported_count} movimientos` : runs[0].status === 'processing' || runs[0].status === 'requested' ? ' · esperando a Mercado Pago' : ''}{runs[0].error_message ? ` · ${runs[0].error_message}` : ''}</p>}
    </section>
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="font-bold">Trabajo diario</h2><p className="mt-1 text-sm text-[var(--color-muted)]">La sincronización, el registro de ventas y la clasificación de comisiones, impuestos, retiros y devoluciones ahora viven junto a Transacciones.</p>
      <Button className="mt-4" onClick={() => navigate('/transactions?view=mercadopago')}><Landmark size={16} />Abrir bandeja de Mercado Pago</Button>
    </section>
    <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"><div className="border-b border-[var(--color-border)] p-4"><h2 className="font-bold">Historial de sincronización</h2></div>{runs.length === 0 ? <p className="p-5 text-sm text-[var(--color-muted)]">Todavía no hay sincronizaciones.</p> : <div className="divide-y divide-[var(--color-border)]">{runs.map(run => <div key={run.id} className="flex items-center justify-between gap-3 p-4 text-sm"><span>{new Date(run.created_at).toLocaleString('es-AR')}</span><Badge variant={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : 'default'}>{run.status}</Badge><span className="text-[var(--color-muted)]">{run.imported_count} movimientos</span></div>)}</div>}</section>
  </div>
}

export function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>('arca')
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><TopBar title="Integraciones" subtitle="Facturación fiscal y movimientos externos" /><div className="responsive-tabs flex gap-1 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 md:px-6"><button onClick={() => setTab('arca')} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${tab === 'arca' ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-transparent text-[var(--color-muted)]'}`}><ReceiptText size={17} /> ARCA</button><button onClick={() => setTab('mercadopago')} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${tab === 'mercadopago' ? 'border-sky-500 text-sky-600' : 'border-transparent text-[var(--color-muted)]'}`}><Landmark size={17} /> Mercado Pago</button></div><div className="flex-1 overflow-y-auto">{tab === 'arca' ? <ArcaPanel /> : <MercadoPagoPanel />}</div></div>
}
