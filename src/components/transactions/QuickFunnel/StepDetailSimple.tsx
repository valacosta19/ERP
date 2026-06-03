import { Scissors } from 'lucide-react'
import type { TransactionCategory } from '@/types'
import type { FunnelType } from './funnelTypes'
import { FUNNEL_TYPE_META } from './funnelTypes'
import { StepHeading, SectionLabel } from './funnelAtoms'
import { funnelInput } from './funnelFormat'

type Props = {
  type: Exclude<FunnelType, 'income'>
  subcategories: TransactionCategory[]
  subcategoryId: string
  concept: string
  onSubcategory: (id: string) => void
  onConcept: (v: string) => void
}

export function StepDetailSimple({ type, subcategories, subcategoryId, concept, onSubcategory, onConcept }: Props) {
  const label = FUNNEL_TYPE_META[type].label
  return (
    <div>
      <StepHeading kicker={`Paso 2 — ${label}`} title="Elegí la categoría" />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5" style={{ marginBottom: '22px', maxHeight: '40vh', overflowY: 'auto' }}>
        {subcategories.length === 0 && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', gridColumn: '1 / -1' }}>
            No hay subcategorías configuradas para {label}. Agregalas en Ajustes.
          </p>
        )}
        {subcategories.map(c => {
          const selected = subcategoryId === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSubcategory(c.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                padding: '14px 16px', minHeight: '58px', borderRadius: '13px',
                border: selected ? '2px solid var(--color-accent)' : '1.5px solid var(--color-border)',
                background: selected ? 'var(--color-accent-light)' : 'var(--color-surface)',
                cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)',
                transition: 'border-color 0.12s',
              }}
              onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--color-accent)' }}
              onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--color-border)' }}
            >
              {c.deducts_inventory && <Scissors size={14} style={{ color: 'var(--color-muted)' }} />}
              {c.name}
            </button>
          )
        })}
      </div>

      <div>
        <SectionLabel>Concepto (opcional)</SectionLabel>
        <input
          value={concept}
          onChange={e => onConcept(e.target.value)}
          placeholder="Detalle breve, ej. Compra de agua"
          style={{ ...funnelInput, marginTop: '8px' }}
        />
      </div>
    </div>
  )
}
