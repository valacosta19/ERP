import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { supabase } from '@/lib/supabaseClient'
import { useProducts } from '@/hooks/useProducts'
import { useTransactionCategories } from '@/hooks/useTransactionCategories'
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
  const [rows, setRows] = useState<UnlinkedTx[] | null>(null)
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const { data: products = [], isLoading: productsLoading, error: productsError } = useProducts()
  const { data: catalogItems = [], isLoading: catalogLoading, error: catalogError } = useCatalogItems()
  const { data: txCategories = [], isLoading: categoriesLoading, error: categoriesError } = useTransactionCategories()
  const listsLoading = productsLoading || catalogLoading || categoriesLoading
  const listsError = (productsError ?? catalogError ?? categoriesError)?.message ?? null
  const queryClient = useQueryClient()

  const productoCatId = txCategories.find(c => c.name.toLowerCase() === 'producto')?.id ?? null

  async function fetchUnlinked(): Promise<UnlinkedTx[]> {
    const { data: incomeSubcats, error: subcatError } = await supabase
      .from('transaction_categories')
      .select('id')
      .eq('transaction_type', 'income')
    if (subcatError) throw new Error(subcatError.message)

    const { data, error } = await supabase
      .from('transactions')
      .select('id, date, description, amount, sale_items(id)')
      .in('subcategory_id', (incomeSubcats ?? []).map(s => s.id))
      .order('date', { ascending: false })
    if (error) throw new Error(error.message)
    return ((data as unknown as (UnlinkedTx & { sale_items: { id: string }[] })[]) ?? [])
      .filter(t => t.sale_items.length === 0)
      .map(t => ({ id: t.id, date: t.date, description: t.description, amount: Number(t.amount) }))
  }

  function applyUnlinked(unlinked: UnlinkedTx[]) {
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
  }

  useEffect(() => {
    if (!open || listsLoading) return
    void fetchUnlinked().then(unlinked => {
      setErrors([])
      applyUnlinked(unlinked)
    })
  }, [open, listsLoading])

  async function handleRun() {
    const mapped = Object.entries(mappings).filter(([, val]) => val)
    if (!mapped.length) return
    setRunning(true)
    setErrors([])
    const errs: string[] = []

    for (const [txId, val] of mapped) {
      const tx = rows?.find(r => r.id === txId)
      if (!tx) continue
      const [kind] = val.split(':')

      if (kind === 'service') {
        const subcatId = txCategories.find(c => c.name.toLowerCase() === 'servicio')?.id ?? null
        if (subcatId) {
          const { error } = await supabase.from('transactions').update({ subcategory_id: subcatId }).eq('id', txId)
          if (error) errs.push(`${formatDate(tx.date)} "${tx.description ?? ''}": ${error.message}`)
        }
      } else {
        if (!productoCatId) continue
        const { error } = await supabase
          .from('transactions')
          .update({ subcategory_id: productoCatId })
          .eq('id', txId)
        if (error) errs.push(`${formatDate(tx.date)} "${tx.description ?? ''}": ${error.message}`)
      }
    }

    setErrors(errs)
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['reports'] })
    queryClient.invalidateQueries({ queryKey: ['products'] })
    applyUnlinked(await fetchUnlinked())
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
      {listsError ? (
        <div className="py-8 text-center text-sm text-[var(--color-danger)]">{listsError}</div>
      ) : listsLoading || rows === null ? (
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
