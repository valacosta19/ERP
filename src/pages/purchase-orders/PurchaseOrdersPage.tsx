import { useState } from 'react'
import { Plus, Trash2, PackageCheck, Ban, ChevronDown, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/formatDate'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { usePurchaseOrders, useCreatePurchaseOrder, useCancelPurchaseOrder, useReceivePurchaseOrder } from '@/hooks/usePurchaseOrders'
import { useSuppliers } from '@/hooks/useSuppliers'
import { useProducts } from '@/hooks/useProducts'
import type { PurchaseOrder, PurchaseOrderItem } from '@/types'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  received: 'Recibido',
  cancelled: 'Cancelado',
}

const STATUS_VARIANTS: Record<string, 'warning' | 'success' | 'danger' | 'default'> = {
  draft: 'warning',
  received: 'success',
  cancelled: 'danger',
}


function formatCurrency(amount: number) {
  return `$${amount.toLocaleString('es-CO')}`
}

function calcPOTotal(items: PurchaseOrderItem[]) {
  return items.reduce((acc, i) => acc + i.quantity * i.unit_cost, 0)
}

interface LineItem {
  product_id: string
  quantity: string
  unit_cost: string
}

const EMPTY_LINE: LineItem = { product_id: '', quantity: '', unit_cost: '' }

