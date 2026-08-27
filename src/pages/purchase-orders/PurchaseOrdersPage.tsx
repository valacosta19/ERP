import React, { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, PackageCheck, Ban, ChevronDown, ChevronRight, AlertTriangle, EyeOff, Eye, X } from 'lucide-react'
import { useSetRestockSkip, useCreateProduct } from '@/hooks/useProducts'
import { formatDate } from '@/lib/formatDate'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { usePurchaseOrders, useCreatePurchaseOrder, useCancelPurchaseOrder, useReceivePurchaseOrder, useUpdateShippingCost, type POPaymentOption } from '@/hooks/usePurchaseOrders'
import { useSuppliers } from '@/hooks/useSuppliers'
import { useProducts } from '@/hooks/useProducts'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useReorderSuggestion } from '@/hooks/useReorderSuggestion'
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

function calcPOTotal(items: PurchaseOrderItem[], shippingCost = 0, discountAmount = 0) {
  const subtotal = items.reduce((acc, i) => acc + i.quantity * i.unit_cost, 0)
  return subtotal - discountAmount + shippingCost
}

interface LineItem {
  product_id: string
  quantity: string
  unit_cost: string
}

const EMPTY_LINE: LineItem = { product_id: '', quantity: '', unit_cost: '' }

const DRAFT_KEY = 'po_create_draft'

