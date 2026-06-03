import { ArrowDownLeft, ArrowUpRight, Factory, ArrowLeftRight } from 'lucide-react'
import type { FunnelType } from './funnelTypes'

const TYPES: { key: FunnelType; label: string; desc: string; icon: typeof ArrowDownLeft; accent: string }[] = [
  { key: 'income', label: 'Ingreso', desc: 'Servicios y productos', icon: ArrowDownLeft, accent: '#10B981' },
  { key: 'expense', label: 'Gasto', desc: 'Salida operativa', icon: ArrowUpRight, accent: '#EF4444' },
  { key: 'cost', label: 'Costo', desc: 'Insumos directos', icon: Factory, accent: '#F59E0B' },
  { key: 'transfer', label: 'Movimiento', desc: 'Entre cajas', icon: ArrowLeftRight, accent: '#6366F1' },
]

export function StepType({ value, onPick }: { value: FunnelType | null; onPick: (t: FunnelType) => void }) {
  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight: '64vh' }}>
      <div style={{ textAlign: 'center', marginBottom: '34px' }}>
        <div style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: '8px' }}>
          Paso 1 de 6
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--color-text)' }}>
          ¿Qué vas a registrar?
        </h2>
      </div>

      <div
        className="grid grid-cols-2 gap-4"
        style={{ width: '100%', maxWidth: '680px' }}
      >
        {TYPES.map((t, i) => {
          const Icon = t.icon
          const selected = value === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onPick(t.key)}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '14px',
                aspectRatio: '1 / 0.72',
                padding: '24px',
                borderRadius: '22px',
                border: selected ? `3px solid ${t.accent}` : '2px solid var(--color-border)',
                background: selected ? `color-mix(in srgb, ${t.accent} 12%, var(--color-surface))` : 'var(--color-surface)',
                cursor: 'pointer',
                boxShadow: selected ? `0 18px 40px -20px ${t.accent}` : '0 2px 8px rgba(15,17,23,0.05)',
                transition: 'transform 0.12s, box-shadow 0.12s, border-color 0.12s, background 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; if (!selected) e.currentTarget.style.borderColor = t.accent }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; if (!selected) e.currentTarget.style.borderColor = 'var(--color-border)' }}
            >
              <kbd
                style={{
                  position: 'absolute', top: '14px', right: '16px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '26px', height: '26px', borderRadius: '8px',
                  border: '1.5px solid var(--color-border)', fontSize: '0.8125rem', fontWeight: 700,
                  color: 'var(--color-muted)', fontFamily: 'inherit',
                }}
              >
                {i + 1}
              </kbd>
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '68px', height: '68px', borderRadius: '20px', background: t.accent, color: '#fff',
                  boxShadow: `0 10px 22px -10px ${t.accent}`,
                }}
              >
                <Icon size={34} strokeWidth={2.4} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
                  {t.label}
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginTop: '2px' }}>{t.desc}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
