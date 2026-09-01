import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Pencil, Plus, Search, X } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Table } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { InlineEditCell } from '@/components/ui/InlineEditCell'
import { useCatalogItems, useUpdateCatalogItemHours } from '@/hooks/useCatalogItems'
import { useProducts, useUpdateProduct } from '@/hooks/useProducts'
import { useAllServiceRecipes, useUpsertServiceRecipes } from '@/hooks/useServiceRecipes'
import { getAvgUnitCost, getCostPerGram } from '@/lib/recipeCost'
import { groupServiceFamilies, SIZE_LABELS, type ServiceFamily } from '@/lib/serviceFamilies'
import { formatMoney } from '@/lib/money'
import type { CatalogItem, Product, ServiceRecipe } from '@/types'

type Tab = 'recetas' | 'insumos'

const TAB_LABELS: Record<Tab, string> = { recetas: 'Recetas', insumos: 'Insumos' }

function fmtGrams(value: number) {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

function fmtPerGram(value: number) {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function parseQty(value: string) {
  const n = parseFloat(value)
  return isNaN(n) || n <= 0 ? 0 : n
}

interface FamilyRow {
  product: Product | undefined
  productId: string
  name: string
  quantities: (number | null)[]
}

interface FamilyView {
  family: ServiceFamily
  rows: FamilyRow[]
  hasRecipe: boolean
}

function buildFamilyView(
  family: ServiceFamily,
  recipesByService: Map<string, ServiceRecipe[]>,
  productById: Map<string, Product>,
): FamilyView {
  const rowsByProduct = new Map<string, FamilyRow>()
  family.columns.forEach((col, colIdx) => {
    for (const recipe of recipesByService.get(col.item.id) ?? []) {
      const product = productById.get(recipe.product_id)
      const row = rowsByProduct.get(recipe.product_id) ?? {
        product,
        productId: recipe.product_id,
        name: product?.name ?? 'Producto eliminado',
        quantities: family.columns.map(() => null),
      }
      row.quantities[colIdx] = recipe.quantity_grams
      rowsByProduct.set(recipe.product_id, row)
    }
  })
  const rows = [...rowsByProduct.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return { family, rows, hasRecipe: rows.length > 0 }
}

interface DraftRow {
  productId: string
  cells: string[]
}

function draftFromView(view: FamilyView): DraftRow[] {
  return view.rows.map(r => ({ productId: r.productId, cells: r.quantities.map(q => (q == null ? '' : String(q))) }))
}

function sameRecipe(a: { product_id: string; quantity_grams: number }[], b: { product_id: string; quantity_grams: number }[]) {
  if (a.length !== b.length) return false
  const key = (r: { product_id: string; quantity_grams: number }) => `${r.product_id}:${r.quantity_grams}`
  const setA = new Set(a.map(key))
  return b.every(r => setA.has(key(r)))
}

interface FamilyCardProps {
  view: FamilyView
  index: number
  products: Product[]
  productById: Map<string, Product>
  editing: boolean
  onEdit: () => void
  onClose: () => void
}

function FamilyCard({ view, index, products, productById, editing, onEdit, onClose }: FamilyCardProps) {
  const { family } = view
  const cols = family.columns
  const upsertRecipes = useUpsertServiceRecipes()
  const updateHours = useUpdateCatalogItemHours()
  const [draft, setDraft] = useState<DraftRow[]>(() => draftFromView(view))
  const [hoursDraft, setHoursDraft] = useState<string[]>(() => cols.map(c => (c.item.hours != null ? String(c.item.hours) : '')))
  const [addingProductId, setAddingProductId] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setDraft(draftFromView(view))
    setHoursDraft(cols.map(c => (c.item.hours != null ? String(c.item.hours) : '')))
    setAddingProductId('')
    onEdit()
  }

  const rows: { productId: string; product: Product | undefined; name: string; cells: string[] }[] = editing
    ? draft.map(d => {
        const product = productById.get(d.productId)
        return { productId: d.productId, product, name: product?.name ?? 'Producto eliminado', cells: d.cells }
      })
    : view.rows.map(r => ({ productId: r.productId, product: r.product, name: r.name, cells: r.quantities.map(q => (q == null ? '' : String(q))) }))

  const costOf = (product: Product | undefined, qty: number): number | null => {
    const cpg = product ? getCostPerGram(product) : null
    return cpg == null ? null : cpg * qty
  }

  const totals = cols.map((_, i) => {
    const used = rows.filter(r => parseQty(r.cells[i]) > 0)
    if (used.length === 0) return null
    return used.reduce((s, r) => s + (costOf(r.product, parseQty(r.cells[i])) ?? 0), 0)
  })

  function updateCell(productId: string, colIdx: number, value: string) {
    setDraft(d => d.map(r => (r.productId === productId ? { ...r, cells: r.cells.map((c, i) => (i === colIdx ? value : c)) } : r)))
  }

  function removeRow(productId: string) {
    setDraft(d => d.filter(r => r.productId !== productId))
  }

  function addRow(productId: string) {
    if (!productId || draft.some(r => r.productId === productId)) return
    setDraft(d => [...d, { productId, cells: cols.map(() => '') }])
    setAddingProductId('')
  }

  async function save() {
    setSaving(true)
    try {
      for (const [i, col] of cols.entries()) {
        const next = draft
          .map(r => ({ product_id: r.productId, quantity_grams: parseQty(r.cells[i]) }))
          .filter(r => r.quantity_grams > 0)
        const current = view.rows
          .filter(r => r.quantities[i] != null)
          .map(r => ({ product_id: r.productId, quantity_grams: r.quantities[i] as number }))
        if (!sameRecipe(current, next)) {
          await upsertRecipes.mutateAsync({ catalogItemId: col.item.id, recipes: next })
        }
        const hours = hoursDraft[i] === '' ? null : parseFloat(hoursDraft[i])
        const nextHours = hours != null && isNaN(hours) ? null : hours
        if (nextHours !== (col.item.hours ?? null)) {
          await updateHours.mutateAsync({ id: col.item.id, hours: nextHours })
        }
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const availableProducts = products.filter(p => !draft.some(r => r.productId === p.id))
  const shade = (i: number) => (i % 2 === 1 ? 'bg-[var(--color-bg)]' : '')

  return (
    <section
      className={`recipe-card bg-[var(--color-surface)] border rounded-xl overflow-hidden animate-fade-in ${editing ? 'border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]' : 'border-[var(--color-border)]'}`}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms`, opacity: 0 }}
    >
      <header className="recipe-card__header flex items-center justify-between gap-4 px-5 pt-4 pb-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
            {family.family}
          </h2>
          <span className="text-xs text-[var(--color-muted)] tabular-nums">
            {rows.length} {rows.length === 1 ? 'insumo' : 'insumos'}
          </span>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button variant="primary" size="sm" onClick={save} loading={saving}>Guardar receta</Button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-accent)] transition-colors"
          >
            <Pencil size={12} /> Editar
          </button>
        )}
      </header>
      <div className="overflow-x-auto">
        <table className="recipe-card__table w-full text-sm">
          <thead>
            <tr className="border-t border-[var(--color-border)]">
              <th className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] align-bottom">Insumo</th>
              {cols.map((col, i) => (
                <th key={col.item.id} colSpan={2} className={`px-4 py-2 text-right align-bottom ${shade(i)}`}>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text)]">{SIZE_LABELS[col.size]}</span>
                  <div className="text-xs font-normal text-[var(--color-muted)] tabular-nums mt-0.5 flex items-center justify-end gap-1">
                    <span>{formatMoney(col.item.price)}</span>
                    <span>·</span>
                    {editing ? (
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={hoursDraft[i]}
                        onChange={e => setHoursDraft(h => h.map((v, j) => (j === i ? e.target.value : v)))}
                        placeholder="h"
                        aria-label={`Horas de ${col.item.name}`}
                        className="w-12 text-right bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1 py-0.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      />
                    ) : (
                      <span>{col.item.hours != null ? fmtGrams(col.item.hours) : '—'}</span>
                    )}
                    <span>h</span>
                  </div>
                </th>
              ))}
              {editing && <th className="w-8" />}
            </tr>
            <tr className="border-b border-[var(--color-border)]">
              <th />
              {cols.map((col, i) => (
                <SubHeader key={col.item.id} shaded={i % 2 === 1} />
              ))}
              {editing && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={1 + cols.length * 2 + (editing ? 1 : 0)} className="px-5 py-6 text-center text-xs text-[var(--color-muted)]">
                  Sin insumos. Agregá el primero abajo.
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr key={row.productId} className="border-b border-[var(--color-border)] last:border-b-0">
                <td className="px-5 py-2 text-[var(--color-text)]">
                  <div className="flex items-center gap-2">
                    <span>{row.name}</span>
                    {row.product && !row.product.unit_size && (
                      <span title="Sin tamaño de envase: no se puede costear" className="text-[var(--color-warning)] inline-flex">
                        <AlertTriangle size={12} />
                      </span>
                    )}
                  </div>
                  {row.product?.brand && <p className="text-xs text-[var(--color-muted)]">{row.product.brand}</p>}
                </td>
                {row.cells.map((cell, i) => {
                  const qty = parseQty(cell)
                  const cost = qty > 0 ? costOf(row.product, qty) : null
                  const cls = `px-4 py-2 text-right tabular-nums ${shade(i)}`
                  return (
                    <FragmentCells
                      key={cols[i].item.id}
                      cls={cls}
                      editing={editing}
                      value={cell}
                      qty={qty}
                      cost={cost}
                      onChange={v => updateCell(row.productId, i, v)}
                      label={`${row.name} en ${cols[i].item.name}`}
                    />
                  )
                })}
                {editing && (
                  <td className="px-2 py-2">
                    <button
                      onClick={() => removeRow(row.productId)}
                      title="Quitar insumo de todas las tallas"
                      className="p-1 rounded text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {editing && (
              <tr className="border-t border-dashed border-[var(--color-border)]">
                <td colSpan={1 + cols.length * 2 + 1} className="px-5 py-2">
                  <div className="flex items-center gap-2">
                    <Plus size={12} className="text-[var(--color-accent)]" />
                    <select
                      value={addingProductId}
                      onChange={e => addRow(e.target.value)}
                      className="bg-transparent text-xs text-[var(--color-accent)] outline-none cursor-pointer"
                    >
                      <option value="">Agregar insumo…</option>
                      {availableProducts.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.brand ? ` · ${p.brand}` : ''}{!p.unit_size ? ' (sin tamaño)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--color-border)]">
              <td className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Total materiales</td>
              {totals.map((total, i) => (
                <td key={cols[i].item.id} colSpan={2} className={`px-4 py-2.5 text-right font-semibold text-[var(--color-text)] tabular-nums ${shade(i)}`}>
                  {total == null ? '—' : formatMoney(total)}
                </td>
              ))}
              {editing && <td />}
            </tr>
            <tr>
              <td className="px-5 pb-3 pt-0 text-xs text-[var(--color-muted)]">% sobre precio</td>
              {totals.map((total, i) => {
                const price = cols[i].item.price
                const pct = total != null && price > 0 ? (total / price) * 100 : null
                return (
                  <td key={cols[i].item.id} colSpan={2} className={`px-4 pb-3 pt-0 text-right text-xs text-[var(--color-muted)] tabular-nums ${shade(i)}`}>
                    {pct == null ? '—' : `${pct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`}
                  </td>
                )
              })}
              {editing && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function SubHeader({ shaded }: { shaded: boolean }) {
  const cls = `px-4 pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)] ${shaded ? 'bg-[var(--color-bg)]' : ''}`
  return (
    <>
      <th className={cls}>g / mL</th>
      <th className={cls}>Costo</th>
    </>
  )
}

interface FragmentCellsProps {
  cls: string
  editing: boolean
  value: string
  qty: number
  cost: number | null
  onChange: (value: string) => void
  label: string
}

function FragmentCells({ cls, editing, value, qty, cost, onChange, label }: FragmentCellsProps) {
  if (editing) {
    return (
      <>
        <td className={cls}>
          <input
            type="number"
            min="0"
            step="0.5"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="—"
            aria-label={label}
            className="w-16 text-right bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] tabular-nums"
          />
        </td>
        <td className={`${cls} text-[var(--color-muted)]`}>{qty > 0 ? (cost == null ? '—' : formatMoney(cost)) : ''}</td>
      </>
    )
  }
  if (qty === 0) {
    return (
      <>
        <td className={`${cls} text-[var(--color-border)]`}>·</td>
        <td className={`${cls} text-[var(--color-border)]`}>·</td>
      </>
    )
  }
  return (
    <>
      <td className={`${cls} text-[var(--color-text)]`}>{fmtGrams(qty)}</td>
      <td className={`${cls} text-[var(--color-muted)]`}>{cost == null ? '—' : formatMoney(cost)}</td>
    </>
  )
}

interface SupplyRow {
  id: string
  product: Product
  avgUnitCost: number | null
  costPerGram: number | null
  uses: { service: CatalogItem; family: string; quantity: number; cost: number | null }[]
}

export function RecipesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as Tab) ?? 'recetas'
  function setActiveTab(tab: Tab) {
    setSearchParams(prev => { prev.set('tab', tab); return prev })
  }
  const [search, setSearch] = useState('')
  const [editingFamily, setEditingFamily] = useState<string | null>(null)

  const { data: catalogItems = [], isLoading: loadingCatalog } = useCatalogItems()
  const { data: products = [], isLoading: loadingProducts } = useProducts()
  const { data: recipes = [], isLoading: loadingRecipes } = useAllServiceRecipes()
  const updateProduct = useUpdateProduct()
  const loading = loadingCatalog || loadingProducts || loadingRecipes

  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products])
  const recipesByService = useMemo(() => {
    const map = new Map<string, ServiceRecipe[]>()
    for (const r of recipes) {
      const list = map.get(r.catalog_item_id) ?? []
      list.push(r)
      map.set(r.catalog_item_id, list)
    }
    return map
  }, [recipes])

  const familyViews = useMemo(
    () => groupServiceFamilies(catalogItems).map(f => buildFamilyView(f, recipesByService, productById)),
    [catalogItems, recipesByService, productById],
  )
  const familyOfService = useMemo(() => {
    const map = new Map<string, string>()
    for (const v of familyViews) for (const c of v.family.columns) map.set(c.item.id, v.family.family)
    return map
  }, [familyViews])

  const filteredViews = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? familyViews.filter(v => v.family.family.toLowerCase().includes(q)) : familyViews
  }, [familyViews, search])
  const visibleCards = filteredViews.filter(v => v.hasRecipe || v.family.family === editingFamily)
  const withoutRecipe = filteredViews.filter(v => !v.hasRecipe && v.family.family !== editingFamily)

  const supplyRows = useMemo<SupplyRow[]>(() => {
    const serviceById = new Map(catalogItems.map(ci => [ci.id, ci]))
    const usesByProduct = new Map<string, SupplyRow['uses']>()
    for (const r of recipes) {
      const service = serviceById.get(r.catalog_item_id)
      if (!service) continue
      const product = productById.get(r.product_id)
      const costPerGram = product ? getCostPerGram(product) : null
      const list = usesByProduct.get(r.product_id) ?? []
      list.push({
        service,
        family: familyOfService.get(service.id) ?? service.name,
        quantity: r.quantity_grams,
        cost: costPerGram == null ? null : costPerGram * r.quantity_grams,
      })
      usesByProduct.set(r.product_id, list)
    }
    return [...usesByProduct.entries()]
      .map(([productId, uses]) => {
        const product = productById.get(productId)
        if (!product) return null
        return {
          id: productId,
          product,
          avgUnitCost: getAvgUnitCost(product),
          costPerGram: getCostPerGram(product),
          uses: uses.sort((a, b) => a.service.name.localeCompare(b.service.name, 'es')),
        }
      })
      .filter((row): row is SupplyRow => row != null)
      .sort((a, b) => a.product.name.localeCompare(b.product.name, 'es'))
  }, [recipes, catalogItems, productById, familyOfService])

  const servicesWithRecipe = recipesByService.size
  const serviceCount = familyViews.reduce((s, v) => s + v.family.columns.length, 0)
  const suppliesWithoutSize = supplyRows.filter(r => !r.product.unit_size).length

  function openFamily(family: string) {
    setSearch('')
    setEditingFamily(family)
    setActiveTab('recetas')
  }

  async function saveUnitSize(product: Product, value: string) {
    const parsed = value === '' ? null : Number(value)
    if (parsed != null && (isNaN(parsed) || parsed <= 0)) throw new Error('El tamaño del envase debe ser un número mayor a 0.')
    await updateProduct.mutateAsync({
      id: product.id,
      name: product.name,
      sku: product.sku,
      brand: product.brand,
      unit: product.unit,
      sale_price: product.sale_price,
      min_stock: product.min_stock,
      unit_size: parsed,
    })
  }

  const supplyColumns = [
    {
      key: 'name',
      header: 'Insumo',
      render: (row: SupplyRow) => (
        <div>
          <p className="font-medium text-[var(--color-text)]">{row.product.name}</p>
          {row.product.brand && <p className="text-xs text-[var(--color-muted)]">{row.product.brand}</p>}
        </div>
      ),
    },
    {
      key: 'unit_size',
      header: 'Envase (g / mL)',
      className: 'text-right',
      render: (row: SupplyRow) => (
        <div className="flex items-center justify-end gap-2">
          {!row.product.unit_size && <Badge variant="warning">Sin envase</Badge>}
          <InlineEditCell
            type="number"
            value={row.product.unit_size != null ? String(row.product.unit_size) : ''}
            displayValue={row.product.unit_size != null ? fmtGrams(row.product.unit_size) : ''}
            placeholder="Cargar"
            onSave={v => saveUnitSize(row.product, v)}
            className="tabular-nums text-right"
          />
        </div>
      ),
    },
    {
      key: 'avg_cost',
      header: 'Último costo',
      className: 'text-right',
      render: (row: SupplyRow) => (
        <span className="tabular-nums">{row.avgUnitCost == null ? '—' : formatMoney(row.avgUnitCost)}</span>
      ),
    },
    {
      key: 'cost_per_gram',
      header: 'Costo por g / mL',
      className: 'text-right',
      render: (row: SupplyRow) => (
        <span className="tabular-nums font-medium text-[var(--color-text)]">{row.costPerGram == null ? '—' : fmtPerGram(row.costPerGram)}</span>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      className: 'text-right',
      render: (row: SupplyRow) => (
        <span className={`tabular-nums ${(row.product.stock ?? 0) > 0 ? '' : 'text-[var(--color-muted)]'}`}>{fmtGrams(row.product.stock ?? 0)}</span>
      ),
    },
    {
      key: 'services',
      header: 'Servicios',
      className: 'text-right',
      render: (row: SupplyRow) => <Badge variant="accent">{row.uses.length}</Badge>,
    },
  ]

  return (
    <div className="recipes-page flex flex-col h-full">
      <TopBar title="Recetas" subtitle="Qué insumos lleva cada servicio y cuánto cuestan" />
      <div className="flex gap-0 border-b border-[var(--color-border)] px-6 shrink-0 bg-[var(--color-surface)]">
        {(Object.keys(TAB_LABELS) as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Servicios con receta</p>
            <p className="text-2xl font-semibold text-[var(--color-text)] mt-1 tabular-nums">
              {servicesWithRecipe} <span className="text-sm font-normal text-[var(--color-muted)]">de {serviceCount}</span>
            </p>
          </div>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Insumos en uso</p>
            <p className="text-2xl font-semibold text-[var(--color-text)] mt-1 tabular-nums">{supplyRows.length}</p>
          </div>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Sin tamaño de envase</p>
            <p className="text-2xl font-semibold mt-1 tabular-nums" style={{ color: suppliesWithoutSize > 0 ? 'var(--color-warning)' : 'var(--color-text)' }}>
              {suppliesWithoutSize}
            </p>
            <p className="text-xs text-[var(--color-muted)] mt-1">sin envase no hay costo por gramo</p>
          </div>
        </div>

        {activeTab === 'recetas' && (
          <>
            <div className="relative max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar servicio…"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] outline-none focus:ring-1 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)]"
              />
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <span className="inline-block w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : visibleCards.length === 0 ? (
              <p className="py-12 text-center text-sm text-[var(--color-muted)]">Ningún servicio con receta coincide con la búsqueda</p>
            ) : (
              <div className="space-y-5">
                {visibleCards.map((view, i) => (
                  <FamilyCard
                    key={view.family.family}
                    view={view}
                    index={i}
                    products={products}
                    productById={productById}
                    editing={editingFamily === view.family.family}
                    onEdit={() => setEditingFamily(view.family.family)}
                    onClose={() => setEditingFamily(null)}
                  />
                ))}
              </div>
            )}

            {!loading && withoutRecipe.length > 0 && (
              <section className="pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Sin receta</h3>
                <div className="flex flex-wrap gap-2">
                  {withoutRecipe.map(v => (
                    <button
                      key={v.family.family}
                      onClick={() => openFamily(v.family.family)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors"
                    >
                      <Plus size={11} /> {v.family.family}
                      {v.family.columns.length > 1 && <span className="text-[var(--color-border)]">· {v.family.columns.length} tallas</span>}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {activeTab === 'insumos' && (
          <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-baseline justify-between gap-4">
              <h2 className="text-base font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Insumos de las recetas</h2>
              <p className="text-xs text-[var(--color-muted)]">El costo sale del último lote comprado. El envase se edita acá con un clic.</p>
            </div>
            <Table<SupplyRow>
              columns={supplyColumns}
              data={supplyRows}
              keyField="id"
              loading={loading}
              paginate={false}
              emptyMessage="Ningún producto está en una receta todavía"
              renderExpanded={row => (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[var(--color-muted)]">
                      <th className="text-left font-semibold uppercase tracking-wider pb-1">Servicio</th>
                      <th className="text-right font-semibold uppercase tracking-wider pb-1">g / mL</th>
                      <th className="text-right font-semibold uppercase tracking-wider pb-1">Costo en el servicio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.uses.map(use => (
                      <tr key={use.service.id}>
                        <td className="py-1 text-[var(--color-text)]">
                          <button onClick={() => openFamily(use.family)} className="hover:text-[var(--color-accent)] transition-colors">
                            {use.service.name}
                          </button>
                        </td>
                        <td className="py-1 text-right tabular-nums text-[var(--color-text)]">{fmtGrams(use.quantity)}</td>
                        <td className="py-1 text-right tabular-nums text-[var(--color-muted)]">{use.cost == null ? '—' : formatMoney(use.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            />
          </section>
        )}
      </div>
    </div>
  )
}
