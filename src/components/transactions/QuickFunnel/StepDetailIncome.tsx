import { useState } from 'react'
import { Search, Plus, Scissors, Package } from 'lucide-react'
import type { CatalogItem, Product } from '@/types'
import { StepHeading } from './funnelAtoms'
import { money } from './funnelFormat'

type Mode = 'services' | 'products'

type Props = {
  catalogItems: CatalogItem[]
  products: Product[]
  cartCount: number
  onAddService: (item: CatalogItem) => void
  onAddProduct: (product: Product) => void
  productLabel: (p: Product) => string
}

export function StepDetailIncome({ catalogItems, products, cartCount, onAddService, onAddProduct, productLabel }: Props) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<Mode>('services')
  const q = query.trim().toLowerCase()

  const filteredServices = catalogItems.filter(c => !q || c.name.toLowerCase().includes(q))
  const filteredProducts = products.filter(p => !q || productLabel(p).toLowerCase().includes(q))

  return (
    <div>
      <StepHeading kicker="Paso 2 — Detalle" title="¿Qué cobrás?" />

      <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: '16px' }}>
        <div className="flex items-center gap-1" style={{ padding: '4px', borderRadius: '12px', background: 'var(--color-bg)', border: '1.5px solid var(--color-border)' }}>
          <ModeTab
            active={mode === 'services'}
            icon={<Scissors size={16} strokeWidth={2.4} />}
            label="Servicios"
            count={catalogItems.length}
            accent="#10B981"
            onClick={() => setMode('services')}
          />
          <ModeTab
            active={mode === 'products'}
            icon={<Package size={16} strokeWidth={2.4} />}
            label="Productos"
            count={products.length}
            accent="#6366F1"
            onClick={() => setMode('products')}
          />
        </div>

        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: '420px' }}>
          <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar (opcional)"
            style={{
              background: 'var(--color-bg)', border: '1.5px solid var(--color-border)', borderRadius: '12px',
              padding: '10px 14px 10px 40px', fontSize: '0.9375rem', width: '100%', outline: 'none', color: 'var(--color-text)',
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3" style={{ maxHeight: '58vh', overflowY: 'auto', paddingRight: '4px', paddingBottom: '4px' }}>
        {mode === 'services' && filteredServices.map(item => (
          <ItemTile key={item.id} title={item.name} price={money(item.price)} accent="#10B981" onClick={() => onAddService(item)} />
        ))}
        {mode === 'products' && filteredProducts.map(p => {
          const noStock = (p.stock ?? 0) <= 0
          return (
            <ItemTile
              key={p.id}
              title={productLabel(p)}
              price={money(p.sale_price ?? 0)}
              accent="#6366F1"
              badge={noStock ? 'sin stock' : `${p.stock} en stock`}
              badgeWarn={noStock}
              onClick={() => onAddProduct(p)}
            />
          )
        })}
        {((mode === 'services' && filteredServices.length === 0) || (mode === 'products' && filteredProducts.length === 0)) && (
          <p style={{ gridColumn: '1 / -1', fontSize: '0.875rem', color: 'var(--color-muted)' }}>Sin resultados.</p>
        )}
      </div>

      {cartCount === 0 && (
        <p style={{ marginTop: '14px', fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
          Tocá un ítem para agregarlo al ticket. Podés sumar servicios y productos.
        </p>
      )}
    </div>
  )
}

function ModeTab({ active, icon, label, count, accent, onClick }: { active: boolean; icon: React.ReactNode; label: string; count: number; accent: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2"
      style={{
        padding: '8px 14px', borderRadius: '9px', cursor: 'pointer',
        border: 'none', background: active ? 'var(--color-surface)' : 'transparent',
        boxShadow: active ? '0 2px 8px -4px rgba(0,0,0,0.25)' : 'none',
        color: active ? 'var(--color-text)' : 'var(--color-muted)',
        fontWeight: 600, fontSize: '0.9375rem', transition: 'background 0.12s, color 0.12s',
      }}
    >
      <span style={{ color: active ? accent : 'var(--color-muted)', display: 'flex' }}>{icon}</span>
      {label}
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: active ? accent : 'var(--color-muted)' }}>{count}</span>
    </button>
  )
}

function ItemTile({ title, price, accent, badge, badgeWarn, onClick }: { title: string; price: string; accent: string; badge?: string; badgeWarn?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group"
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px',
        textAlign: 'left', padding: '15px', minHeight: '104px', borderRadius: '16px',
        border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer',
        transition: 'border-color 0.12s, transform 0.12s, box-shadow 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 12px 26px -18px ${accent}` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div className="flex items-start justify-between">
        <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.25 }}>{title}</span>
        <span
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '9px', background: accent, color: '#fff', flexShrink: 0 }}
        >
          <Plus size={15} strokeWidth={2.6} />
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700, color: accent }}>{price}</span>
        {badge && <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: badgeWarn ? 'var(--color-warning)' : 'var(--color-muted)' }}>{badge}</span>}
      </div>
    </button>
  )
}
