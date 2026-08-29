export interface ConfirmRequest {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export interface PendingConfirm extends ConfirmRequest {
  resolve: (value: boolean) => void
}

type Listener = (pending: PendingConfirm | null) => void

let pending: PendingConfirm | null = null
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener(pending)
}

export function confirmDialog(request: ConfirmRequest): Promise<boolean> {
  if (pending) pending.resolve(false)
  return new Promise<boolean>(resolve => {
    pending = { ...request, resolve: value => { pending = null; emit(); resolve(value) } }
    emit()
  })
}

export function subscribeConfirm(listener: Listener): () => void {
  listeners.add(listener)
  listener(pending)
  return () => {
    listeners.delete(listener)
  }
}
