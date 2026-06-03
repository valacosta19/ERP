import { X, Plus, Wallet } from 'lucide-react'
import type { Currency } from '@/types'
import type { FunnelPaymentRow } from './funnelTypes'
import { StepHeading, SectionLabel } from './funnelAtoms'
import { money, funnelInput } from './funnelFormat'

type Anticipo = { id: string; date: string; amount: number; currency: string }

type Props = {
  currency: Currency
  netToPay: number
  totalToCharge: number
  paymentsTotal: number
  payments: FunnelPaymentRow[]
  onPayments: (rows: FunnelPaymentRow[]) => void
  paymentMethods: string[]
  cashMethod: string | null
  anticipoAmount: number
  onAnticipo: (v: number) => void
  unrefundedAnticipos: Anticipo[]
}

export function StepPayment({
  currency, netToPay, totalToCharge, paymentsTotal, payments, onPayments,
  paymentMethods, cashMethod, anticipoAmount, onAnticipo, unrefundedAnticipos,
}: Props) {
  const remaining = totalToCharge - paymentsTotal
  const isCash = (m: string) => cashMethod != null && m === cashMethod
  const cashRow = payments.find(p => isCash(p.payment_method))
  const change = cashRow && cashRow.received != null ? cashRow.received - cashRow.amount : 0

  function payAllWith(method: string) {
    onPayments([{ payment_method: method, amount: Math.max(0, totalToCharge), received: null }])
  }
  function addRow() {
    const used = new Set(payments.map(p => p.payment_method))
    const next = paymentMethods.find(m => !used.has(m)) ?? paymentMethods[0]
    onPayments([...payments, { payment_method: next, amount: Math.max(0, remaining), received: null }])
  }
  function update(i: number, patch: Partial<FunnelPaymentRow>) {
    onPayments(payments.map((p, ii) => ii === i ? { ...p, ...patch } : p))
  }

  return (
    <div style={{ maxWidth: '560px' }}>
      <StepHeading kicker="Paso 5 — Pago" title="Cobrar" />

      {unrefundedAnticipos.length > 0 && (
        <div style={{ marginBottom: '22px' }}>
          <SectionLabel>Imputar anticipo previo</SectionLabel>
          <div className="flex flex-wrap gap-2" style={{ marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => onAnticipo(0)}
              style={chip(anticipoAmount === 0)}
            >
              Ninguno
            </button>
            {unrefundedAnticipos.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => onAnticipo(Math.min(a.amount, netToPay))}
                style={chip(anticipoAmount > 0 && anticipoAmount === Math.min(a.amount, netToPay))}
              >
                {money(a.amount, currency)} <span style={{ opacity: 0.6, fontWeight: 500 }}>· {a.date}</span>
              </button>
            ))}
          </div>
          {anticipoAmount > 0 && (
            <div style={{ marginTop: '8px', fontSize: '0.8125rem', color: 'var(--color-success)', fontWeight: 600 }}>
              Anticipo {money(anticipoAmount, currency)} imputado · queda por cobrar {money(totalToCharge, currency)}
            </div>
          )}
        </div>
      )}

      {totalToCharge <= 0 ? (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '18px 20px', borderRadius: '14px',
            background: 'var(--color-success-light)', color: 'var(--color-success)', fontWeight: 600,
          }}
        >
          <Wallet size={20} />
          Cubierto por el anticipo — se marca pagado sin cobrar.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '14px' }}>
            <SectionLabel>Cobrar todo con</SectionLabel>
            <div className="flex flex-wrap gap-2" style={{ marginTop: '8px' }}>
              {paymentMethods.map(m => (
                <button key={m} type="button" onClick={() => payAllWith(m)} style={chip(payments.length === 1 && payments[0].payment_method === m && payments[0].amount === totalToCharge)}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {payments.map((p, i) => (
              <div key={i} style={{ border: '1.5px solid var(--color-border)', borderRadius: '13px', padding: '12px 14px', background: 'var(--color-surface)' }}>
                <div className="flex items-center gap-2">
                  <select
                    value={p.payment_method}
                    onChange={e => update(i, { payment_method: e.target.value, received: null })}
                    style={{ ...funnelInput, padding: '9px 10px', flex: 1 }}
                  >
                    {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <div style={{ position: 'relative', width: '150px' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }}>$</span>
                    <input
                      type="number" min="0"
                      value={p.amount === 0 ? '' : String(p.amount)}
                      onChange={e => update(i, { amount: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      style={{ ...funnelInput, padding: '9px 12px 9px 24px', textAlign: 'right' }}
                      className="tabular-nums"
                    />
                  </div>
                  {payments.length > 1 && (
                    <button type="button" onClick={() => onPayments(payments.filter((_, ii) => ii !== i))} style={iconBtn}>
                      <X size={15} />
                    </button>
                  )}
                </div>
                {isCash(p.payment_method) && (
                  <div className="flex items-center gap-3" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--color-border)' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>Recibido</span>
                    <div style={{ position: 'relative', width: '140px' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }}>$</span>
                      <input
                        type="number" min="0"
                        value={p.received == null ? '' : String(p.received)}
                        onChange={e => update(i, { received: e.target.value === '' ? null : parseFloat(e.target.value) || 0 })}
                        placeholder={String(p.amount)}
                        style={{ ...funnelInput, padding: '8px 12px 8px 24px', textAlign: 'right' }}
                        className="tabular-nums"
                      />
                    </div>
                    {p.received != null && (
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: change >= 0 ? 'var(--color-success)' : 'var(--color-danger)', whiteSpace: 'nowrap' }}>
                        Cambio {money(Math.max(0, change), currency)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {payments.length < paymentMethods.length && (
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5"
              style={{ marginTop: '12px', fontSize: '0.8125rem', color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              <Plus size={14} /> Dividir pago
            </button>
          )}

          <div
            className="flex items-center justify-between"
            style={{ marginTop: '18px', padding: '12px 16px', borderRadius: '12px', background: Math.abs(remaining) < 1 ? 'var(--color-success-light)' : 'var(--color-warning-light)' }}
          >
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-muted)' }}>
              {Math.abs(remaining) < 1 ? 'Pago completo' : remaining > 0 ? 'Falta cobrar' : 'Excede'}
            </span>
            <span style={{ fontWeight: 700, color: Math.abs(remaining) < 1 ? 'var(--color-success)' : 'var(--color-warning)' }} className="tabular-nums">
              {money(Math.abs(remaining), currency)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function chip(active: boolean): React.CSSProperties {
  return {
    padding: '10px 16px', borderRadius: '999px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600,
    border: active ? '2px solid var(--color-accent)' : '1.5px solid var(--color-border)',
    background: active ? 'var(--color-accent-light)' : 'var(--color-surface)',
    color: 'var(--color-text)',
  }
}

const iconBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px',
  borderRadius: '9px', border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-danger)', cursor: 'pointer', flexShrink: 0,
}
