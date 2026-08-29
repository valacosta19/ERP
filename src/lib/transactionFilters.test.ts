import { describe, it, expect } from 'vitest'
import { readDateParam, readCurrencyParam } from './transactionFilters'

const p = (query: string) => new URLSearchParams(query)

describe('readDateParam', () => {
  it('returns the fallback when the param is absent', () => {
    expect(readDateParam(p(''), 'from', '2026-08-01')).toBe('2026-08-01')
  })

  it('accepts an ISO date', () => {
    expect(readDateParam(p('from=2026-07-01'), 'from', '2026-08-01')).toBe('2026-07-01')
  })

  it('keeps an empty value so a blanked date means no bound', () => {
    expect(readDateParam(p('from='), 'from', '2026-08-01')).toBe('')
  })

  it('falls back on a malformed value', () => {
    expect(readDateParam(p('to=foo'), 'to', '2026-08-31')).toBe('2026-08-31')
    expect(readDateParam(p('to=2026-8-1'), 'to', '2026-08-31')).toBe('2026-08-31')
  })
})

describe('readCurrencyParam', () => {
  it('accepts a known currency', () => {
    expect(readCurrencyParam(p('cur=USD'))).toBe('USD')
  })

  it('falls back to all currencies when absent or unknown', () => {
    expect(readCurrencyParam(p(''))).toBe('')
    expect(readCurrencyParam(p('cur=GBP'))).toBe('')
  })
})
