import { useCallback, useEffect, useState } from 'react'
import type { TicketPayload } from './funnelSubmit'
import type { QueuedTicket } from './offlineQueue'
import { readQueue, enqueueTicket, flushQueue, discardTicket, retryTicket } from './offlineQueue'

export function useFunnelQueue(submit: (payload: TicketPayload) => Promise<void>) {
  const [pending, setPending] = useState(() => readQueue().length)
  const [stuckTickets, setStuckTickets] = useState<QueuedTicket[]>(() => readQueue().filter(t => t.status === 'stuck'))
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(() => {
    const q = readQueue()
    setPending(q.length)
    setStuckTickets(q.filter(t => t.status === 'stuck'))
  }, [])

  const flush = useCallback(async () => {
    if (syncing || readQueue().filter(t => t.status !== 'stuck').length === 0 || !navigator.onLine) return
    setSyncing(true)
    try {
      await flushQueue(submit)
    } finally {
      setSyncing(false)
      refresh()
    }
  }, [submit, syncing, refresh])

  const enqueue = useCallback((payload: TicketPayload) => {
    enqueueTicket(payload)
    refresh()
  }, [refresh])

  const discard = useCallback((id: string) => {
    discardTicket(id)
    refresh()
  }, [refresh])

  const retry = useCallback((id: string) => {
    retryTicket(id)
    refresh()
  }, [refresh])

  useEffect(() => {
    void flush()
    const onOnline = () => { void flush() }
    window.addEventListener('online', onOnline)
    const interval = window.setInterval(() => { void flush() }, 20000)
    return () => {
      window.removeEventListener('online', onOnline)
      window.clearInterval(interval)
    }
  }, [flush])

  return { pending, stuckTickets, syncing, enqueue, flush, discard, retry }
}