function ProductSearchSelect({
  value,
  onChange,
  options,
  onCreateNew,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  onCreateNew?: (name: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  const selectedLabel = options.find(o => o.value === value)?.label ?? ''
  const filtered = options.filter(o =>
    o.value === '' || o.label.toLowerCase().includes(query.toLowerCase())
  )

  const showCreateNew = !!onCreateNew && query.trim().length > 0 &&
    !options.some(o => o.label.toLowerCase() === query.trim().toLowerCase())

  const totalItems = filtered.length + (showCreateNew ? 1 : 0)

  useEffect(() => {
    setHighlighted(0)
  }, [query])

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      })
    }
  }, [open])

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[highlighted] as HTMLElement | undefined
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlighted, open])

  function selectOption(opt: { value: string; label: string }) {
    onChange(opt.value)
    setQuery('')
    setOpen(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlighted(h => Math.min(h + 1, totalItems - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && open) {
      e.preventDefault()
      if (showCreateNew && highlighted === filtered.length) {
        onCreateNew!(query.trim())
        setQuery('')
        setOpen(false)
      } else if (filtered[highlighted]) {
        selectOption(filtered[highlighted])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div className="min-w-0">
      <div
        ref={triggerRef}
        className="flex items-center w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-[var(--color-accent)] focus-within:border-[var(--color-accent)] transition-all"
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
      >
        {!open && !query && value ? (
          <span className="flex-1 text-[var(--color-text)] truncate">{selectedLabel}</span>
        ) : (
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none text-[var(--color-text)] placeholder:text-[var(--color-muted)]"
            placeholder={value ? selectedLabel : 'Buscar producto…'}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => { setOpen(false); setQuery('') }, 150)}
            onKeyDown={handleKeyDown}
          />
        )}
        <ChevronDown size={14} className="ml-1 shrink-0 text-[var(--color-muted)]" />
      </div>

      {open && (filtered.length > 0 || showCreateNew) && createPortal(
        <ul
          ref={listRef}
          style={dropdownStyle}
          className="max-h-64 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
        >
          {filtered.map((opt, i) => (
            <li
              key={opt.value}
              onMouseDown={() => selectOption(opt)}
              onMouseEnter={() => setHighlighted(i)}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                i === highlighted
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'text-[var(--color-text)] hover:bg-[var(--color-bg)]'
              } ${opt.value === '' ? 'text-[var(--color-muted)] italic' : ''}`}
            >
              {opt.label}
            </li>
          ))}
          {showCreateNew && (
            <li
              onMouseDown={() => {
                onCreateNew!(query.trim())
                setQuery('')
                setOpen(false)
              }}
              onMouseEnter={() => setHighlighted(filtered.length)}
              className={`px-3 py-2 text-sm cursor-pointer border-t border-[var(--color-border)] transition-colors text-[var(--color-accent)] ${
                highlighted === filtered.length ? 'bg-[var(--color-bg)]' : ''
              }`}
            >
              + Crear '{query.trim()}'
            </li>
          )}
        </ul>,
        document.body
      )}
    </div>
  )
}

function SuggestionHint({
  productId,
  orderDate,
  onApply,
}: {
  productId: string
  orderDate: string
  onApply: (qty: string) => void
}) {
  const { data, isLoading } = useReorderSuggestion(productId, orderDate)

  if (isLoading) return (
    <p className="text-xs text-[var(--color-muted)] pl-1">Calculando sugerencia…</p>
  )
  if (!data || (data.months_with_data === 0 && data.avg_same_month === 0)) return (
    <p className="text-xs text-[var(--color-muted)] pl-1">Sin historial de consumo para este producto</p>
  )

  const isFallback = data.months_with_data === -1

  const growthLabel = data.growth_rate >= 0
    ? `+${(data.growth_rate * 100).toFixed(0)}%`
    : `${(data.growth_rate * 100).toFixed(0)}%`

  return (
    <div className="flex items-center gap-2 pl-1">
      <span className="text-xs text-[var(--color-muted)]">
        {isFallback
          ? `Consumo reciente: ~${data.avg_same_month} un/mes${data.growth_rate !== 0 ? ` · Crecimiento empresa: ${growthLabel}` : ''}`
          : `Histórico: ~${data.avg_same_month} un/mes · Crecimiento empresa: ${growthLabel}`}
      </span>
      <button
        type="button"
        onClick={() => onApply(String(data.suggested_quantity))}
        className="text-xs text-[var(--color-accent)] hover:underline"
      >
        Usar {data.suggested_quantity} un →
      </button>
    </div>
  )
}

export function PurchaseOrdersPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingShipping, setEditingShipping] = useState<string | null>(null)
  const [shippingDraft, setShippingDraft] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)

  const [newProductOpen, setNewProductOpen] = useState(false)
  const [newProductForLineIdx, setNewProductForLineIdx] = useState(0)
  const [newProductForm, setNewProductForm] = useState({ name: '', sku: '', sale_price: '', min_stock: '0', unit: '', brand: '' })
  const [newProductError, setNewProductError] = useState('')

  interface ReceiveLine {
    id: string
    product_name: string
    ordered: number
    received: string
    checked: boolean
  }
  const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>([])
  const [paymentMode, setPaymentMode] = useState<'immediate' | 'deferred' | 'none'>('none')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')

  const [form, setForm] = useState({ supplier_id: '', order_date: new Date().toISOString().slice(0, 10), shipping_cost: '', discount_pct: '', discount_amount: '' })
  const [lines, setLines] = useState<LineItem[]>([{ ...EMPTY_LINE }])
  const [formError, setFormError] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [selectedRestock, setSelectedRestock] = useState<Set<string>>(new Set())

  const { data: orders = [], isLoading } = usePurchaseOrders()
  const { data: suppliers = [] } = useSuppliers()
  const { data: products = [] } = useProducts()
  const { data: paymentMethods = [] } = usePaymentMethods()
  const createPO = useCreatePurchaseOrder()
  const cancelPO = useCancelPurchaseOrder()
  const receivePO = useReceivePurchaseOrder()
  const updateShipping = useUpdateShippingCost()
  const setRestockSkip = useSetRestockSkip()
  const createProduct = useCreateProduct()

  const allLowStockProducts = products
    .filter(p => (p.stock ?? 0) === 0 || (p.stock ?? 0) < p.min_stock)
    .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0))

  const visibleLowStock = allLowStockProducts.filter(p => !p.skip_restock)
  const hiddenLowStock = allLowStockProducts.filter(p => p.skip_restock)

  const supplierOptions = [
    { value: '', label: 'Sin proveedor' },
    ...suppliers.map(s => ({ value: s.id, label: s.name })),
  ]

  const productOptions = [
    { value: '', label: 'Seleccionar producto' },
    ...products
      .slice()
      .sort((a, b) => {
        const urgency = (p: typeof a) => (p.stock ?? 0) === 0 ? 0 : (p.stock ?? 0) < p.min_stock ? 1 : 2
        return urgency(a) - urgency(b)
      })
      .map(p => {
        const stock = p.stock ?? 0
        const prefix = stock === 0 ? '⚠ Sin stock · ' : stock < p.min_stock ? '↓ Stock bajo · ' : ''
        const brand = p.brand ? ` · ${p.brand}` : ''
        return { value: p.id, label: `${prefix}${p.name} (${p.sku})${brand}` }
      }),
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

  function openCreate(productIds: string[] = []) {
    if (productIds.length === 0) {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as { form: typeof form; lines: LineItem[] }
          setForm(parsed.form)
          setLines(parsed.lines)
          setDraftRestored(true)
          setFormError('')
          setSelectedRestock(new Set())
          setCreateOpen(true)
          return
        } catch {
          localStorage.removeItem(DRAFT_KEY)
        }
      }
    }
    setDraftRestored(false)
    setForm({ supplier_id: '', order_date: new Date().toISOString().slice(0, 10), shipping_cost: '', discount_pct: '', discount_amount: '' })
    setLines(productIds.length > 0
      ? productIds.map(id => ({ product_id: id, quantity: '', unit_cost: '' }))
      : [{ ...EMPTY_LINE }]
    )
    setFormError('')
    setSelectedRestock(new Set())
    setCreateOpen(true)
  }

  function discardDraft() {
    localStorage.removeItem(DRAFT_KEY)
    setDraftRestored(false)
    setForm({ supplier_id: '', order_date: new Date().toISOString().slice(0, 10), shipping_cost: '', discount_pct: '', discount_amount: '' })
    setLines([{ ...EMPTY_LINE }])
    setFormError('')
  }

  function saveDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, lines }))
    setCreateOpen(false)
  }

  function handleDiscountPctChange(value: string) {
    setForm(f => {
      const subtotal = lines.reduce((acc, l) => acc + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0), 0)
      const pct = parseFloat(value)
      const amount = !isNaN(pct) && subtotal > 0 ? ((subtotal * pct) / 100).toFixed(2) : f.discount_amount
      return { ...f, discount_pct: value, discount_amount: amount }
    })
  }

  function handleDiscountAmountChange(value: string) {
    setForm(f => {
      const subtotal = lines.reduce((acc, l) => acc + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0), 0)
      const amount = parseFloat(value)
      const pct = !isNaN(amount) && subtotal > 0 ? ((amount / subtotal) * 100).toFixed(2) : f.discount_pct
      return { ...f, discount_amount: value, discount_pct: pct }
    })
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
      shipping_cost: parseFloat(form.shipping_cost) || 0,
      discount_amount: parseFloat(form.discount_amount) || 0,
      items: validLines.map(l => ({
        product_id: l.product_id,
        quantity: parseFloat(l.quantity),
        unit_cost: parseFloat(l.unit_cost),
      })),
    })
    setCreateOpen(false)
    localStorage.removeItem(DRAFT_KEY)
  }

  function openNewProduct(name: string, lineIdx: number) {
    setNewProductForLineIdx(lineIdx)
    setNewProductForm({ name, sku: '', sale_price: '', min_stock: '0', unit: '', brand: '' })
    setNewProductError('')
    setNewProductOpen(true)
  }

  async function handleCreateNewProduct() {
    if (!newProductForm.name.trim()) {
      setNewProductError('El nombre es obligatorio.')
      return
    }
    const product = await createProduct.mutateAsync({
      name: newProductForm.name.trim(),
      sku: newProductForm.sku.trim() || null,
      sale_price: parseFloat(newProductForm.sale_price) || 0,
      min_stock: parseInt(newProductForm.min_stock) || 0,
      unit: newProductForm.unit || null,
      brand: newProductForm.brand || null,
    })
    updateLine(newProductForLineIdx, 'product_id', product.id)
    setNewProductOpen(false)
  }

  function openReceive(po: PurchaseOrder) {
    setSelectedPO(po)
    setReceiveLines(
      (po.items ?? []).map(item => ({
        id: item.id,
        product_name: item.product?.name ?? item.product_id,
        ordered: item.quantity,
        received: String(item.quantity),
        checked: true,
      }))
    )
    setPaymentMode('none')
    setPaymentMethod(paymentMethods.find(m => m.active)?.name ?? '')
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setDueDate('')
    setReceiveOpen(true)
  }

  async function handleReceive() {
    if (!selectedPO) return
    const items = receiveLines
      .filter(l => l.checked && parseFloat(l.received) > 0)
      .map(l => ({ id: l.id, quantity: parseFloat(l.received) }))
    if (items.length === 0) return

    const receivedItems = receiveLines.filter(l => l.checked && parseFloat(l.received) > 0)
    const itemsTotal = receivedItems.reduce((sum, l) => {
      const orig = selectedPO.items?.find(i => i.id === l.id)
      return sum + (orig ? orig.unit_cost * parseFloat(l.received) : 0)
    }, 0)
    const totalAmount = itemsTotal + (selectedPO.shipping_cost ?? 0) - (selectedPO.discount_amount ?? 0)

    let paymentOption: POPaymentOption
    if (paymentMode === 'immediate') {
      paymentOption = { mode: 'immediate', payment_method: paymentMethod, date: paymentDate }
    } else if (paymentMode === 'deferred') {
      paymentOption = { mode: 'deferred', due_date: dueDate || null }
    } else {
      paymentOption = { mode: 'none' }
    }

    await receivePO.mutateAsync({ po: selectedPO, items, totalAmount, paymentOption })
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
          {formatCurrency(calcPOTotal(po.items ?? [], po.shipping_cost, po.discount_amount))}
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
          <Button onClick={() => openCreate()} size="sm">
            <Plus size={14} />
            Nuevo pedido
          </Button>
        }
      />

      {allLowStockProducts.length > 0 && (
        <div className="mx-6 mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={13} className="text-[var(--color-warning)]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-display)' }}>
              Productos para reponer
            </span>
            {visibleLowStock.length > 0 && <Badge variant="danger">{visibleLowStock.length}</Badge>}
            <div className="ml-auto flex items-center gap-2">
              {selectedRestock.size > 0 && (
                <Button size="sm" onClick={() => openCreate([...selectedRestock])}>
                  <Plus size={12} />
                  Nuevo pedido ({selectedRestock.size})
                </Button>
              )}
              {hiddenLowStock.length > 0 && (
                <button
                  onClick={() => setShowHidden(v => !v)}
                  className="flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  {showHidden ? <Eye size={12} /> : <EyeOff size={12} />}
                  {showHidden ? 'Ocultar pausados' : `Ver pausados (${hiddenLowStock.length})`}
                </button>
              )}
            </div>
          </div>

          {visibleLowStock.length === 0 && !showHidden && (
            <p className="text-xs text-[var(--color-muted)]">Todos los productos con stock bajo están pausados.</p>
          )}

          <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
            {visibleLowStock.map(p => {
              const isOut = (p.stock ?? 0) === 0
              const isSelected = selectedRestock.has(p.id)
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                    isSelected
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-light,#eff6ff)] ring-1 ring-[var(--color-accent)]'
                      : isOut
                        ? 'border-[var(--color-danger)] bg-[var(--color-danger-light)]'
                        : 'border-[var(--color-warning)] bg-[var(--color-warning-light)]'
                  }`}
                >
                  <button
                    onClick={() => setSelectedRestock(s => {
                      const next = new Set(s)
                      next.has(p.id) ? next.delete(p.id) : next.add(p.id)
                      return next
                    })}
                    className="flex items-center gap-2 hover:opacity-75 transition-opacity"
                  >
                    <span className="font-medium text-[var(--color-text)]">{p.name}</span>
                    <span className="tabular-nums text-xs text-[var(--color-muted)]">
                      {p.stock ?? 0} / {p.min_stock}
                    </span>
                    <Badge variant={isSelected ? 'default' : isOut ? 'danger' : 'warning'}>
                      {isSelected ? '✓' : isOut ? 'Sin stock' : 'Stock bajo'}
                    </Badge>
                  </button>
                  <button
                    onClick={() => setRestockSkip.mutate({ id: p.id, skip_restock: true })}
                    title="No pedir por ahora"
                    className="ml-1 p-0.5 rounded text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
                  >
                    <X size={11} />
                  </button>
                </div>
              )
            })}

            {showHidden && hiddenLowStock.map(p => {
              const isOut = (p.stock ?? 0) === 0
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm border-[var(--color-border)] bg-[var(--color-bg)] opacity-60"
                >
                  <span className="font-medium text-[var(--color-muted)] line-through">{p.name}</span>
                  <span className="tabular-nums text-xs text-[var(--color-muted)]">
                    {p.stock ?? 0} / {p.min_stock}
                  </span>
                  <Badge variant={isOut ? 'danger' : 'warning'}>
                    {isOut ? 'Sin stock' : 'Stock bajo'}
                  </Badge>
                  <button
                    onClick={() => setRestockSkip.mutate({ id: p.id, skip_restock: false })}
                    title="Volver a mostrar"
                    className="ml-1 p-0.5 rounded text-[var(--color-muted)] hover:text-[var(--color-accent)] transition-colors"
                  >
                    <Eye size={11} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
                                      <td className="py-1 text-[var(--color-text)]">
                                        {item.product?.name ?? item.product_id}
                                        {item.product?.brand && (
                                          <span className="ml-1.5 text-[var(--color-muted)]">{item.product.brand}</span>
                                        )}
                                      </td>
                                      <td className="py-1 text-right tabular-nums text-[var(--color-muted)]">{item.quantity}</td>
                                      <td className="py-1 text-right tabular-nums text-[var(--color-muted)]">{formatCurrency(item.unit_cost)}</td>
                                      <td className="py-1 text-right tabular-nums font-medium text-[var(--color-text)]">{formatCurrency(item.quantity * item.unit_cost)}</td>
                                    </tr>
                                  ))}
                                  {po.status === 'draft' && (
                                    <tr className="border-t border-[var(--color-border)]">
                                      <td colSpan={3} className="py-1 text-[var(--color-muted)] italic">Envío (distribuido al recibir)</td>
                                      <td className="py-1 text-right">
                                        {editingShipping === po.id ? (
                                          <div className="flex items-center justify-end gap-1">
                                            <input
                                              type="number"
                                              min="0"
                                              step="0.01"
                                              autoFocus
                                              value={shippingDraft}
                                              onChange={e => setShippingDraft(e.target.value)}
                                              onKeyDown={async e => {
                                                if (e.key === 'Enter') {
                                                  await updateShipping.mutateAsync({ id: po.id, shipping_cost: parseFloat(shippingDraft) || 0 })
                                                  setEditingShipping(null)
                                                } else if (e.key === 'Escape') {
                                                  setEditingShipping(null)
                                                }
                                              }}
                                              className="w-24 text-right text-xs px-1 py-0.5 rounded border border-[var(--color-accent)] bg-[var(--color-bg)] text-[var(--color-text)] tabular-nums focus:outline-none"
                                            />
                                            <button
                                              onClick={async () => {
                                                await updateShipping.mutateAsync({ id: po.id, shipping_cost: parseFloat(shippingDraft) || 0 })
                                                setEditingShipping(null)
                                              }}
                                              className="text-xs text-[var(--color-accent)] hover:underline"
                                            >
                                              OK
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => { setShippingDraft(String(po.shipping_cost)); setEditingShipping(po.id) }}
                                            className="tabular-nums text-[var(--color-muted)] hover:text-[var(--color-text)] hover:underline transition-colors"
                                          >
                                            {po.shipping_cost > 0 ? formatCurrency(po.shipping_cost) : '+ Agregar envío'}
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  )}
                                  {po.status !== 'draft' && po.shipping_cost > 0 && (
                                    <tr className="border-t border-[var(--color-border)]">
                                      <td colSpan={3} className="py-1 text-[var(--color-muted)] italic">Envío (distribuido al recibir)</td>
                                      <td className="py-1 text-right tabular-nums text-[var(--color-muted)]">{formatCurrency(po.shipping_cost)}</td>
                                    </tr>
                                  )}
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
          {draftRestored && (
            <div className="flex items-center gap-2 text-xs text-[var(--color-muted)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
              <span>Borrador restaurado —</span>
              <button
                type="button"
                onClick={discardDraft}
                className="text-[var(--color-accent)] hover:underline"
              >
                Descartar
              </button>
            </div>
          )}
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
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Costo de envío (opcional)"
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={form.shipping_cost}
              onChange={e => setForm(f => ({ ...f, shipping_cost: e.target.value }))}
              prefix="$"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Descuento %"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="0"
                value={form.discount_pct}
                onChange={e => handleDiscountPctChange(e.target.value)}
                prefix="%"
              />
              <Input
                label="Descuento $"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={form.discount_amount}
                onChange={e => handleDiscountAmountChange(e.target.value)}
                prefix="$"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Ítems</p>
            <div className="min-w-0">
              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="grid grid-cols-[1fr_100px_120px_32px] gap-2 items-end">
                      <ProductSearchSelect
                        options={productOptions}
                        value={line.product_id}
                        onChange={v => updateLine(idx, 'product_id', v)}
                        onCreateNew={(name) => openNewProduct(name, idx)}
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
                    {line.product_id && (
                      <SuggestionHint
                        productId={line.product_id}
                        orderDate={form.order_date}
                        onApply={(qty) => updateLine(idx, 'quantity', qty)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={addLine}
              className="mt-2 text-xs text-[var(--color-accent)] hover:underline"
            >
              + Agregar ítem
            </button>
          </div>

          {(() => {
            const subtotal = lines.reduce((acc, l) => acc + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0), 0)
            const discount = parseFloat(form.discount_amount) || 0
            const shipping = parseFloat(form.shipping_cost) || 0
            const total = subtotal - discount + shipping
            if (subtotal === 0) return null
            return (
              <div className="text-xs text-right space-y-0.5 text-[var(--color-muted)]">
                <div className="flex justify-end gap-6">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-end gap-6 text-[var(--color-danger)]">
                    <span>Descuento</span>
                    <span>−{formatCurrency(discount)}</span>
                  </div>
                )}
                {shipping > 0 && (
                  <div className="flex justify-end gap-6">
                    <span>Envío</span>
                    <span>{formatCurrency(shipping)}</span>
                  </div>
                )}
                <div className="flex justify-end gap-6 font-semibold text-[var(--color-text)] border-t border-[var(--color-border)] pt-0.5 mt-0.5">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            )
          })()}

          {formError && <p className="text-xs text-[var(--color-danger)]">{formError}</p>}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={saveDraft}
              className="text-xs text-[var(--color-muted)] hover:underline hover:text-[var(--color-text)]"
            >
              Guardar borrador
            </button>
            <div className="flex gap-2 ml-auto">
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateSubmit} loading={createPO.isPending}>
                Crear pedido
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* New Product Modal */}
      <Modal open={newProductOpen} onClose={() => setNewProductOpen(false)} title="Nuevo producto" size="md">
        <div className="space-y-3">
          <Input
            label="Nombre *"
            value={newProductForm.name}
            onChange={e => setNewProductForm(f => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="SKU"
            value={newProductForm.sku}
            onChange={e => setNewProductForm(f => ({ ...f, sku: e.target.value }))}
            placeholder="Se genera automático si lo dejás vacío"
          />
          <Input
            label="Precio de venta"
            type="number"
            min="0"
            step="0.01"
            value={newProductForm.sale_price}
            onChange={e => setNewProductForm(f => ({ ...f, sale_price: e.target.value }))}
            prefix="$"
          />
          <Input
            label="Stock mínimo"
            type="number"
            min="0"
            step="1"
            value={newProductForm.min_stock}
            onChange={e => setNewProductForm(f => ({ ...f, min_stock: e.target.value }))}
          />
          <Input
            label="Unidad"
            value={newProductForm.unit}
            onChange={e => setNewProductForm(f => ({ ...f, unit: e.target.value }))}
          />
          <Input
            label="Marca"
            value={newProductForm.brand}
            onChange={e => setNewProductForm(f => ({ ...f, brand: e.target.value }))}
          />
          {newProductError && <p className="text-xs text-[var(--color-danger)]">{newProductError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setNewProductOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateNewProduct} loading={createProduct.isPending}>
              Crear producto
            </Button>
          </div>
        </div>
      </Modal>

      {/* Receive PO Modal */}
      <Modal open={receiveOpen} onClose={() => setReceiveOpen(false)} title="Recibir pedido" size="lg">
        {selectedPO && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--color-muted)]">
              Marcá los productos que llegaron y ajustá las cantidades si difieren del pedido.
              {selectedPO.shipping_cost > 0 && ' El envío se distribuirá entre los productos recibidos.'}
            </p>

            <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    <th className="w-10 px-2 py-2" />
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Producto</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Pedido</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Recibido</th>
                  </tr>
                </thead>
                <tbody>
                  {receiveLines.map((line, idx) => (
                    <tr
                      key={line.id}
                      className={`border-b border-[var(--color-border)] last:border-b-0 transition-colors ${line.checked ? '' : 'opacity-40'}`}
                    >
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={line.checked}
                          onChange={e => setReceiveLines(ls => ls.map((l, i) => i === idx ? { ...l, checked: e.target.checked } : l))}
                          className="w-4 h-4 cursor-pointer rounded"
                        />
                      </td>
                      <td className={`px-3 py-2 text-[var(--color-text)] ${!line.checked ? 'line-through' : ''}`}>
                        {line.product_name}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted)]">
                        {line.ordered}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          disabled={!line.checked}
                          value={line.received}
                          onChange={e => setReceiveLines(ls => ls.map((l, i) => i === idx ? { ...l, received: e.target.value } : l))}
                          className="w-24 text-right tabular-nums text-sm px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] disabled:opacity-40"
                        />
                      </td>
                    </tr>
                  ))}
                  {selectedPO.shipping_cost > 0 && (
                    <tr className="border-t border-[var(--color-border)] bg-[var(--color-bg)]">
                      <td colSpan={3} className="px-3 py-2 text-xs text-[var(--color-muted)] italic">Envío (distribuido proporcionalmente)</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-[var(--color-muted)]">{formatCurrency(selectedPO.shipping_cost)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {receiveLines.every(l => !l.checked || parseFloat(l.received) <= 0) && (
              <p className="text-xs text-[var(--color-danger)]">Seleccioná al menos un producto con cantidad mayor a 0.</p>
            )}

            <div className="space-y-3 border-t border-[var(--color-border)] pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Pago</p>
              <div className="flex gap-2">
                {(['none', 'immediate', 'deferred'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaymentMode(mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      paymentMode === mode
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    {mode === 'none' ? 'Sin registrar' : mode === 'immediate' ? 'Pago inmediato' : 'Diferido'}
                  </button>
                ))}
              </div>

              {paymentMode === 'immediate' && (
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Método de pago"
                    options={paymentMethods.filter(m => m.active).map(m => ({ value: m.name, label: m.name }))}
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                  />
                  <Input
                    label="Fecha de pago"
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                  />
                </div>
              )}

              {paymentMode === 'deferred' && (
                <Input
                  label="Fecha de vencimiento (opcional)"
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                />
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReceiveOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleReceive}
                loading={receivePO.isPending}
                disabled={receiveLines.every(l => !l.checked || parseFloat(l.received) <= 0)}
              >
                <PackageCheck size={14} />
                Confirmar recepción
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
