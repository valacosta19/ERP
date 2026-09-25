import { describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/108_cross_currency_internal_transfers.sql?raw'

describe('cross-currency internal transfer migration', () => {
  it('adds and backfills leg-level currency with a legacy-writer fallback', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS currency text')
    expect(migration).toContain('SET currency = transaction_row.currency')
    expect(migration).toContain('ALTER COLUMN currency SET NOT NULL')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION derive_transaction_payment_currency')
  })

  it('keeps the header source-side and allows unequal amounts only across currencies', () => {
    expect(migration).toContain('v_source_currency IS DISTINCT FROM p_transaction_currency')
    expect(migration).toContain('v_source_currency = v_destination_currency')
    expect(migration).toContain('v_source_amount IS DISTINCT FROM v_destination_amount')
    expect(migration).toContain("COALESCE(NULLIF(p->>'currency', ''), p_currency)")
    expect(migration).toContain("COALESCE(NULLIF(p->>'currency', ''), v_currency)")
  })

  it('attributes opening balances and snapshots to each ledger leg currency', () => {
    expect(migration).toContain('p_currency IS NULL OR tp.currency = p_currency')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION compute_period_snapshots')
    expect(migration).toContain('COALESCE(tp.currency, t.currency)')
    expect(migration).toContain('GROUP BY tp.payment_method, COALESCE(tp.currency, t.currency)')
  })
})
