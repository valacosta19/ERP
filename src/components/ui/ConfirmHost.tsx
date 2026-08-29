import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { subscribeConfirm, type PendingConfirm } from '@/lib/confirm'

export function ConfirmHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  useEffect(() => subscribeConfirm(setPending), [])
  if (!pending) return null
  return (
    <Modal open onClose={() => pending.resolve(false)} title={pending.title ?? 'Confirmar'} size="sm">
      <p className="text-sm text-[var(--color-text)]">{pending.message}</p>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={() => pending.resolve(false)}>{pending.cancelLabel ?? 'Cancelar'}</Button>
        <Button variant={pending.danger ? 'danger' : 'primary'} onClick={() => pending.resolve(true)} autoFocus>{pending.confirmLabel ?? 'Confirmar'}</Button>
      </div>
    </Modal>
  )
}
