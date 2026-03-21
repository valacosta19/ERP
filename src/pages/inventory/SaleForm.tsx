import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useCategories } from '@/hooks/useCategories'
import { useCreateSale } from '@/hooks/useSales'
import type { Product } from '@/types'

interface CartItem {
  product_id: string
  product_name: string
  unit: string | null
  quantity: string
  unit_sale_price: string
}

interface SaleFormProps {
  open: boolean
  onClose: () => void
  products: Product[]
}

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  category_id: '',
  description: '',
}

export function SaleForm({ open, onClose, products }: SaleFormProps) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [formError, setFormError] = useState('')

  const { data: categories = [] } = useCategories()
  const createSale = useCreateSale()

  const categoryOptions = [
    { value: '', label: 'Sin categoría' },
    ...categories.map(c => ({ value: c.id, label: c.name })),
  ]

  const productOptions = [
    { value: '', label: 'Seleccionar producto...' },
    ...products
      .filter(p => !cartItems.some(item => item.product_id === p.id))
      .map(p => ({ value: p.id, label: `${p.name} (stock: ${p.stock ?? 0})` })),
  ]

  function addToCart() {
    if (!selectedProductId) return
    const product = products.find(p => p.id === selectedProductId)
    if (!product) return
    setCartItems(prev => [
      ...prev,
      {
        product_id: product.id,
        product_name: product.name,
        unit: product.unit,
        quantity: '1',
        unit_sale_price: String(product.sale_price),
      },
    ])
    setSelectedProductId('')
  }

  function updateItem(index: number, field: 'quantity' | 'unit_sale_price', value: string) {
    setCartItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function removeItem(index: number) {
    setCartItems(prev => prev.filter((_, i) => i !== index))
  }

  function handleClose() {
    setForm(EMPTY_FORM)
    setCartItems([])
    setSelectedProductId('')
    setFormError('')
    onClose()
  }

  const total = cartItems.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_sale_price) || 0)
  }, 0)

  async function handleSubmit() {
    if (!form.date) {
      setFormError('La fecha es obligatoria.')
      return
    }
    if (cartItems.length === 0) {
      setFormError('Agrega al menos un producto.')
      return
    }
    for (const item of cartItems) {
      const qty = parseFloat(item.quantity)
      const price = parseFloat(item.unit_sale_price)
      if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
        setFormError('Cantidad y precio deben ser mayores a cero.')
        return
      }
    }
    setFormError('')

    try {
      await createSale.mutateAsync({
        date: form.date,
        category_id: form.category_id || null,
        description: form.description || null,
        items: cartItems.map(item => ({
          product_id: item.product_id,
          quantity: parseFloat(item.quantity),
          unit_sale_price: parseFloat(item.unit_sale_price),
        })),
      })
      handleClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al registrar la venta.')
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Nueva venta" size="xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Fecha"
            type="date"
            value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          />
          <Select
            label="Categoría"
            options={categoryOptions}
            value={form.category_id}
            onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
          />
        </div>
        <Input
          label="Descripción"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Opcional"
        />

        <div className="border-t border-[var(--color-border)] pt-4">
          <p className="text-sm font-medium text-[var(--color-text)] mb-2">Productos</p>
          <div className="flex gap-2">
            <Select
              options={productOptions}
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              className="flex-1"
            />
            <Button variant="secondary" size="sm" onClick={addToCart} disabled={!selectedProductId}>
              <Plus size={14} />
              Agregar
            </Button>
          </div>

          {cartItems.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="text-left pb-2 font-medium text-[var(--color-muted)]">Producto</th>
                    <th className="text-right pb-2 font-medium text-[var(--color-muted)] w-28">Cantidad</th>
                    <th className="text-right pb-2 font-medium text-[var(--color-muted)] w-32">Precio unit.</th>
                    <th className="text-right pb-2 font-medium text-[var(--color-muted)] w-28">Subtotal</th>
                    <th className="pb-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {cartItems.map((item, index) => {
                    const qty = parseFloat(item.quantity) || 0
                    const price = parseFloat(item.unit_sale_price) || 0
                    return (
                      <tr key={item.product_id} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="py-2 pr-2">
                          <p className="font-medium text-[var(--color-text)]">{item.product_name}</p>
                          {item.unit && <p className="text-xs text-[var(--color-muted)]">{item.unit}</p>}
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={item.quantity}
                            onChange={e => updateItem(index, 'quantity', e.target.value)}
                            className="w-full text-right bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)]"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)] text-sm pointer-events-none">$</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unit_sale_price}
                              onChange={e => updateItem(index, 'unit_sale_price', e.target.value)}
                              className="w-full text-right bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-5 pr-2 py-1 text-sm outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)]"
                            />
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums font-medium">
                          ${(qty * price).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() => removeItem(index)}
                            className="p-1 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="pt-3 text-sm font-semibold text-[var(--color-text)]">Total</td>
                    <td className="pt-3 text-right tabular-nums font-bold text-[var(--color-success)]">
                      ${total.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {formError && <p className="text-xs text-[var(--color-danger)]">{formError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={createSale.isPending}>
            Registrar venta
          </Button>
        </div>
      </div>
    </Modal>
  )
}
