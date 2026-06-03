import type { TicketPayload } from './funnelSubmit'

const KEY = 'funnel-queue-v1'

export type QueuedTicket = {
  id: string
  payload: TicketPayload
  createdAt: string
  attempts: number
  lastError: string | null
}

let counter = 0
function genId(): string {
  counter += 1
  return `q-${Date.now()}-${counter}`
}

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
  const item: QueuedTicket = { id: genId(), payload, createdAt: new Date().toISOString(), attempts: 0, lastError: null }
  writeQueue([...readQueue(), item])
  return item
}

function removeFromQueue(id: string): void {
  writeQueue(readQueue().filter(i => i.id !== id))
}

function markFailure(id: string, message: string): void {
  writeQueue(readQueue().map(i => (i.id === id ? { ...i, attempts: i.attempts + 1, lastError: message } : i)))
}

/**
 * Attempts to submit every queued ticket in order. Stops on the first failure
 * (likely still offline) so order is preserved and a flaky connection doesn't
 * hammer the API. Returns how many were synced.
 */
export async function flushQueue(submit: (payload: TicketPayload) => Promise<void>): Promise<number> {
  let synced = 0
  for (const item of readQueue()) {
    try {
      await submit(item.payload)
      removeFromQueue(item.id)
      synced += 1
    } catch (e) {
      markFailure(item.id, (e as Error).message)
      break
    }
  }
  return synced
}
