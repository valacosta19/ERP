import type { Currency } from '@/types'
import type { DiscountMode } from './funnelTypes'
import { StepHeading, SectionLabel } from './funnelAtoms'
import { money, funnelInput } from './funnelFormat'

type Props = {
  currency: Currency
  gross: number
  discountMode: DiscountMode
  discountValue: number
  discountAmount: number
  onDiscountMode: (m: DiscountMode) => void
  onDiscountValue: (v: number) => void
  hasService: boolean
  tipEnabled: boolean
  tipAmount: number
  onTipEnabled: (v: boolean) => void
  onTipAmount: (v: number) => void
}

export function StepAdjust({
  currency, gross, discountMode, discountValue, discountAmount,
  onDiscountMode, onDiscountValue, hasService, tipEnabled, tipAmount, onTipEnabled, onTipAmount,
}: Props) {
  return (
    <div style={{ maxWidth: '520px' }}>
      <StepHeading kicker="Paso 4 — Ajustes" title="Descuento y propina" />

      <div style={{ marginBottom: '26px' }}>
        <SectionLabel>Descuento</SectionLabel>
        <div className="flex gap-2" style={{ marginTop: '8px', marginBottom: discountMode === 'none' ? 0 : '12px' }}>
          {(['none', 'amount', 'percent'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => onDiscountMode(m)}
              style={{
                flex: 1, padding: '11px', borderRadius: '12px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600,
                border: discountMode === m ? '2px solid var(--color-accent)' : '1.5px solid var(--color-border)',
                background: discountMode === m ? 'var(--color-accent-light)' : 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
            >
              {m === 'none' ? 'Sin descuento' : m === 'amount' ? 'Monto $' : 'Porcentaje %'}
            </button>
          ))}
        </div>
        {discountMode !== 'none' && (
          <div className="flex items-center gap-3">
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }}>
                {discountMode === 'amount' ? '$' : '%'}
              </span>
              <input
                type="number" min="0" autoFocus
                value={discountValue === 0 ? '' : String(discountValue)}
                onChange={e => onDiscountValue(parseFloat(e.target.value) || 0)}
                placeholder="0"
                style={{ ...funnelInput, paddingLeft: '32px' }}
              />
            </div>
            <span style={{ fontSize: '0.875rem', color: 'var(--color-danger)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              − {money(discountAmount, currency)}
            </span>
          </div>
        )}
        <div style={{ marginTop: '10px', fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
          Subtotal {money(gross, currency)} · Neto {money(Math.max(0, gross - discountAmount), currency)}
        </div>
      </div>

      {hasService && (
        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
            <SectionLabel>Propina</SectionLabel>
            <div className="flex gap-1" style={{ background: 'var(--color-bg)', padding: '3px', borderRadius: '10px' }}>
              {[false, true].map(v => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => onTipEnabled(v)}
                  style={{
                    padding: '6px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600,
                    background: tipEnabled === v ? 'var(--color-surface)' : 'transparent',
                    color: tipEnabled === v ? 'var(--color-text)' : 'var(--color-muted)',
                    boxShadow: tipEnabled === v ? '0 1px 3px rgba(15,17,23,0.08)' : 'none',
                  }}
                >
                  {v ? 'Sí' : 'No'}
                </button>
              ))}
            </div>
          </div>
          {tipEnabled && (
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }}>$</span>
              <input
                type="number" min="0" autoFocus
                value={tipAmount === 0 ? '' : String(tipAmount)}
                onChange={e => onTipAmount(parseFloat(e.target.value) || 0)}
                placeholder="0"
                style={{ ...funnelInput, paddingLeft: '28px' }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
