import type { ReactNode } from 'react'

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--color-muted)',
      }}
    >
      {children}
    </span>
  )
}

export function StepHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: '6px' }}>
        {kicker}
      </div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
        {title}
      </h2>
    </div>
  )
}

export function Stepper({ steps, current }: { steps: { key: string; label: string }[]; current: string }) {
  const idx = steps.findIndex(s => s.key === current)
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => {
        const done = i < idx
        const active = i === idx
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <div
              className="flex items-center gap-2"
              style={{
                padding: '5px 12px',
                borderRadius: '999px',
                background: active ? 'var(--color-accent)' : done ? 'var(--color-accent-light)' : 'transparent',
                border: active ? 'none' : `1px solid ${done ? 'transparent' : 'var(--color-border)'}`,
                transition: 'all 0.2s',
              }}
            >
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  color: active ? '#fff' : done ? 'var(--color-accent)' : 'var(--color-muted)',
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: active ? '#fff' : done ? 'var(--color-accent)' : 'var(--color-muted)',
                  letterSpacing: '0.01em',
                }}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: '14px', height: '1.5px', background: 'var(--color-border)' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
