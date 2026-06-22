import type { TicketPayload } from './funnelSubmit'

const KEY = 'funnel-queue-v1'

export type QueuedTicket = {
  id: string
  payload: TicketPayload
  createdAt: string
  attempts: number
  lastError: string | null
  status: 'pending' | 'stuck'
}

let counter = 0
function genId(): string {
  counter += 1
  return `q-${Date.now()}-${counter}`
}

let flushing = false

export function readQueue(): QueuedTicket[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(items: QueuedTicket[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch (e) {
    throw new Error(`No se pudo escribir la cola local: ${(e as Error).message}`)
  }
}

export function enqueueTicket(payload: TicketPayload): QueuedTicket {
  const item: QueuedTicket = { id: genId(), payload, createdAt: new Date().toISOString(), attempts: 0, lastError: null, status: 'pending' }
  writeQueue([...readQueue(), item])
  return item
}

export function removeFromQueue(id: string): void {
  writeQueue(readQueue().filter(i => i.id !== id))
}

function markFailure(id: string, message: string): void {
  writeQueue(readQueue().map(i => (i.id === id ? { ...i, attempts: i.attempts + 1, lastError: message } : i)))
}

function markStuck(id: string, message: string): void {
  writeQueue(readQueue().map(i => (i.id === id ? { ...i, attempts: i.attempts + 1, lastError: message, status: 'stuck' as const } : i)))
}

export function discardTicket(id: string): void {
  removeFromQueue(id)
}

export function retryTicket(id: string): void {
  writeQueue(readQueue().map(i => (i.id === id ? { ...i, attempts: 0, status: 'pending' as const, lastError: null } : i)))
}

export async function flushQueue(submit: (payload: TicketPayload) => Promise<void>): Promise<number> {
  if (flushing) return 0
  flushing = true
  let synced = 0
  try {
  for (const item of readQueue()) {
    if (item.status === 'stuck') continue
    try {
      await submit(item.payload)
      removeFromQueue(item.id)
      synced += 1
    } catch (e) {
      const isNetworkError = !navigator.onLine || /fetch|network|failed to fetch|load failed|timeout/i.test((e as Error).message)
      if (isNetworkError) {
        markFailure(item.id, (e as Error).message)
        break
      } else {
        markStuck(item.id, (e as Error).message)
      }
    }
  }
  } finally {
    flushing = false
  }
  return synced
}
