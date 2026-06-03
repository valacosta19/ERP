import { useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import type { Currency, Professional } from '@/types'
import type { CartLine, FunnelType } from './funnelTypes'
import { lineGross } from './funnelTypes'
import { StepHeading, SectionLabel } from './funnelAtoms'
import { money, funnelInput } from './funnelFormat'

type IncomeProps = {
  mode: 'income'
  lines: CartLine[]
  currency: Currency
  professionals: Professional[]
  onUnitPrice: (key: string, price: number) => void
  onLineProfessionals: (key: string, profs: { id: string; commission_rate: number }[]) => void
}

type SimpleProps = {
  mode: 'simple'
  type: Exclude<FunnelType, 'income'>
  currency: Currency
  manualAmount: number
  onAmount: (v: number) => void
  simpleMethod: string
  onMethod: (m: string) => void
  paymentMethods: string[]
  transferDirection: 'entrada' | 'salida'
  onDirection: (d: 'entrada' | 'salida') => void
}

export function StepAmount(props: IncomeProps | SimpleProps) {
  if (props.mode === 'income') return <IncomeAmount {...props} />
  return <SimpleAmount {...props} />
}

function IncomeAmount({ lines, currency, professionals, onUnitPrice, onLineProfessionals }: IncomeProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const activeProfs = professionals.filter(p => p.active)

  function removeProf(line: CartLine, id: string) {
    onLineProfessionals(line.key, line.professionals.filter(p => p.id !== id))
  }
  function assignRate(line: CartLine, prof: Professional, rate: number) {
    const exists = line.professionals.some(p => p.id === prof.id)
    const next = exists
      ? line.professionals.map(p => p.id === prof.id ? { ...p, commission_rate: rate } : p)
      : [...line.professionals, { id: prof.id, commission_rate: rate }]
    onLineProfessionals(line.key, next)
  }

  return (
    <div style={{ maxWidth: '660px' }}>
      <StepHeading kicker="Paso 3 — Monto" title="Precios y profesionales" />
      <div className="space-y-3">
        {lines.map(line => (
          <div
            key={line.key}
            style={{ border: '1.5px solid var(--color-border)', borderRadius: '16px', padding: '16px 18px', background: 'var(--color-surface)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text)' }}>{line.name}</span>
                {line.qty > 1 && <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', fontWeight: 600 }}>× {line.qty}</span>}
              </div>
              <div className="flex items-center gap-2">
                {editing === line.key ? (
                  <>
                    <div style={{ position: 'relative', width: '140px' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }}>$</span>
                      <input
                        type="number"
                        autoFocus
                        defaultValue={line.unitPrice}
                        onChange={e => onUnitPrice(line.key, parseFloat(e.target.value) || 0)}
                        onKeyDown={e => { if (e.key === 'Enter') setEditing(null) }}
                        style={{ ...funnelInput, paddingLeft: '24px', padding: '9px 12px 9px 24px', textAlign: 'right' }}
                      />
                    </div>
                    <button type="button" onClick={() => setEditing(null)} style={iconBtn('var(--color-success)')}>
                      <Check size={15} />
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)' }} className="tabular-nums">
                      {money(lineGross(line), currency)}
                    </span>
                    <button type="button" onClick={() => setEditing(line.key)} title="Editar precio" style={iconBtn('var(--color-accent)')}>
                      <Pencil size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {line.kind === 'service' && activeProfs.length > 0 && (
              <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px dashed var(--color-border)' }}>
                <SectionLabel>Profesionales — tocá la comisión que aplica</SectionLabel>
                <div className="flex flex-wrap gap-2" style={{ marginTop: '10px' }}>
                  {activeProfs.map(prof => {
                    const assigned = line.professionals.find(p => p.id === prof.id)
                    const rates = prof.commission_rates ?? []
                    return (
                      <div
                        key={prof.id}
                        className="flex items-center"
                        style={{
                          borderRadius: '999px', overflow: 'hidden',
                          border: assigned ? '2px solid var(--color-accent)' : '1.5px solid var(--color-border)',
                          background: assigned ? 'var(--color-accent-light)' : 'var(--color-surface)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => assigned ? removeProf(line, prof.id) : rates.length === 0 ? assignRate(line, prof, 0) : undefined}
                          title={assigned ? 'Quitar' : undefined}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 12px', border: 'none',
                            background: 'transparent', cursor: assigned || rates.length === 0 ? 'pointer' : 'default',
                            fontSize: '0.875rem', fontWeight: 600,
                            color: assigned ? 'var(--color-accent)' : 'var(--color-text)',
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px',
                              borderRadius: '50%', fontSize: '0.6875rem', fontWeight: 700,
                              background: assigned ? 'var(--color-accent)' : 'var(--color-bg)', color: assigned ? '#fff' : 'var(--color-muted)',
                            }}
                          >
                            {prof.name.slice(0, 1).toUpperCase()}
                          </span>
                          {prof.name}
                          {assigned && <X size={13} />}
                        </button>
                        {rates.length > 0 ? (
                          <span className="flex items-center" style={{ borderLeft: assigned ? '1.5px solid var(--color-accent)' : '1.5px solid var(--color-border)' }}>
                            {rates.map(r => {
                              const isActive = assigned?.commission_rate === r
                              return (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => assignRate(line, prof, r)}
                                  style={{
                                    padding: '8px 11px', border: 'none', cursor: 'pointer',
                                    fontSize: '0.8125rem', fontWeight: 700,
                                    background: isActive ? 'var(--color-accent)' : 'transparent',
                                    color: isActive ? '#fff' : assigned ? 'var(--color-accent)' : 'var(--color-muted)',
                                  }}
                                >
                                  {r}%
                                </button>
                              )
                            })}
                          </span>
                        ) : assigned && (
                          <span className="flex items-center" style={{ borderLeft: '1.5px solid var(--color-accent)', paddingRight: '8px' }}>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={assigned.commission_rate === 0 ? '' : String(assigned.commission_rate)}
                              onChange={e => assignRate(line, prof, parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              style={{ width: '44px', border: 'none', background: 'transparent', textAlign: 'right', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-accent)', outline: 'none', padding: '8px 2px 8px 8px' }}
                            />
                            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-accent)' }}>%</span>
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SimpleAmount({ type, currency, manualAmount, onAmount, simpleMethod, onMethod, paymentMethods, transferDirection, onDirection }: SimpleProps) {
  return (
    <div style={{ maxWidth: '520px' }}>
      <StepHeading kicker="Paso 3 — Monto" title="¿Cuánto?" />

      <div style={{ position: 'relative', marginBottom: '22px' }}>
        <span style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', fontSize: '1.6rem', fontWeight: 600, color: 'var(--color-muted)' }}>
          {currency === 'ARS' ? '$' : currency}
        </span>
        <input
          type="number" min="0" autoFocus
          value={manualAmount === 0 ? '' : String(manualAmount)}
          onChange={e => onAmount(parseFloat(e.target.value) || 0)}
          placeholder="0"
          style={{
            width: '100%', padding: '18px 18px 18px 56px', fontSize: '2rem', fontWeight: 700,
            border: '1.5px solid var(--color-border)', borderRadius: '16px', background: 'var(--color-surface)',
            color: 'var(--color-text)', outline: 'none', fontFamily: 'var(--font-body)',
          }}
          className="tabular-nums"
        />
      </div>

      {type === 'transfer' && (
        <div style={{ marginBottom: '20px' }}>
          <SectionLabel>Dirección</SectionLabel>
          <div className="flex gap-2" style={{ marginTop: '8px' }}>
            {(['entrada', 'salida'] as const).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => onDirection(d)}
                style={{
                  flex: 1, padding: '12px', borderRadius: '12px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
                  border: transferDirection === d ? '2px solid var(--color-accent)' : '1.5px solid var(--color-border)',
                  background: transferDirection === d ? 'var(--color-accent-light)' : 'var(--color-surface)',
                  color: 'var(--color-text)', textTransform: 'capitalize',
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionLabel>{type === 'transfer' ? 'Cuenta / caja' : 'Sale de'}</SectionLabel>
        <div className="flex flex-wrap gap-2" style={{ marginTop: '8px' }}>
          {paymentMethods.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => onMethod(m)}
              style={{
                padding: '10px 16px', borderRadius: '999px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600,
                border: simpleMethod === m ? '2px solid var(--color-accent)' : '1.5px solid var(--color-border)',
                background: simpleMethod === m ? 'var(--color-accent-light)' : 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function iconBtn(color: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px',
    borderRadius: '10px', border: '1px solid var(--color-border)', background: 'var(--color-surface)',
    color, cursor: 'pointer', flexShrink: 0,
  }
}
