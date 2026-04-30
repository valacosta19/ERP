import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useProducts } from '@/hooks/useProducts'
import { useProfessionals } from '@/hooks/useProfessionals'
import { useCreateStaffWithdrawal } from '@/hooks/useStaffReceivables'

interface Props {
  open: boolean
  onClose: () => void
  initialProductId?: string | null
}

type Preset = 'cost' | 'sale' | 'manual'

export function StaffWithdrawalModal({ open, onClose, initialProductId }: Props) {
  const { data: products = [] } = useProducts()
  const { data: professionals = [] } = useProfessionals()
  const createWithdrawal = useCreateStaffWithdrawal()

  const [hairdresserId, setHairdresserId] = useState('')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [preset, setPreset] = useState<Preset>('cost')
  const [valueAmount, setValueAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setHairdresserId('')
    setProductId(initialProductId ?? '')
    setQuantity('1')
    setPreset('cost')
    setValueAmount('')
    setDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setError(null)
  }, [open, initialProductId])

  const product = useMemo(() => products.find(p => p.id === productId) ?? null, [products, productId])

  const presetValue = useMemo(() => {
    if (!product) return 0
    const qty = Number(quantity) || 0
    if (preset === 'cost') return Math.round((product.min_cost ?? 0) * qty * 100) / 100
    if (preset === 'sale') return Math.round(product.sale_price * qty * 100) / 100
    return Number(valueAmount) || 0
  }, [product, preset, quantity, valueAmount])

  const productOptions = useMemo(
    () => products
      .filter(p => (p.stock ?? 0) > 0)
      .map(p => ({ value: p.id, label: `${p.name}${p.brand ? ` · ${p.brand}` : ''} (${(p.stock ?? 0).toLocaleString('es-CO')} ${p.unit ?? 'u'})` })),
    [products],
  )

  const staffOptions = useMemo(
    () => professionals.filter(s => s.active).map(s => ({ value: s.id, label: s.name })),
    [professionals],
  )

  async function handleSubmit() {
    setError(null)
    const qty = Number(quantity)
    if (!hairdresserId) return setError('Seleccioná un empleado.')
    if (!productId) return setError('Seleccioná un producto.')
    if (!qty || qty <= 0) return setError('La cantidad debe ser mayor que cero.')
    if (product && (product.stock ?? 0) < qty) return setError('Stock insuficiente para esa cantidad.')
    if (presetValue < 0) return setError('El valor no puede ser negativo.')

    try {
      await createWithdrawal.mutateAsync({
        hairdresser_id: hairdresserId,
        product_id: productId,
        quantity: qty,
        value_amount: presetValue,
        due_date: date,
        notes: notes.trim() || null,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar el retiro')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar retiro de producto" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-muted)]">
          El producto se descuenta del inventario y queda como deuda del empleado. No genera movimiento de caja ni banco.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Empleado"
            value={hairdresserId}
            onChange={e => setHairdresserId(e.target.value)}
            options={staffOptions}
            placeholder="Seleccionar..."
          />
          <Input
            label="Fecha"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        <Select
          label="Producto"
          value={productId}
          onChange={e => setProductId(e.target.value)}
          options={productOptions}
          placeholder="Seleccionar..."
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label={`Cantidad${product?.unit ? ` (${product.unit})` : ''}`}
            type="number"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            min="0.01"
            step="0.01"
          />
          <div>
            <label className="text-sm font-medium text-[var(--color-text)] block mb-1.5">Valor a descontar</label>
            <div className="flex gap-1 mb-2">
              <button
                type="button"
                onClick={() => setPreset('cost')}
                className={`text-xs px-2 py-1 rounded-md border ${preset === 'cost' ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-muted)]'}`}
              >
                Costo
              </button>
              <button
                type="button"
                onClick={() => setPreset('sale')}
                className={`text-xs px-2 py-1 rounded-md border ${preset === 'sale' ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-muted)]'}`}
              >
                Precio venta
              </button>
              <button
                type="button"
                onClick={() => setPreset('manual')}
                className={`text-xs px-2 py-1 rounded-md border ${preset === 'manual' ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-muted)]'}`}
              >
                Manual
              </button>
            </div>
            {preset === 'manual' ? (
              <Input
                type="number"
                value={valueAmount}
                onChange={e => setValueAmount(e.target.value)}
                prefix="$"
                placeholder="0"
              />
            ) : (
              <div className="h-9 px-3 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center text-sm tabular-nums text-[var(--color-text)]">
                ${presetValue.toLocaleString('es-CO')}
              </div>
            )}
          </div>
        </div>

        <Input
          label="Notas"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Opcional"
        />

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={createWithdrawal.isPending}>
            Registrar retiro
          </Button>
        </div>
      </div>
    </Modal>
  )
}
