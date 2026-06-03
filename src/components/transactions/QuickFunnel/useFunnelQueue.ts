import { useCallback, useEffect, useState } from 'react'
import type { TicketPayload } from './funnelSubmit'
import { readQueue, enqueueTicket, flushQueue } from './offlineQueue'

export function useFunnelQueue(submit: (payload: TicketPayload) => Promise<void>) {
  const [pending, setPending] = useState(() => readQueue().length)
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(() => setPending(readQueue().length), [])

  const flush = useCallback(async () => {
    if (syncing || readQueue().length === 0 || !navigator.onLine) return
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

  return { pending, syncing, enqueue, flush }
}
