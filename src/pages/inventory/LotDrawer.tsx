import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { useInventoryLots } from '@/hooks/useInventoryLots'
import { useUpdateInventoryLot } from '@/hooks/useUpdateInventoryLot'
import type { Product, InventoryLot } from '@/types'

interface LotDrawerProps {
  product: Product | null
  onClose: () => void
}

interface EditingCell {
  lotId: string
  field: 'received_date' | 'initial_quantity' | 'remaining_quantity' | 'unit_cost' | 'notes'
}

function EditableCell({
  value,
  type,
  onCommit,
}: {
  value: string
  type: 'date' | 'number' | 'text'
  onCommit: (val: string) => void
}) {
  const [draft, setDraft] = useState(value)

  function handleBlur() {
    if (draft !== value) onCommit(draft)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setDraft(value)
      e.currentTarget.blur()
    }
  }

  return (
    <input
      type={type}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-full bg-transparent border-b border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-accent)] outline-none py-0.5 text-sm tabular-nums"
    />
  )
}

export function LotDrawer({ product, onClose }: LotDrawerProps) {
  const { data: lots = [], isLoading } = useInventoryLots(product?.id ?? null)
  const updateLot = useUpdateInventoryLot()
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)

  async function save(lot: InventoryLot, field: EditingCell['field'], rawValue: string) {
    setEditingCell(null)
    let parsed: string | number | null = rawValue
    if (field === 'initial_quantity' || field === 'remaining_quantity' || field === 'unit_cost') {
      parsed = parseFloat(rawValue)
      if (isNaN(parsed)) return
    }
    if (field === 'notes') {
      parsed = rawValue.trim() || null
    }
    const current = lot[field]
    if (parsed === current) return
    setSavingId(lot.id)
    try {
      await updateLot.mutateAsync({ id: lot.id, [field]: parsed })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title={product ? `Lotes — ${product.name}` : 'Lotes'}
      size="lg"
    >
      {isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando...</p>
      ) : lots.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No hay lotes registrados para este producto.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left pb-2 font-medium text-[var(--color-muted)]">Recibido</th>
                <th className="text-right pb-2 font-medium text-[var(--color-muted)]">Inicial</th>
                <th className="text-right pb-2 font-medium text-[var(--color-muted)]">Restante</th>
                <th className="text-right pb-2 font-medium text-[var(--color-muted)]">Costo unit.</th>
                <th className="pb-2 pl-3 text-left font-medium text-[var(--color-muted)]">Notas</th>
                <th className="pb-2 pl-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {lots.map(lot => (
                <tr key={lot.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-2 pr-4 text-[var(--color-muted)]">
                    {editingCell?.lotId === lot.id && editingCell.field === 'received_date' ? (
                      <EditableCell
                        value={lot.received_date}
                        type="date"
                        onCommit={v => save(lot, 'received_date', v)}
                      />
                    ) : (
                      <span
                        className="cursor-text hover:text-[var(--color-text)] transition-colors"
                        onClick={() => setEditingCell({ lotId: lot.id, field: 'received_date' })}
                      >
                        {lot.received_date}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {editingCell?.lotId === lot.id && editingCell.field === 'initial_quantity' ? (
                      <EditableCell
                        value={String(lot.initial_quantity)}
                        type="number"
                        onCommit={v => save(lot, 'initial_quantity', v)}
                      />
                    ) : (
                      <span
                        className="cursor-text hover:text-[var(--color-text)] transition-colors"
                        onClick={() => setEditingCell({ lotId: lot.id, field: 'initial_quantity' })}
                      >
                        {Number(lot.initial_quantity).toLocaleString('es-CO')}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums font-medium">
                    {editingCell?.lotId === lot.id && editingCell.field === 'remaining_quantity' ? (
                      <EditableCell
                        value={String(lot.remaining_quantity)}
                        type="number"
                        onCommit={v => save(lot, 'remaining_quantity', v)}
                      />
                    ) : (
                      <span
                        className="cursor-text hover:text-[var(--color-text)] transition-colors"
                        onClick={() => setEditingCell({ lotId: lot.id, field: 'remaining_quantity' })}
                      >
                        {Number(lot.remaining_quantity).toLocaleString('es-CO')}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {editingCell?.lotId === lot.id && editingCell.field === 'unit_cost' ? (
                      <EditableCell
                        value={String(lot.unit_cost)}
                        type="number"
                        onCommit={v => save(lot, 'unit_cost', v)}
                      />
                    ) : (
                      <span
                        className="cursor-text hover:text-[var(--color-text)] transition-colors"
                        onClick={() => setEditingCell({ lotId: lot.id, field: 'unit_cost' })}
                      >
                        ${Number(lot.unit_cost).toLocaleString('es-CO')}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 pl-3 text-[var(--color-muted)]">
                    {editingCell?.lotId === lot.id && editingCell.field === 'notes' ? (
                      <EditableCell
                        value={lot.notes ?? ''}
                        type="text"
                        onCommit={v => save(lot, 'notes', v)}
                      />
                    ) : (
                      <span
                        className="cursor-text hover:text-[var(--color-text)] transition-colors"
                        onClick={() => setEditingCell({ lotId: lot.id, field: 'notes' })}
                      >
                        {lot.notes || <span className="text-[var(--color-muted)] italic text-xs">—</span>}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pl-3">
                    {savingId === lot.id ? (
                      <span className="text-xs text-[var(--color-muted)]">Guardando…</span>
                    ) : Number(lot.remaining_quantity) === 0 ? (
                      <Badge variant="default">Agotado</Badge>
                    ) : (
                      <Badge variant="success">Disponible</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
