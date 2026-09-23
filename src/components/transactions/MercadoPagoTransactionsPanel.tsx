import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloudDownload, ExternalLink, RefreshCw, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useMpMovements, useMpSync, useMpSyncRuns, useReverseMpSaleApproval } from '@/hooks/useIntegrations'
import { MP_CLASSIFICATION_LABELS } from '@/lib/integrations'
import { formatDate } from '@/lib/formatDate'
import { showToast } from '@/lib/toast'
import type { MpMovement } from '@/types'
import { MpMovementReconcileModal } from '@/components/integrations/MpMovementReconcileModal'
import { confirmDialog } from '@/lib/confirm'
import { groupMpMovementsByDate } from '@/lib/mpSales'

const money = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount)

type StatusFilter = 'pending' | 'reconciled' | 'all'

export function MercadoPagoTransactionsPanel() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<StatusFilter>('pending')
  const [classifying, setClassifying] = useState<MpMovement | null>(null)
  const { data: movements = [], isLoading } = useMpMovements(status)
  const { data: runs = [] } = useMpSyncRuns()
  const sync = useMpSync()
  const reverseApproval = useReverseMpSaleApproval()
  const processing = runs.find(run => run.status === 'processing' || run.status === 'requested')
  const byDate = groupMpMovementsByDate(movements)

  async function synchronize() {
    if (processing) await sync.mutateAsync({ action: 'poll', runId: processing.id })
    else await sync.mutateAsync({ action: 'start', days: 3 })
    showToast(processing ? 'Se consultó el reporte pendiente.' : 'Reporte solicitado a Mercado Pago.', 'success')
  }

  async function reverse(movement: MpMovement) {
    if (!movement.approval) return
    const confirmed = await confirmDialog({ message: '¿Revertir estas ventas? Las transacciones quedarán anuladas, el inventario se restaurará y el movimiento volverá a pendientes.', danger: true })
    if (!confirmed) return
    await reverseApproval.mutateAsync(movement.approval.id)
    showToast('La aprobación se revirtió y el movimiento volvió a pendientes.', 'success')
  }

  return <div className="flex-1 overflow-y-auto p-4 md:p-6">
    <section className="mb-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:p-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2"><CloudDownload size={18} className="text-sky-600" /><h2 className="font-bold">Movimientos de Mercado Pago</h2></div>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Sincronizá, registrá ventas y clasificá otros movimientos desde una sola bandeja.</p>
          {runs[0] && <p className="mt-2 text-xs text-[var(--color-muted)]">Última ejecución: {new Date(runs[0].created_at).toLocaleString('es-AR')} · {runs[0].status}{runs[0].status === 'completed' ? ` · ${runs[0].imported_count} movimientos` : ''}</p>}
        </div>
        <Button loading={sync.isPending} onClick={() => void synchronize()}>{processing ? <RefreshCw size={16} /> : <CloudDownload size={16} />}{processing ? 'Consultar reporte' : 'Sincronizar ahora'}</Button>
      </div>
    </section>

    <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <header className="flex flex-col justify-between gap-3 border-b border-[var(--color-border)] p-4 md:flex-row md:items-end">
        <div><h2 className="font-bold">Actividad diaria</h2><p className="mt-1 text-sm text-[var(--color-muted)]">Los pendientes no afectan contabilidad hasta que los registres o clasifiques.</p></div>
        <div className="w-full md:w-48"><Select label="Estado" value={status} onChange={event => setStatus(event.target.value as StatusFilter)} options={[{ value: 'pending', label: 'Pendientes' }, { value: 'reconciled', label: 'Registrados' }, { value: 'all', label: 'Todos' }]} /></div>
      </header>
      {isLoading ? <p className="p-6 text-sm text-[var(--color-muted)]">Cargando movimientos…</p> : byDate.length === 0 ? <p className="p-8 text-center text-sm text-[var(--color-muted)]">No hay movimientos para este estado.</p> : byDate.map(group => <div key={group.date}>
        <div className="border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">{formatDate(group.date)}</div>
        <div className="divide-y divide-[var(--color-border)]">{group.rows.map(movement => {
          const canRegister = movement.status === 'pending' && movement.suggested_classification === 'received_payment' && movement.amount > 0
          return <article key={movement.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_9rem_9rem_auto] md:items-center">
            <div className="min-w-0"><strong className="block truncate text-sm">{movement.description || movement.movement_type || 'Movimiento Mercado Pago'}</strong><span className="text-xs text-[var(--color-muted)]">MP {movement.external_id}</span>{movement.approval && <p className="mt-1 text-xs text-[var(--color-muted)]">Aprobación {movement.approval.id.slice(0, 8)} · {movement.approval.tickets?.length ?? 0} venta(s)</p>}</div>
            <Badge variant={movement.status === 'pending' ? 'warning' : 'success'}>{movement.status === 'pending' ? 'Pendiente' : movement.status === 'reconciled' ? 'Registrado' : 'Ignorado'}</Badge>
            <strong className={movement.amount >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}>{money(movement.amount)}</strong>
            <div className="flex flex-wrap justify-end gap-2">
              {canRegister && <Button size="sm" onClick={() => navigate(`/transactions/mercadopago/${movement.id}/registrar`)}>Registrar</Button>}
              {movement.status === 'pending' && <Button size="sm" variant="secondary" onClick={() => setClassifying(movement)}>Clasificar</Button>}
              {movement.approval?.tickets?.map(ticket => <Button key={ticket.group_id} size="sm" variant="secondary" onClick={() => navigate(`/transactions?group=${ticket.group_id}`)}><ExternalLink size={14} />Venta {ticket.position}</Button>)}
              {movement.approval && <Button size="sm" variant="secondary" loading={reverseApproval.isPending} onClick={() => void reverse(movement)}><RotateCcw size={14} />Revertir</Button>}
              {movement.status === 'pending' && canRegister && <span className="self-center text-xs text-[var(--color-muted)]">{MP_CLASSIFICATION_LABELS[movement.suggested_classification]}</span>}
            </div>
          </article>
        })}</div>
      </div>)}
    </section>
    {classifying && <MpMovementReconcileModal movement={classifying} onClose={() => setClassifying(null)} />}
  </div>
}
