import { useState } from 'react'
import { Layers, ShoppingCart } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Table } from '@/components/ui/Table'
import { useProducts } from '@/hooks/useProducts'
import { LotDrawer } from './LotDrawer'
import { SaleForm } from './SaleForm'
import type { Product } from '@/types'

function stockVariant(product: Product): 'success' | 'warning' | 'danger' {
  const stock = product.stock ?? 0
  if (stock === 0) return 'danger'
  if (stock < product.min_stock) return 'warning'
  return 'success'
}

function stockLabel(product: Product): string {
  const stock = product.stock ?? 0
  if (stock === 0) return 'Sin stock'
  if (stock < product.min_stock) return 'Stock bajo'
  return 'OK'
}

export function InventoryPage() {
  const [lotProductId, setLotProductId] = useState<string | null>(null)
  const [saleOpen, setSaleOpen] = useState(false)

  const { data: products = [], isLoading } = useProducts()

  const columns = [
    {
      key: 'name',
      header: 'Producto',
      render: (p: Product) => (
        <div>
          <p className="font-medium text-[var(--color-text)]">{p.name}</p>
          <p className="text-xs text-[var(--color-muted)]">{p.sku}</p>
        </div>
      ),
    },
    {
      key: 'unit',
      header: 'Unidad',
      render: (p: Product) => (
        <span className="text-[var(--color-muted)]">{p.unit || '—'}</span>
      ),
    },
    {
      key: 'sale_price',
      header: 'Precio venta',
      className: 'text-right',
      render: (p: Product) => (
        <span className="tabular-nums font-medium">
          ${Number(p.sale_price).toLocaleString('es-CO')}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Stock actual',
      className: 'text-right',
      render: (p: Product) => (
        <span className="tabular-nums">{(p.stock ?? 0).toLocaleString('es-CO')}</span>
      ),
    },
    {
      key: 'min_stock',
      header: 'Stock mín.',
      className: 'text-right',
      render: (p: Product) => (
        <span className="tabular-nums text-[var(--color-muted)]">
          {Number(p.min_stock).toLocaleString('es-CO')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (p: Product) => (
        <Badge variant={stockVariant(p)}>{stockLabel(p)}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      render: (p: Product) => (
        <button
          onClick={() => setLotProductId(p.id)}
          className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
          title="Ver lotes"
        >
          <Layers size={14} />
        </button>
      ),
    },
  ]

  const selectedProduct = products.find(p => p.id === lotProductId) ?? null

  return (
    <div className="animate-fade-in">
      <TopBar
        title="Inventario"
        subtitle={`${products.length} productos`}
        actions={
          <Button onClick={() => setSaleOpen(true)} size="sm">
            <ShoppingCart size={14} />
            Nueva venta
          </Button>
        }
      />

      <div className="p-6">
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
          <Table
            columns={columns}
            data={products}
            keyField="id"
            loading={isLoading}
            emptyMessage="No hay productos registrados"
          />
        </div>
      </div>

      <LotDrawer
        product={selectedProduct}
        onClose={() => setLotProductId(null)}
      />
      <SaleForm
        open={saleOpen}
        onClose={() => setSaleOpen(false)}
        products={products}
      />
    </div>
  )
}
