import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { supabase } from '@/lib/supabaseClient'
import { useProducts } from '@/hooks/useProducts'
import { useCategories } from '@/hooks/useCategories'
import { useCatalogItems } from '@/hooks/useCatalogItems'
import { useQueryClient } from '@tanstack/react-query'
import { formatDate } from '@/lib/formatDate'

type UnlinkedTx = {
  id: string
  date: string
  description: string | null
  amount: number
}

interface Props {
  open: boolean
  onClose: () => void
}

export function ReconcileModal({ open, onClose }: Props) {
  const [rows, setRows] = useState<UnlinkedTx[]>([])
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const { data: products = [] } = useProducts()
  const { data: catalogItems = [] } = useCatalogItems()
  const { data: categories = [] } = useCategories()
  const queryClient = useQueryClient()

  const productoCatId = categories.find(c => c.name.toLowerCase() === 'producto')?.id ?? null

  useEffect(() => {
    if (!open) return
    setMappings({})
    setErrors([])
    loadUnlinked()
  }, [open])

  async function loadUnlinked() {
    setLoading(true)
    const { data, error } = await supabase
      .from('transactions')
      .select('id, date, description, amount, sale_items(id)')
      .eq('type', 'income')
      .order('date', { ascending: false })
    if (error) throw new Error(error.message)
    const unlinked = ((data as unknown as (UnlinkedTx & { sale_items: { id: string }[] })[]) ?? [])
      .filter(t => t.sale_items.length === 0)
      .map(({ sale_items: _si, ...t }) => ({ ...t, amount: Number(t.amount) }))
    setRows(unlinked)

    const autoMappings: Record<string, string> = {}
    for (const tx of unlinked) {
      if (!tx.description) continue
      const desc = tx.description.toLowerCase()
      const matchedProduct = products.find(p => p.name.toLowerCase() === desc)
      if (matchedProduct) { autoMappings[tx.id] = `product:${matchedProduct.id}`; continue }
      const matchedService = catalogItems.find(s => s.name.toLowerCase() === desc)
      if (matchedService) autoMappings[tx.id] = `service:${matchedService.id}`
    }
    setMappings(autoMappings)
    setLoading(false)
  }

  async function handleRun() {
    const mapped = Object.entries(mappings).filter(([, val]) => val)
    if (!mapped.length) return
    setRunning(true)
    setErrors([])
    const errs: string[] = []

    for (const [txId, val] of mapped) {
      const tx = rows.find(r => r.id === txId)!
      const [kind, itemId] = val.split(':')

      if (kind === 'service') {
        const svc = catalogItems.find(c => c.id === itemId)
        const catId = svc?.category_id ?? null
        if (catId) {
          const { error } = await supabase.from('transactions').update({ category_id: catId }).eq('id', txId)
          if (error) errs.push(`${formatDate(tx.date)} "${tx.description ?? ''}": ${error.message}`)
        }
      } else {
        if (!productoCatId) continue
        const { error } = await supabase
          .from('transactions')
          .update({ category_id: productoCatId })
          .eq('id', txId)
        if (error) errs.push(`${formatDate(tx.date)} "${tx.description ?? ''}": ${error.message}`)
      }
    }

    setErrors(errs)
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['reports'] })
    queryClient.invalidateQueries({ queryKey: ['products'] })
    await loadUnlinked()
    setMappings({})
    setRunning(false)
  }

  const selectOptions = [
    { value: '', label: '— sin asignar —' },
    { value: '__sep_products__', label: '── Productos ──', disabled: true } as unknown as { value: string; label: string },
    ...products.map(p => ({
      value: `product:${p.id}`,
      label: p.unit ? `${p.name} (${p.unit})` : p.name,
    })),
    { value: '__sep_services__', label: '── Servicios ──', disabled: true } as unknown as { value: string; label: string },
    ...catalogItems.map(s => ({
      value: `service:${s.id}`,
      label: s.name,
    })),
  ]

  return (
    <Modal open={open} onClose={onClose} title="Reconciliar transacciones" size="xl">
      {loading ? (
        <div className="py-8 text-center text-sm text-[var(--color-muted)]">Cargando...</div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--color-muted)]">
          No hay transacciones de ingreso sin vincular.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--color-muted)]">
            Asigná producto o servicio a cada transacción. Productos ejecutan FIFO y descuentan stock.
            Servicios solo actualizan la categoría.
          </p>
          <div className="flex flex-col divide-y divide-[var(--color-border)] max-h-[55vh] overflow-y-auto">
            {rows.map(row => (
              <div key={row.id} className="grid grid-cols-[8rem_1fr_8rem] gap-x-3 gap-y-1.5 py-2.5 text-sm">
                <span className="text-[var(--color-muted)] whitespace-nowrap">{formatDate(row.date)}</span>
                <span className="text-[var(--color-text)] break-words">{row.description ?? '—'}</span>
                <span className="text-right tabular-nums text-[var(--color-muted)]">
                  ${row.amount.toLocaleString('es-CO')}
                </span>
                <div className="col-span-3">
                  <Select
                    value={mappings[row.id] ?? ''}
                    onChange={e => setMappings(m => ({ ...m, [row.id]: e.target.value }))}
                    options={selectOptions}
                  />
                </div>
              </div>
            ))}
          </div>
          {errors.length > 0 && (
            <ul className="text-xs text-[var(--color-danger)] space-y-1">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={running}>Cerrar</Button>
            <Button
              onClick={handleRun}
              disabled={running || !Object.values(mappings).some(Boolean)}
            >
              {running ? 'Procesando...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
