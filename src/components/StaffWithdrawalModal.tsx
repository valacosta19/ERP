import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useProducts } from '@/hooks/useProducts'
import { useProfessionals } from '@/hooks/useProfessionals'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useTransactionCategories } from '@/hooks/useTransactionCategories'
import { useFunnelSubmit } from '@/components/transactions/QuickFunnel/funnelSubmit'
import { enqueueTicket } from '@/components/transactions/QuickFunnel/offlineQueue'
import type { Currency } from '@/types'
import type { TicketPayload } from '@/components/transactions/QuickFunnel/funnelSubmit'
import { todayLocal } from '@/lib/dateRange'

interface Props {
  open: boolean
  onClose: () => void
  mode: 'withdrawal' | 'advance'
  initialProductId?: string | null
}

type Preset = 'cost' | 'sale' | 'manual'

export function StaffWithdrawalModal({ open, onClose, mode, initialProductId }: Props) {
  const productsQuery = useProducts()
  const professionalsQuery = useProfessionals()
  const paymentMethodsQuery = usePaymentMethods()
  const categoriesQuery = useTransactionCategories()
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data])
  const professionals = useMemo(() => professionalsQuery.data ?? [], [professionalsQuery.data])
  const paymentMethodsData = useMemo(() => paymentMethodsQuery.data ?? [], [paymentMethodsQuery.data])
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const listQueries = [productsQuery, professionalsQuery, paymentMethodsQuery, categoriesQuery]
  const listsLoading = listQueries.some(q => q.isLoading)
  const listsError = listQueries.find(q => q.error)?.error?.message ?? null
  const { submitTicket } = useFunnelSubmit()

  const [hairdresserId, setHairdresserId] = useState('')
  const [date, setDate] = useState(() => todayLocal())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [preset, setPreset] = useState<Preset>('cost')
  const [manualValue, setManualValue] = useState('')

  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceCurrency, setAdvanceCurrency] = useState<Currency>('ARS')
  const [paymentMethod, setPaymentMethod] = useState('')

  useEffect(() => {
    if (!open) return
    setHairdresserId('')
    setDate(todayLocal())
    setNotes('')
    setError(null)
    setLoading(false)
    setProductId(initialProductId ?? '')
    setQuantity('1')
    setPreset('cost')
    setManualValue('')
    setAdvanceAmount('')
    setAdvanceCurrency('ARS')
    setPaymentMethod(paymentMethodsData.find(m => m.active)?.name ?? '')
  }, [open, initialProductId, paymentMethodsData])

  const product = useMemo(() => products.find(p => p.id === productId) ?? null, [products, productId])

  const presetValue = useMemo(() => {
    if (!product) return 0
    const qty = Number(quantity) || 0
    if (preset === 'cost') return Math.round((product.min_cost ?? 0) * qty * 100) / 100
    if (preset === 'sale') return Math.round(product.sale_price * qty * 100) / 100
    return Number(manualValue) || 0
  }, [product, preset, quantity, manualValue])

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

  const activePaymentMethods = useMemo(
    () => paymentMethodsData.filter(m => m.active).map(m => ({ value: m.name, label: m.name })),
    [paymentMethodsData],
  )

  const advanceSubcategoryId = useMemo(
    () => categories.find(c => c.name === 'Adelantos de personal')?.id ?? null,
    [categories],
  )

  async function handleSubmit() {
    setError(null)

    if (!hairdresserId) return setError('Seleccioná un empleado.')

    let payload: TicketPayload

    if (mode === 'withdrawal') {
      const qty = Number(quantity)
      if (!productId) return setError('Seleccioná un producto.')
      if (!qty || qty <= 0) return setError('La cantidad debe ser mayor que cero.')
      if (product && (product.stock ?? 0) < qty) return setError('Stock insuficiente para esa cantidad.')
      if (presetValue < 0) return setError('El valor no puede ser negativo.')

      payload = {
        date,
        currency: 'ARS',
        group_label: null,
        units: [{
          client_uuid: crypto.randomUUID(),
          kind: 'staff_withdrawal',
          transaction_type: 'transfer',
          description: null,
          catalog_item_id: null,
          product_id: productId,
          product_qty: 0,
          unit_sale_price: 0,
          subcategory_id: null,
          subcategory_name: null,
          professionals: [],
          sena_amount: null,
          payments: [],
          hairdresser_id: hairdresserId,
          staff_quantity: qty,
          value_amount: presetValue,
          due_date: date,
          notes: notes.trim() || null,
        }],
      }
    } else {
      const amt = Number(advanceAmount)
      if (!amt || amt <= 0) return setError('El monto debe ser mayor que cero.')
      if (!paymentMethod) return setError('Seleccioná un método de pago.')
      if (!advanceSubcategoryId) return setError('Falta la categoría "Adelantos de personal". Contactá al administrador.')

      payload = {
        date,
        currency: advanceCurrency,
        group_label: null,
        units: [{
          client_uuid: crypto.randomUUID(),
          kind: 'staff_advance',
          transaction_type: 'transfer',
          description: null,
          catalog_item_id: null,
          product_id: null,
          product_qty: 0,
          unit_sale_price: 0,
          subcategory_id: advanceSubcategoryId,
          subcategory_name: null,
          professionals: [],
          sena_amount: null,
          transfer_direction: 'salida',
          payments: [{ payment_method: paymentMethod, instrument: null, amount: amt }],
          hairdresser_id: hairdresserId,
          value_amount: amt,
          notes: notes.trim() || null,
        }],
      }
    }

    setLoading(true)
    try {
      if (!navigator.onLine) {
        enqueueTicket(payload)
        onClose()
        return
      }
      await submitTicket(payload)
      onClose()
    } catch (e) {
      const msg = (e as Error).message || ''
      const networkish = !navigator.onLine || /fetch|network|failed to fetch|load failed|timeout/i.test(msg)
      if (networkish) {
        enqueueTicket(payload)
        onClose()
      } else {
        setError(msg || 'Error al registrar')
      }
    } finally {
      setLoading(false)
    }
  }

  const title = mode === 'withdrawal' ? 'Registrar retiro de producto' : 'Registrar adelanto de sueldo'
  const submitLabel = mode === 'withdrawal' ? 'Registrar retiro' : 'Registrar adelanto'

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      {listsLoading ? (
        <div className="py-8 text-center">
          <span className="inline-block w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
      <div className="space-y-4">
        {listsError && <p className="text-sm text-[var(--color-danger)]">{listsError}</p>}
        <p className="text-sm text-[var(--color-muted)]">
          {mode === 'withdrawal'
            ? 'El producto se descuenta del inventario y queda como deuda del empleado. No genera movimiento de caja ni banco.'
            : 'Sale de caja como movimiento (no es gasto) y queda como deuda del empleado. Se descuenta al liquidar la comisión.'}
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

        {mode === 'withdrawal' && (
          <>
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
                  {(['cost', 'sale', 'manual'] as Preset[]).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPreset(p)}
                      className={`text-xs px-2 py-1 rounded-md border ${preset === p ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-muted)]'}`}
                    >
                      {p === 'cost' ? 'Costo' : p === 'sale' ? 'Precio venta' : 'Manual'}
                    </button>
                  ))}
                </div>
                {preset === 'manual' ? (
                  <Input
                    type="number"
                    value={manualValue}
                    onChange={e => setManualValue(e.target.value)}
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
          </>
        )}

        {mode === 'advance' && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Monto"
              type="number"
              value={advanceAmount}
              onChange={e => setAdvanceAmount(e.target.value)}
              min="0.01"
              step="0.01"
              prefix="$"
              placeholder="0"
            />
            <Select
              label="Moneda"
              value={advanceCurrency}
              onChange={e => setAdvanceCurrency(e.target.value as Currency)}
              options={[
                { value: 'ARS', label: 'ARS' },
                { value: 'USD', label: 'USD' },
                { value: 'EUR', label: 'EUR' },
              ]}
            />
            <Select
              label="Método de pago"
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
              options={activePaymentMethods}
              placeholder="Seleccionar..."
            />
          </div>
        )}

        <Input
          label="Notas"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Opcional"
        />

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={loading}>
            {submitLabel}
          </Button>
        </div>
      </div>
      )}
    </Modal>
  )
}
