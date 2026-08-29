import { X, Plus, Wallet } from 'lucide-react'
import type { Currency } from '@/types'
import type { FunnelPaymentRow } from './funnelTypes'
import { StepHeading, SectionLabel } from './funnelAtoms'
import { money, funnelInput } from './funnelFormat'

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
  anticipoPresets: number[]
  anticipoBalance: number
  hasService: boolean
}

export function StepPayment({
  currency, netToPay, totalToCharge, paymentsTotal, payments, onPayments,
  paymentMethods, cashMethod, anticipoAmount, onAnticipo, anticipoPresets, anticipoBalance, hasService,
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

      {hasService && (
      <div style={{ marginBottom: '22px' }}>
        <div className="flex items-center justify-between">
          <SectionLabel>Imputar anticipo previo</SectionLabel>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontWeight: 600 }}>
            Saldo disponible {money(anticipoBalance, currency)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2" style={{ marginTop: '8px' }}>
          <button
            type="button"
            onClick={() => onAnticipo(0)}
            style={chip(anticipoAmount === 0)}
          >
            Ninguno
          </button>
          {currency === 'ARS' && anticipoPresets.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => onAnticipo(Math.min(p, netToPay))}
              style={chip(anticipoAmount > 0 && anticipoAmount === Math.min(p, netToPay))}
            >
              {money(p, currency)}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', width: '180px', marginTop: '8px' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }}>$</span>
          <input
            type="number" min="0"
            value={anticipoAmount === 0 ? '' : String(anticipoAmount)}
            onChange={e => onAnticipo(Math.min(Math.max(0, parseFloat(e.target.value) || 0), netToPay))}
            placeholder="Otro monto"
            style={{ ...funnelInput, padding: '9px 12px 9px 24px', textAlign: 'right' }}
            className="tabular-nums"
          />
        </div>
        {anticipoAmount > anticipoBalance && (
          <div style={{ marginTop: '6px', fontSize: '0.8125rem', color: 'var(--color-warning)', fontWeight: 600 }}>
            El anticipo imputado supera el saldo disponible ({money(anticipoBalance, currency)})
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
