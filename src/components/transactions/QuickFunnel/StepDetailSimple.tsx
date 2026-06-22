import { useMemo } from 'react'
import { Package, Scissors } from 'lucide-react'
import type { TransactionCategory, Product } from '@/types'
import type { FunnelType } from './funnelTypes'
import { FUNNEL_TYPE_META } from './funnelTypes'
import { StepHeading, SectionLabel } from './funnelAtoms'
import { funnelInput } from './funnelFormat'

type Props = {
  type: Exclude<FunnelType, 'income'>
  subcategories: TransactionCategory[]
  subcategoryId: string
  concept: string
  products: Product[]
  selectedProductId: string | null
  selectedProductQty: number
  onSubcategory: (id: string) => void
  onConcept: (v: string) => void
  onProduct: (productId: string | null) => void
  onProductQty: (qty: number) => void
}

export function StepDetailSimple({
  type, subcategories, subcategoryId, concept, products,
  selectedProductId, selectedProductQty,
  onSubcategory, onConcept, onProduct, onProductQty,
}: Props) {
  const label = FUNNEL_TYPE_META[type].label

  const selectedSubcat = useMemo(
    () => subcategories.find(c => c.id === subcategoryId) ?? null,
    [subcategories, subcategoryId],
  )

  const productOptions = useMemo(
    () => products
      .filter(p => (p.stock ?? 0) > 0)
      .map(p => ({
        value: p.id,
        label: `${p.name}${p.brand ? ` · ${p.brand}` : ''} (${(p.stock ?? 0).toLocaleString('es-CO')} ${p.unit ?? 'u'})`,
        unit: p.unit ?? null,
      })),
    [products],
  )

  const selectedProduct = useMemo(
    () => products.find(p => p.id === selectedProductId) ?? null,
    [products, selectedProductId],
  )

  const showProductPicker = selectedSubcat?.deducts_inventory === true

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
              onClick={() => {
                onSubcategory(c.id)
                if (!c.deducts_inventory) onProduct(null)
              }}
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

      {showProductPicker && (
        <div style={{ marginBottom: '22px', padding: '16px', borderRadius: '12px', background: 'var(--color-bg)', border: '1.5px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Package size={15} style={{ color: 'var(--color-accent)' }} />
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
              Producto a descontar del inventario
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '6px' }}>
                Producto
              </label>
              <select
                value={selectedProductId ?? ''}
                onChange={e => onProduct(e.target.value || null)}
                style={{ ...funnelInput, height: '38px' }}
              >
                <option value="">Seleccionar...</option>
                {productOptions.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '6px' }}>
                Cantidad{selectedProduct?.unit ? ` (${selectedProduct.unit})` : ''}
              </label>
              <input
                type="number"
                value={selectedProductQty}
                onChange={e => onProductQty(Math.max(0.01, Number(e.target.value) || 1))}
                min="0.01"
                step="0.01"
                style={{ ...funnelInput, height: '38px' }}
              />
            </div>
          </div>
          {!selectedProductId && (
            <p style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--color-warning)', fontWeight: 500 }}>
              Esta categoría descuenta inventario — seleccioná el producto.
            </p>
          )}
        </div>
      )}

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
