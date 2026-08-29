import { describe, it, expect } from 'vitest'
import { confirmDialog, subscribeConfirm, type PendingConfirm } from './confirm'

describe('confirmDialog', () => {
  it('resolves with the answer and clears the pending request', async () => {
    let current: PendingConfirm | null = null
    const unsubscribe = subscribeConfirm(p => { current = p })
    const answer = confirmDialog({ message: '¿Seguro?' })
    expect(current).not.toBeNull()
    current!.resolve(true)
    await expect(answer).resolves.toBe(true)
    expect(current).toBeNull()
    unsubscribe()
  })

  it('cancels a previous request when a new one arrives', async () => {
    const first = confirmDialog({ message: 'uno' })
    let current: PendingConfirm | null = null
    const unsubscribe = subscribeConfirm(p => { current = p })
    const second = confirmDialog({ message: 'dos' })
    await expect(first).resolves.toBe(false)
    current!.resolve(false)
    await expect(second).resolves.toBe(false)
    unsubscribe()
  })
})
