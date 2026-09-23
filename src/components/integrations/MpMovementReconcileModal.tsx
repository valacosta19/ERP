import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useTransactionCategories } from '@/hooks/useTransactionCategories'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { usePublishMpReconciliation } from '@/hooks/useIntegrations'
import { MP_CLASSIFICATION_LABELS, reconciliationRequirements } from '@/lib/integrations'
import { formatDate } from '@/lib/formatDate'
import { showToast } from '@/lib/toast'
import type { MpClassification, MpMovement } from '@/types'

const money = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount)

export function MpMovementReconcileModal({ movement, onClose }: { movement: MpMovement; onClose: () => void }) {
  const publish = usePublishMpReconciliation()
  const { data: categories = [] } = useTransactionCategories()
  const { data: paymentMethods = [] } = usePaymentMethods()
  const initial = movement.suggested_classification === 'received_payment' ? 'unknown' : movement.suggested_classification
  const [classification, setClassification] = useState<MpClassification>(initial)
  const [subcategoryId, setSubcategoryId] = useState('')
  const [destinationPaymentMethod, setDestinationPaymentMethod] = useState('')
  const [notes, setNotes] = useState('')
  const requirements = reconciliationRequirements(classification)
  const valid = classification !== 'unknown' && classification !== 'received_payment'
    && (!requirements.category || subcategoryId) && (!requirements.destination || destinationPaymentMethod)

  async function submit() {
    if (!valid) return
    await publish.mutateAsync({ movementId: movement.id, classification, subcategoryId, destinationPaymentMethod, notes })
    showToast('Movimiento conciliado y publicado.', 'success')
    onClose()
  }

  const options = Object.entries(MP_CLASSIFICATION_LABELS)
    .filter(([value]) => value !== 'received_payment')
    .map(([value, label]) => ({ value, label }))

  return <Modal open onClose={onClose} title="Clasificar movimiento" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={publish.isPending} disabled={!valid} onClick={() => void submit()}>Publicar en contabilidad</Button></>}>
    <div className="space-y-4">
      <div className="rounded-lg bg-[var(--color-bg)] p-4">
        <p className="text-sm text-[var(--color-muted)]">{formatDate(movement.occurred_at.slice(0, 10))} · {movement.external_id}</p>
        <p className="mt-1 font-semibold">{movement.description || movement.movement_type || 'Movimiento Mercado Pago'}</p>
        <p className="mt-2 text-xl font-bold">{money(movement.amount)}</p>
      </div>
      <Select label="Clasificación" value={classification} onChange={event => setClassification(event.target.value as MpClassification)} options={options} />
      {requirements.category && <Select label="Categoría de egreso" value={subcategoryId} onChange={event => setSubcategoryId(event.target.value)} placeholder="Elegir categoría" options={categories.filter(category => category.transaction_type === 'expense').map(category => ({ value: category.id, label: category.name }))} />}
      {requirements.destination && <Select label="Cuenta de destino" value={destinationPaymentMethod} onChange={event => setDestinationPaymentMethod(event.target.value)} placeholder="Elegir destino" options={paymentMethods.filter(method => method.active && method.name.toLowerCase() !== 'mercado pago').map(method => ({ value: method.name, label: method.name }))} />}
      <Input label="Nota opcional" value={notes} onChange={event => setNotes(event.target.value)} />
      {classification === 'unknown' && <p className="rounded-lg bg-[var(--color-warning-light)] p-3 text-sm text-amber-800">Elegí una clasificación para publicar el movimiento. Si es una venta, cerrá este diálogo y usá “Registrar”.</p>}
    </div>
  </Modal>
}
