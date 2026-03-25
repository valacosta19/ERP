import { useState } from 'react'
import { Layers, Pencil } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/Badge'
import { Table } from '@/components/ui/Table'
import { InlineEditCell } from '@/components/ui/InlineEditCell'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useProducts, useUpdateProduct } from '@/hooks/useProducts'
import { LotDrawer } from './LotDrawer'
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

type EditForm = { name: string; sku: string; brand: string; unit: string; sale_price: string; min_stock: string; unit_size: string }

export function InventoryPage() {
  const [lotProductId, setLotProductId] = useState<string | null>(null)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ name: '', sku: '', brand: '', unit: '', sale_price: '', min_stock: '', unit_size: '' })
  const [brandFilter, setBrandFilter] = useState<string>('')
  const [stockFilter, setStockFilter] = useState<'all' | 'with' | 'without'>('all')

  const { data: products = [], isLoading } = useProducts()
  const updateProduct = useUpdateProduct()

  const brands = Array.from(new Set(products.map(p => p.brand).filter(Boolean) as string[])).sort()

  const filteredProducts = products.filter(p => {
    if (brandFilter && p.brand !== brandFilter) return false
    if (stockFilter === 'with' && (p.stock ?? 0) === 0) return false
    if (stockFilter === 'without' && (p.stock ?? 0) > 0) return false
    return true
  })

  async function saveProductField(p: Product, field: 'name' | 'sale_price', value: string) {
    await updateProduct.mutateAsync({
      id: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      brand: p.brand,
      sale_price: p.sale_price,
      min_stock: p.min_stock,
      [field]: field === 'sale_price' ? Number(value) : value,
    })
  }

  function openEdit(p: Product) {
    setEditProduct(p)
    setEditForm({
      name: p.name,
      sku: p.sku,
      brand: p.brand ?? '',
      unit: p.unit ?? '',
      sale_price: String(p.sale_price),
      min_stock: String(p.min_stock),
      unit_size: p.unit_size != null ? String(p.unit_size) : '',
    })
  }

  async function handleSaveEdit() {
    if (!editProduct) return
    await updateProduct.mutateAsync({
      id: editProduct.id,
      name: editForm.name,
      sku: editForm.sku,
      brand: editForm.brand || null,
      unit: editForm.unit || null,
      sale_price: Number(editForm.sale_price) || 0,
      min_stock: Number(editForm.min_stock) || 0,
      unit_size: editForm.unit_size !== '' ? Number(editForm.unit_size) : null,
    })
    setEditProduct(null)
  }

  const columns = [
    {
      key: 'name',
      header: 'Producto',
      render: (p: Product) => (
        <div>
          <InlineEditCell
            value={p.name}
            onSave={v => saveProductField(p, 'name', v)}
            className="font-medium text-[var(--color-text)]"
          />
          <p className="text-xs text-[var(--color-muted)]">{p.sku}</p>
        </div>
      ),
    },
    {
      key: 'brand',
      header: 'Marca',
      render: (p: Product) => (
        <span className="text-[var(--color-muted)]">{p.brand || '—'}</span>
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
      key: 'cost_range',
      header: 'Precio compra',
      className: 'text-right',
      render: (p: Product) => {
        if (p.min_cost == null) return <span className="text-[var(--color-muted)]">—</span>
        if (p.min_cost === p.max_cost) return <span className="tabular-nums">${p.min_cost!.toLocaleString('es-CO')}</span>
        return <span className="tabular-nums">${p.min_cost!.toLocaleString('es-CO')} – ${p.max_cost!.toLocaleString('es-CO')}</span>
      },
    },
    {
      key: 'sale_price',
      header: 'Precio venta',
      className: 'text-right',
      render: (p: Product) => (
        <InlineEditCell
          value={String(p.sale_price)}
          displayValue={`$${p.sale_price.toLocaleString('es-CO')}`}
          onSave={v => saveProductField(p, 'sale_price', v)}
          type="number"
          className="tabular-nums font-medium text-right"
        />
      ),
    },
    {
      key: 'stock',
      header: 'Stock actual',
      className: 'text-right',
      render: (p: Product) => (
        <button
          onClick={() => setLotProductId(p.id)}
          className="tabular-nums underline decoration-dotted underline-offset-2 text-[var(--color-text)] hover:text-[var(--color-accent)] transition-colors cursor-pointer"
          title="Editar stock en lotes"
        >
          {(p.stock ?? 0).toLocaleString('es-CO')}
        </button>
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
      className: 'w-20',
      render: (p: Product) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={() => openEdit(p)}
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
            title="Editar producto"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => setLotProductId(p.id)}
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
            title="Ver lotes"
          >
            <Layers size={14} />
          </button>
        </div>
      ),
    },
  ]

  const selectedProduct = products.find(p => p.id === lotProductId) ?? null

  return (
    <div className="animate-fade-in flex-1 min-h-0 flex flex-col">
      <TopBar
        title="Inventario"
        subtitle={`${filteredProducts.length} productos`}
      />

      <div className="flex-1 min-h-0 flex flex-col p-6 gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={brandFilter}
            onChange={e => setBrandFilter(e.target.value)}
            className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] px-3 text-sm"
          >
            <option value="">Todas las marcas</option>
            {brands.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select
            value={stockFilter}
            onChange={e => setStockFilter(e.target.value as 'all' | 'with' | 'without')}
            className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] px-3 text-sm"
          >
            <option value="all">Todo el stock</option>
            <option value="with">Con stock</option>
            <option value="without">Sin stock</option>
          </select>
        </div>
        <div className="flex-1 min-h-0 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
          <Table
            columns={columns}
            data={filteredProducts}
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

      <Modal open={!!editProduct} onClose={() => setEditProduct(null)} title="Editar producto">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            <Input label="SKU" value={editForm.sku} onChange={e => setEditForm(f => ({ ...f, sku: e.target.value }))} />
          </div>
          <Input label="Marca" value={editForm.brand} onChange={e => setEditForm(f => ({ ...f, brand: e.target.value }))} placeholder="Opcional" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Unidad" value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} placeholder="ml, oz, u…" />
            <Input label="Tamaño por unidad (g o ml)" type="number" value={editForm.unit_size} onChange={e => setEditForm(f => ({ ...f, unit_size: e.target.value }))} placeholder="Opcional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Precio venta" type="number" value={editForm.sale_price} onChange={e => setEditForm(f => ({ ...f, sale_price: e.target.value }))} prefix="$" />
            <Input label="Stock mínimo" type="number" value={editForm.min_stock} onChange={e => setEditForm(f => ({ ...f, min_stock: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditProduct(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} loading={updateProduct.isPending}>Guardar cambios</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
