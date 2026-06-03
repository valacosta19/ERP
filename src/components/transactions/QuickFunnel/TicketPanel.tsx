import { Minus, Plus, Trash2 } from 'lucide-react'
import {
  type FunnelState,
  FUNNEL_TYPE_META,
  lineGross,
  linesGross,
  discountValueFor,
  ticketNet,
  chargeTotal,
} from './funnelTypes'
import { money } from './funnelFormat'

type Props = {
  state: FunnelState
  onQty: (key: string, qty: number) => void
  onRemove: (key: string) => void
}

export function TicketPanel({ state, onQty, onRemove }: Props) {
  const isIncome = state.type === 'income'
  const cur = state.currency
  const discount = discountValueFor(state)
  const tip = state.tipEnabled ? Math.max(0, state.tipAmount) : 0
  const total = isIncome ? chargeTotal(state) : Math.round(Math.max(0, state.manualAmount))
  const accent = state.type === 'income' ? 'var(--color-success)' : state.type === 'transfer' ? 'var(--color-muted)' : 'var(--color-danger)'

  return (
    <aside
      className="flex flex-col"
      style={{
        width: '300px', flexShrink: 0, background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)',
        padding: '22px 20px', height: '100%',
      }}
    >
      <div style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: '14px' }}>
        Ticket {state.type ? `· ${FUNNEL_TYPE_META[state.type].label}` : ''}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ marginBottom: '14px' }}>
        {isIncome ? (
          state.lines.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>Sin ítems todavía.</p>
          ) : (
            <div className="space-y-2.5">
              {state.lines.map(line => (
                <div key={line.key} style={{ borderBottom: '1px dashed var(--color-border)', paddingBottom: '10px' }}>
                  <div className="flex items-start justify-between gap-2">
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.3 }}>{line.name}</span>
                    <button type="button" onClick={() => onRemove(line.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: '2px' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between" style={{ marginTop: '6px' }}>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => onQty(line.key, Math.max(1, line.qty - 1))} style={qtyBtn}><Minus size={12} /></button>
                      <span style={{ minWidth: '20px', textAlign: 'center', fontSize: '0.8125rem', fontWeight: 600 }} className="tabular-nums">{line.qty}</span>
                      <button type="button" onClick={() => onQty(line.key, line.qty + 1)} style={qtyBtn}><Plus size={12} /></button>
                    </div>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text)' }} className="tabular-nums">{money(lineGross(line), cur)}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-1.5">
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>{state.concept || 'Sin concepto'}</div>
          </div>
        )}
      </div>

      <div className="space-y-1.5" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
        {isIncome && (
          <>
            <Row label="Subtotal" value={money(linesGross(state.lines), cur)} muted />
            {discount > 0 && <Row label="Descuento" value={`− ${money(discount, cur)}`} color="var(--color-danger)" />}
            {state.anticipoAmount > 0 && <Row label="Anticipo" value={`− ${money(Math.min(state.anticipoAmount, ticketNet(state)), cur)}`} color="var(--color-success)" />}
            {tip > 0 && <Row label="Propina" value={`+ ${money(tip, cur)}`} muted />}
          </>
        )}
        <div className="flex items-baseline justify-between" style={{ paddingTop: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
            {isIncome ? 'A cobrar' : 'Total'}
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 700, color: accent, letterSpacing: '-0.02em' }} className="tabular-nums">
            {money(total, cur)}
          </span>
        </div>
      </div>
    </aside>
  )
}

function Row({ label, value, muted, color }: { label: string; value: string; muted?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>{label}</span>
      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: color ?? (muted ? 'var(--color-muted)' : 'var(--color-text)') }} className="tabular-nums">{value}</span>
    </div>
  )
}

const qtyBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px',
  borderRadius: '7px', border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text)', cursor: 'pointer',
}
