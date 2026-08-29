import { describe, it, expect, vi } from 'vitest'
import { showToast, dismissToast, subscribeToasts } from './toast'

describe('toast store', () => {
  it('notifies subscribers on show and dismiss', () => {
    const seen: number[][] = []
    const unsubscribe = subscribeToasts(list => seen.push(list.map(t => t.id)))
    showToast('uno')
    showToast('dos', 'success')
    const last = seen[seen.length - 1]
    expect(last).toHaveLength(2)
    dismissToast(last[0])
    expect(seen[seen.length - 1]).toEqual([last[1]])
    unsubscribe()
    const before = seen.length
    showToast('tres')
    expect(seen).toHaveLength(before)
    vi.restoreAllMocks()
  })
})
