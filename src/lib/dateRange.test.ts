import { describe, it, expect, vi, afterEach } from 'vitest'
import { todayLocal, daysAgoLocal, formatLocalDate, currentMonthRange } from './dateRange'

afterEach(() => vi.useRealTimers())

describe('todayLocal', () => {
  it('uses the local calendar date, not UTC', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 29, 23, 30))
    expect(todayLocal()).toBe('2026-08-29')
    expect(new Date().toISOString().slice(0, 10)).not.toBe(todayLocal())
  })
})

describe('daysAgoLocal', () => {
  it('subtracts calendar days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 1, 12))
    expect(daysAgoLocal(1)).toBe('2026-02-28')
  })
})

describe('currentMonthRange', () => {
  it('spans the first to the last day of the month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 1, 10))
    expect(currentMonthRange()).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})

describe('formatLocalDate', () => {
  it('zero-pads month and day', () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
