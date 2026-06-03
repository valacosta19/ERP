import { useMemo, useState } from 'react'
import { Search, Star, Plus, Scissors, Package } from 'lucide-react'
import type { CatalogItem, Product } from '@/types'
import { StepHeading } from './funnelAtoms'
import { money } from './funnelFormat'
import { topFrequentIds } from './frequents'

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

  const frequents = useMemo(() => {
    if (mode === 'services') {
      return topFrequentIds(catalogItems.map(c => `s:${c.id}`), 5)
        .map(k => catalogItems.find(c => `s:${c.id}` === k))
        .filter(Boolean) as CatalogItem[]
    }
    return topFrequentIds(products.map(p => `p:${p.id}`), 5)
      .map(k => products.find(p => `p:${p.id}` === k))
      .filter(Boolean) as Product[]
  }, [mode, catalogItems, products])

  const filteredServices = catalogItems.filter(c => !q || c.name.toLowerCase().includes(q))
  const filteredProducts = products.filter(p => !q || productLabel(p).toLowerCase().includes(q))

  return (
    <div>
      <StepHeading kicker="Paso 2 — Detalle" title="¿Qué cobrás?" />

      <div className="grid grid-cols-2 gap-3" style={{ maxWidth: '520px', marginBottom: '20px' }}>
        <ModeButton
          active={mode === 'services'}
          icon={<Scissors size={22} strokeWidth={2.4} />}
          label="Servicios"
          count={catalogItems.length}
          accent="#10B981"
          onClick={() => setMode('services')}
        />
        <ModeButton
          active={mode === 'products'}
          icon={<Package size={22} strokeWidth={2.4} />}
          label="Productos"
          count={products.length}
          accent="#6366F1"
          onClick={() => setMode('products')}
        />
      </div>

      <div style={{ position: 'relative', marginBottom: '16px', maxWidth: '420px' }}>
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

      {frequents.length > 0 && !q && (
        <div style={{ marginBottom: '18px' }}>
          <div className="flex items-center gap-1.5" style={{ marginBottom: '8px' }}>
            <Star size={13} style={{ color: 'var(--color-warning)' }} fill="var(--color-warning)" />
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
              Frecuentes
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {frequents.map(f => {
              const isService = 'price' in f
              return (
                <button
                  key={isService ? `s:${(f as CatalogItem).id}` : `p:${(f as Product).id}`}
                  type="button"
                  onClick={() => isService ? onAddService(f as CatalogItem) : onAddProduct(f as Product)}
                  className="flex items-center gap-2"
                  style={{
                    padding: '10px 16px', borderRadius: '999px', border: '1.5px solid var(--color-warning)',
                    background: 'var(--color-warning-light)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)',
                  }}
                >
                  {isService ? (f as CatalogItem).name : (f as Product).name}
                  <span style={{ color: 'var(--color-muted)', fontWeight: 500 }}>
                    {money(isService ? (f as CatalogItem).price : (f as Product).sale_price ?? 0)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3" style={{ maxHeight: '44vh', overflowY: 'auto', paddingRight: '4px', paddingBottom: '4px' }}>
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

function ModeButton({ active, icon, label, count, accent, onClick }: { active: boolean; icon: React.ReactNode; label: string; count: number; accent: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3"
      style={{
        padding: '16px 20px', borderRadius: '16px', cursor: 'pointer', textAlign: 'left',
        border: active ? `2.5px solid ${accent}` : '2px solid var(--color-border)',
        background: active ? `color-mix(in srgb, ${accent} 12%, var(--color-surface))` : 'var(--color-surface)',
        boxShadow: active ? `0 10px 26px -16px ${accent}` : 'none',
        transition: 'border-color 0.12s, background 0.12s',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '46px', height: '46px', borderRadius: '13px', background: active ? accent : 'var(--color-bg)', color: active ? '#fff' : accent, flexShrink: 0 }}>
        {icon}
      </span>
      <span>
        <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-text)' }}>{label}</span>
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>{count} disponibles</span>
      </span>
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
