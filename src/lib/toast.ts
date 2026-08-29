export type ToastVariant = 'danger' | 'success' | 'warning'

export interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

type Listener = (toasts: Toast[]) => void

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener(toasts)
}

export function showToast(message: string, variant: ToastVariant = 'danger'): void {
  toasts = [...toasts, { id: nextId++, message, variant }]
  emit()
}

export function dismissToast(id: number): void {
  toasts = toasts.filter(t => t.id !== id)
  emit()
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  listener(toasts)
  return () => {
    listeners.delete(listener)
  }
}
