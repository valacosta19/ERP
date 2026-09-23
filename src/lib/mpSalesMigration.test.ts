import { describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/106_mp_sales_registration.sql?raw'

describe('Mercado Pago sale registration migration', () => {
  it('keeps one active approval per movement and stores exact MP allocations', () => {
    expect(migration).toContain('mp_sale_approvals_active_movement_key')
    expect(migration).toContain('allocated_amount numeric(12,2)')
    expect(migration).toContain('mp_reconciliation_links_movement_transaction_key')
    expect(migration).toContain('USING (integrations_is_admin())')
  })

  it('publishes the complete sale atomically through canonical domain functions', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION publish_mp_sales')
    expect(migration).toContain('v_result := create_funnel_unit(')
    expect(migration).toContain('INSERT INTO transaction_group_members')
    expect(migration).toContain("SET status = 'reconciled'")
    expect(migration).toContain('CREATE TEMP TABLE pg_temp.mp_sale_payment_allocation')
    expect(migration).toContain('floor((v_line_cents::numeric * v_method_cents::numeric) / v_total_cents)::bigint')
    expect(migration).toContain('v_delta_cents := LEAST(v_row_remaining, v_column_remaining)')
  })

  it('rejects competing received-payment reconciliation and supports audit-preserving reversal', () => {
    expect(migration).toContain('Los cobros recibidos deben registrarse como ventas')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION reverse_mp_sale_approval')
    expect(migration).toContain('PERFORM void_transaction(v_transaction_id)')
    expect(migration).toContain("SET status = 'pending'")
  })
})