export function PurchaseOrdersPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [form, setForm] = useState({ supplier_id: '', order_date: new Date().toISOString().slice(0, 10) })
  const [lines, setLines] = useState<LineItem[]>([{ ...EMPTY_LINE }])
  const [formError, setFormError] = useState('')

  const { data: orders = [], isLoading } = usePurchaseOrders()
  const { data: suppliers = [] } = useSuppliers()
  const { data: products = [] } = useProducts()
  const createPO = useCreatePurchaseOrder()
  const cancelPO = useCancelPurchaseOrder()
  const receivePO = useReceivePurchaseOrder()

  const supplierOptions = [
    { value: '', label: 'Sin proveedor' },
    ...suppliers.map(s => ({ value: s.id, label: s.name })),
  ]

  const productOptions = [
    { value: '', label: 'Seleccionar producto' },
    ...products.map(p => ({ value: p.id, label: `${p.name} (${p.sku})` })),
  ]

  function addLine() {
    setLines(l => [...l, { ...EMPTY_LINE }])
  }

  function removeLine(index: number) {
    setLines(l => l.filter((_, i) => i !== index))
  }

  function updateLine(index: number, field: keyof LineItem, value: string) {
    setLines(l => l.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function openCreate() {
    setForm({ supplier_id: '', order_date: new Date().toISOString().slice(0, 10) })
    setLines([{ ...EMPTY_LINE }])
    setFormError('')
    setCreateOpen(true)
  }

  async function handleCreateSubmit() {
    const validLines = lines.filter(l => l.product_id && l.quantity && l.unit_cost)
    if (validLines.length === 0) {
      setFormError('Agrega al menos un ítem con producto, cantidad y costo.')
      return
    }
    for (const l of validLines) {
      if (parseFloat(l.quantity) <= 0 || parseFloat(l.unit_cost) < 0) {
        setFormError('Cantidad debe ser mayor a 0 y costo no puede ser negativo.')
        return
      }
    }

    await createPO.mutateAsync({
      supplier_id: form.supplier_id || null,
      order_date: form.order_date,
      items: validLines.map(l => ({
        product_id: l.product_id,
        quantity: parseFloat(l.quantity),
        unit_cost: parseFloat(l.unit_cost),
      })),
    })
    setCreateOpen(false)
  }

  function openReceive(po: PurchaseOrder) {
    setSelectedPO(po)
    setReceiveOpen(true)
  }

  async function handleReceive() {
    if (!selectedPO) return
    await receivePO.mutateAsync({ po: selectedPO })
    setReceiveOpen(false)
    setSelectedPO(null)
  }

  async function handleCancel(id: string) {
    if (!confirm('¿Cancelar este pedido?')) return
    await cancelPO.mutateAsync(id)
  }

  const columns = [
    {
      key: 'expand',
      header: '',
      className: 'w-8',
      render: (po: PurchaseOrder) => (
        <button
          onClick={() => setExpandedId(expandedId === po.id ? null : po.id)}
          className="p-1 text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          {expandedId === po.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      ),
    },
    {
      key: 'order_date',
      header: 'Fecha',
      render: (po: PurchaseOrder) => (
        <span className="text-[var(--color-muted)]">{formatDate(po.order_date)}</span>
      ),
    },
    {
      key: 'supplier',
      header: 'Proveedor',
      render: (po: PurchaseOrder) => (
        <span className="text-[var(--color-text)]">{po.supplier?.name || '—'}</span>
      ),
    },
    {
      key: 'items_count',
      header: 'Ítems',
      render: (po: PurchaseOrder) => (
        <span className="text-[var(--color-muted)] tabular-nums">{po.items?.length ?? 0}</span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      className: 'text-right',
      render: (po: PurchaseOrder) => (
        <span className="font-semibold tabular-nums text-[var(--color-text)]">
          {formatCurrency(calcPOTotal(po.items ?? []))}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (po: PurchaseOrder) => (
        <Badge variant={STATUS_VARIANTS[po.status] ?? 'default'}>
          {STATUS_LABELS[po.status] ?? po.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (po: PurchaseOrder) => (
        <div className="flex items-center gap-1 justify-end">
          {po.status === 'draft' && (
            <>
              <button
                onClick={() => openReceive(po)}
                title="Marcar como recibido"
                className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-success)] hover:bg-[var(--color-success-light,#f0fdf4)] transition-colors"
              >
                <PackageCheck size={14} />
              </button>
              <button
                onClick={() => handleCancel(po.id)}
                title="Cancelar pedido"
                className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
              >
                <Ban size={14} />
              </button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="animate-fade-in flex-1 min-h-0 flex flex-col">
      <TopBar
        title="Pedidos de Compra"
        subtitle={`${orders.length} registros`}
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus size={14} />
            Nuevo pedido
          </Button>
        }
      />

      <div className="flex-1 min-h-0 flex flex-col p-6">
        <div className="flex-1 min-h-0 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <span className="inline-block w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            <p className="text-center text-[var(--color-muted)] py-12 text-sm">No hay pedidos registrados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {columns.map(col => (
                      <th
                        key={col.key}
                        className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] ${col.className || ''}`}
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((po, i) => (
                    <>
                      <tr
                        key={po.id}
                        className={`border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors ${expandedId === po.id || i === orders.length - 1 ? 'border-b-0' : ''}`}
                      >
                        {columns.map(col => (
                          <td key={col.key} className={`px-4 py-3 text-[var(--color-text)] ${col.className || ''}`}>
                            {col.render(po)}
                          </td>
                        ))}
                      </tr>
                      {expandedId === po.id && (
                        <tr key={`${po.id}-items`} className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                          <td colSpan={columns.length} className="px-8 py-3">
                            {!po.items || po.items.length === 0 ? (
                              <p className="text-xs text-[var(--color-muted)]">Sin ítems</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-[var(--color-muted)]">
                                    <th className="text-left pb-1 font-medium">Producto</th>
                                    <th className="text-right pb-1 font-medium">Cantidad</th>
                                    <th className="text-right pb-1 font-medium">Costo unitario</th>
                                    <th className="text-right pb-1 font-medium">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {po.items.map(item => (
                                    <tr key={item.id} className="border-t border-[var(--color-border)]">
                                      <td className="py-1 text-[var(--color-text)]">{item.product?.name ?? item.product_id}</td>
                                      <td className="py-1 text-right tabular-nums text-[var(--color-muted)]">{item.quantity}</td>
                                      <td className="py-1 text-right tabular-nums text-[var(--color-muted)]">{formatCurrency(item.unit_cost)}</td>
                                      <td className="py-1 text-right tabular-nums font-medium text-[var(--color-text)]">{formatCurrency(item.quantity * item.unit_cost)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create PO Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo pedido de compra" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Proveedor"
              options={supplierOptions}
              value={form.supplier_id}
              onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
            />
            <Input
              label="Fecha del pedido"
              type="date"
              value={form.order_date}
              onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))}
            />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Ítems</p>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_100px_120px_32px] gap-2 items-end">
                  <Select
                    options={productOptions}
                    value={line.product_id}
                    onChange={e => updateLine(idx, 'product_id', e.target.value)}
                  />
                  <Input
                    type="number"
                    min="0.001"
                    step="0.001"
                    placeholder="Cantidad"
                    value={line.quantity}
                    onChange={e => updateLine(idx, 'quantity', e.target.value)}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Costo unit."
                    value={line.unit_cost}
                    onChange={e => updateLine(idx, 'unit_cost', e.target.value)}
                    prefix="$"
                  />
                  <button
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1}
                    className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] disabled:opacity-30 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addLine}
              className="mt-2 text-xs text-[var(--color-accent)] hover:underline"
            >
              + Agregar ítem
            </button>
          </div>

          {formError && <p className="text-xs text-[var(--color-danger)]">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateSubmit} loading={createPO.isPending}>
              Crear pedido
            </Button>
          </div>
        </div>
      </Modal>

      {/* Receive PO Modal */}
      <Modal open={receiveOpen} onClose={() => setReceiveOpen(false)} title="Recibir pedido" size="lg">
        {selectedPO && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-muted)]">
              Al confirmar, se crearán los lotes de inventario y se registrarán los movimientos de entrada.
            </p>

            <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Producto</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Cantidad</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Costo unit.</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedPO.items ?? []).map(item => (
                    <tr key={item.id} className="border-b border-[var(--color-border)] last:border-b-0">
                      <td className="px-4 py-2 text-[var(--color-text)]">{item.product?.name ?? item.product_id}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-[var(--color-muted)]">{item.quantity}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-[var(--color-muted)]">{formatCurrency(item.unit_cost)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-[var(--color-text)]">{formatCurrency(item.quantity * item.unit_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-[var(--color-text)]">
                Total: {formatCurrency(calcPOTotal(selectedPO.items ?? []))}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setReceiveOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleReceive} loading={receivePO.isPending}>
                  <PackageCheck size={14} />
                  Confirmar recepción
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
