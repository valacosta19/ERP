import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { X, Check, CalendarDays, ChevronDown } from 'lucide-react'
import { formatDate } from '@/lib/formatDate'
import { DescriptionCombobox, type Suggestion, type DescriptionComboboxHandle } from './DescriptionCombobox'
import { ProductCombobox, type ProductComboboxHandle } from './ProductCombobox'
import {
  type TransactionDraft,
  makeEmptyPayment,
  calcTotal,
  CURRENCY_SYMBOL,
  CURRENCY_OPTIONS,
  INSTRUMENT_OPTIONS,
} from './transactionDraft'
import type { Currency, PaymentMethod, PaymentInstrument, TransactionCategory, Professional, Product } from '@/types'

export type TransactionQuickFormHandle = {
  focusFirstField: () => void
}

type Anticipo = { id: string; date: string; amount: number; currency: string; subcategory_id: string | null }
type ErrorField = 'date' | 'amount' | 'inventory' | null

type Props = {
  draft: TransactionDraft
  setDraft: React.Dispatch<React.SetStateAction<TransactionDraft | null>>
  parents: TransactionCategory[]
  subcategories: TransactionCategory[]
  txCategories: TransactionCategory[]
  professionals: Professional[]
  products: Product[]
  paymentMethodOptions: { value: string; label: string }[]
  unrefundedAnticipos: Anticipo[]
  draftSuggestions: Suggestion[]
  draftSelectedSuggestion: Suggestion | null
  onSuggestionSelect: (s: Suggestion) => void
  onDescriptionChange: (v: string) => void
  onProductChange: (productId: string | null, product: Product | null) => void
  onInventoryProductChange: (index: number, productId: string) => void
  onInventoryQuantityChange: (index: number, quantity: number) => void
  computeInventoryTotal: (items: Array<{ product_id: string; quantity: number }>) => number
  getFifoCost: (productId: string) => number
  formError: string
  formErrorField: ErrorField
  onSubmit: () => void
  onCancel: () => void
  submitting: boolean
  showSavedBanner: boolean
  productLabel: (p: Product) => string
  isInventoryCategory: boolean
  isServiceCategory: boolean
  isProductCategory: boolean
  isTransfer: boolean
}

export const TransactionQuickForm = forwardRef<TransactionQuickFormHandle, Props>(function TransactionQuickForm(
  props,
  ref,
) {
  const {
    draft, setDraft, parents, subcategories, txCategories, professionals, products,
    paymentMethodOptions, unrefundedAnticipos, draftSuggestions, draftSelectedSuggestion,
    onSuggestionSelect, onDescriptionChange, onProductChange, onInventoryProductChange, onInventoryQuantityChange,
    computeInventoryTotal, getFifoCost, formError, formErrorField, onSubmit, onCancel, submitting, showSavedBanner,
    productLabel, isInventoryCategory, isServiceCategory, isProductCategory, isTransfer,
  } = props

  const comboRef = useRef<DescriptionComboboxHandle>(null)
  const productComboRef = useRef<ProductComboboxHandle>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const todayISO = new Date().toISOString().slice(0, 10)
  const [dateExpanded, setDateExpanded] = useState(false)

  useImperativeHandle(ref, () => ({
    focusFirstField: () => isProductCategory ? productComboRef.current?.focus() : comboRef.current?.focus(),
  }))

  const selectedProduct = isProductCategory && draft.product_id ? products.find(p => p.id === draft.product_id) ?? null : null
  const selectedProductNoStock = !!selectedProduct && (selectedProduct.stock ?? 0) <= 0

  useEffect(() => {
    const t = setTimeout(() => comboRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault()
    onSubmit()
  }

  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement
      if (target.tagName === 'TEXTAREA') return
      const inCombobox = target.closest('[data-combobox-open="true"]')
      if (inCombobox) return
      e.preventDefault()
      handleSubmit()
    }
  }

  const typeIndicator = parents.find(p => p.id === draft.category_parent_id)
  const typeKey = typeIndicator?.name === 'Ingresos' ? 'income' : typeIndicator?.name === 'Movimientos' ? 'transfer' : 'expense'
  const typeColor = typeKey === 'income' ? 'var(--color-success)' : typeKey === 'transfer' ? 'var(--color-muted)' : 'var(--color-danger)'
  const typeLabel = typeKey === 'income' ? 'Ingreso' : typeKey === 'transfer' ? 'Movimiento' : 'Egreso'

  const activeProfessionals = professionals.filter(h => h.active)
  const total = isInventoryCategory ? computeInventoryTotal(draft.inventory_items) : calcTotal(draft.payments)

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onKeyDown={handleFormKeyDown}
      noValidate
      className="space-y-5"
    >
      {showSavedBanner && (
        <div
          role="status"
          className="rounded-lg flex items-center gap-2"
          style={{
            background: 'var(--color-success-light)',
            color: 'var(--color-success)',
            padding: '10px 14px',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          <Check size={16} />
          Transacción guardada
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {parents.map(p => {
          const active = draft.category_parent_id === p.id
          return (
            <button
              key={p.id}
              type="button"
              tabIndex={-1}
              onClick={() => setDraft(d => d && { ...d, category_parent_id: p.id, subcategory_id: '' })}
              className="transition-all"
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                padding: '6px 14px',
                borderRadius: '999px',
                border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                background: active ? 'var(--color-accent)' : 'transparent',
                color: active ? '#fff' : 'var(--color-muted)',
                cursor: 'pointer',
                letterSpacing: '0.01em',
              }}
            >
              {p.name}
            </button>
          )
        })}
        <span
          className="ml-auto tabular-nums"
          style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: typeColor,
          }}
        >
          {typeLabel}
        </span>
      </div>

      <FieldBlock label="Fecha">
        {!dateExpanded && draft.date === todayISO ? (
          <button
            type="button"
            onClick={() => setDateExpanded(true)}
            style={{
              ...inputStyle,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              color: 'var(--color-text)',
              textAlign: 'left',
            }}
          >
            <CalendarDays size={14} style={{ color: 'var(--color-muted)' }} />
            <span>Hoy</span>
            <span style={{ marginLeft: '8px', color: 'var(--color-muted)', fontSize: '0.8125rem' }}>{formatDate(todayISO)}</span>
            <ChevronDown size={14} style={{ marginLeft: 'auto', color: 'var(--color-muted)' }} />
          </button>
        ) : (
          <input
            type="date"
            value={draft.date}
            onChange={e => setDraft(d => d && { ...d, date: e.target.value })}
            style={{ ...inputStyle, ...(formErrorField === 'date' ? errorInputStyle : {}) }}
            aria-invalid={formErrorField === 'date'}
          />
        )}
        {formErrorField === 'date' && <ErrorMessage>{formError}</ErrorMessage>}
      </FieldBlock>

      {draft.category_parent_id && (
        <FieldBlock label="Subcategoría">
          <select
            value={draft.subcategory_id}
            onChange={e => setDraft(d => d && { ...d, subcategory_id: e.target.value, product_id: null, product_quantity: 1, inventory_items: [] })}
            style={inputStyle}
          >
            <option value="">Seleccionar...</option>
            {subcategories.filter(c => c.parent_id === draft.category_parent_id).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </FieldBlock>
      )}

      {isProductCategory ? (
        <FieldBlock label="Producto">
          <ProductCombobox
            ref={productComboRef}
            value={draft.product_id}
            onChange={onProductChange}
            products={products}
            productLabel={productLabel}
            placeholder="Buscar producto"
            ariaLabel="Producto"
          />
          {selectedProductNoStock && (
            <div
              role="status"
              style={{ marginTop: '8px', fontSize: '0.8125rem', color: 'var(--color-warning)' }}
            >
              Este producto no tiene stock. Se registrará y quedará pendiente de descuento.
            </div>
          )}
          {formErrorField === 'amount' && !draft.product_id && <ErrorMessage>{formError}</ErrorMessage>}
        </FieldBlock>
      ) : (
        <FieldBlock label="Descripción">
          <DescriptionCombobox
            ref={comboRef}
            value={draft.description}
            onChange={onDescriptionChange}
            onSelect={onSuggestionSelect}
            suggestions={draftSuggestions}
            placeholder="Buscar servicio o describir transacción"
            ariaLabel="Descripción"
          />
          {draftSelectedSuggestion && (draftSelectedSuggestion.priceCash > 0 || draftSelectedSuggestion.priceTransfer != null || draftSelectedSuggestion.priceCard != null) && (
            <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Precios:</span>
              {draftSelectedSuggestion.priceCash > 0 && (
                <PricePill amount={draftSelectedSuggestion.priceCash} label="Efectivo" onClick={() => setDraft(d => d && { ...d, payments: d.payments.map((p, i) => i === 0 ? { ...p, amount: draftSelectedSuggestion.priceCash } : p) })} />
              )}
              {draftSelectedSuggestion.priceTransfer != null && (
                <PricePill amount={draftSelectedSuggestion.priceTransfer} label="Transfer." onClick={() => setDraft(d => d && { ...d, payments: d.payments.map((p, i) => i === 0 ? { ...p, amount: draftSelectedSuggestion.priceTransfer! } : p) })} />
              )}
              {draftSelectedSuggestion.priceCard != null && (
                <PricePill amount={draftSelectedSuggestion.priceCard} label="Tarjeta" onClick={() => setDraft(d => d && { ...d, payments: d.payments.map((p, i) => i === 0 ? { ...p, amount: draftSelectedSuggestion.priceCard! } : p) })} />
              )}
            </div>
          )}
        </FieldBlock>
      )}

      {isTransfer && (
        <FieldBlock label="Dirección">
          <select
            value={draft.transfer_direction}
            onChange={e => setDraft(d => d && { ...d, transfer_direction: e.target.value as 'entrada' | 'salida' })}
            style={inputStyle}
          >
            <option value="entrada">Entrada</option>
            <option value="salida">Salida</option>
          </select>
        </FieldBlock>
      )}

      {isProductCategory && draft.product_id && (
        <FieldBlock label="Cantidad">
          <input
            type="number"
            min="1"
            step="1"
            value={draft.product_quantity}
            onChange={e => setDraft(d => d && { ...d, product_quantity: Math.max(1, parseInt(e.target.value) || 1) })}
            style={inputStyle}
            placeholder="1"
          />
        </FieldBlock>
      )}

      {isInventoryCategory && (
        <FieldBlock
          label="Productos a descontar"
          action={(
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setDraft(d => d && { ...d, inventory_items: [...d.inventory_items, { product_id: '', quantity: 1 }] })}
              style={addLinkStyle}
            >
              + Agregar
            </button>
          )}
        >
          {draft.inventory_items.length === 0 && <p style={mutedTextStyle}>Agregá al menos un producto.</p>}
          <div className="space-y-2">
            {draft.inventory_items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={item.product_id}
                  onChange={e => onInventoryProductChange(i, e.target.value)}
                  style={{ ...inputStyle, flex: 1, ...(formErrorField === 'inventory' ? errorInputStyle : {}) }}
                >
                  <option value="">— producto —</option>
                  {products.map((p: Product) => (
                    <option key={p.id} value={p.id}>{productLabel(p)}{(p.stock ?? 0) <= 0 ? ' (sin stock)' : ''}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={item.quantity}
                  onChange={e => onInventoryQuantityChange(i, Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ ...inputStyle, width: '80px', textAlign: 'right' }}
                  placeholder="Cant."
                />
                {item.product_id && getFifoCost(item.product_id) > 0 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                    ${(getFifoCost(item.product_id) * item.quantity).toLocaleString('es-CO')}
                  </span>
                )}
                {item.product_id && (products.find(p => p.id === item.product_id)?.stock ?? 0) <= 0 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-warning)', whiteSpace: 'nowrap' }}>
                    sin stock
                  </span>
                )}
                <IconButton onClick={() => setDraft(d => {
                  if (!d) return d
                  const items = d.inventory_items.filter((_, ii) => ii !== i)
                  const t = items.reduce((sum, it) => sum + getFifoCost(it.product_id) * it.quantity, 0)
                  return { ...d, inventory_items: items, payments: [{ payment_method: 'Inventario', instrument: null, amount: t }] }
                })} />
              </div>
            ))}
          </div>
          {formErrorField === 'inventory' && <ErrorMessage>{formError}</ErrorMessage>}
        </FieldBlock>
      )}

      {!isInventoryCategory && (
        <FieldBlock
          label={draft.payments.length > 1 ? 'Pagos' : 'Pago'}
          action={(
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setDraft(d => d && { ...d, payments: [...d.payments, makeEmptyPayment()] })}
              style={addLinkStyle}
            >
              + Agregar
            </button>
          )}
        >
          <div className="space-y-2">
            {draft.payments.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={p.payment_method}
                  onChange={e => setDraft(d => d && { ...d, payments: d.payments.map((pp, ii) => ii === i ? { ...pp, payment_method: e.target.value as PaymentMethod } : pp) })}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  {paymentMethodOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select
                  value={p.instrument ?? ''}
                  onChange={e => setDraft(d => d && { ...d, payments: d.payments.map((pp, ii) => ii === i ? { ...pp, instrument: (e.target.value as PaymentInstrument) || null } : pp) })}
                  style={{ ...inputStyle, width: '120px' }}
                >
                  {INSTRUMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {i === 0 ? (
                  <select
                    value={draft.currency}
                    onChange={e => setDraft(d => d && { ...d, currency: e.target.value as Currency })}
                    style={{ ...inputStyle, width: '78px' }}
                    aria-label="Moneda"
                  >
                    {CURRENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <span
                    style={{
                      width: '78px',
                      textAlign: 'center',
                      fontSize: '0.8125rem',
                      color: 'var(--color-muted)',
                      fontWeight: 500,
                    }}
                  >
                    {CURRENCY_SYMBOL[draft.currency]}
                  </span>
                )}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={p.amount === 0 ? '' : String(p.amount)}
                  onChange={e => setDraft(d => d && { ...d, payments: d.payments.map((pp, ii) => ii === i ? { ...pp, amount: parseFloat(e.target.value) || 0 } : pp) })}
                  placeholder="0"
                  style={{ ...inputStyle, width: '120px', textAlign: 'right', ...(formErrorField === 'amount' ? errorInputStyle : {}) }}
                  aria-invalid={formErrorField === 'amount'}
                />
                {draft.payments.length > 1 && <IconButton onClick={() => setDraft(d => d && { ...d, payments: d.payments.filter((_, ii) => ii !== i) })} />}
              </div>
            ))}
          </div>
          {formErrorField === 'amount' && <ErrorMessage>{formError}</ErrorMessage>}
        </FieldBlock>
      )}

      {isServiceCategory && (
        <FieldBlock
          label="Profesionales"
          action={activeProfessionals.length > 0 ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setDraft(d => d && { ...d, professionals: [...d.professionals, { id: activeProfessionals[0].id, commission_rate: 0 }] })}
              style={addLinkStyle}
            >
              + Agregar
            </button>
          ) : null}
        >
          {draft.professionals.length === 0 && <p style={mutedTextStyle}>Sin profesionales asignados.</p>}
          <div className="space-y-2">
            {draft.professionals.map((pa, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={pa.id}
                  onChange={e => setDraft(d => d && { ...d, professionals: d.professionals.map((p, ii) => ii === i ? { ...p, id: e.target.value } : p) })}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  {activeProfessionals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
                <div style={{ position: 'relative', width: '90px' }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={pa.commission_rate === 0 ? '' : String(pa.commission_rate)}
                    onChange={e => setDraft(d => d && { ...d, professionals: d.professionals.map((p, ii) => ii === i ? { ...p, commission_rate: parseFloat(e.target.value) || 0 } : p) })}
                    placeholder="0"
                    style={{ ...inputStyle, paddingRight: '26px', textAlign: 'right', width: '100%' }}
                  />
                  <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8125rem', color: 'var(--color-muted)' }}>%</span>
                </div>
                <IconButton onClick={() => setDraft(d => d && { ...d, professionals: d.professionals.filter((_, ii) => ii !== i) })} />
              </div>
            ))}
          </div>
        </FieldBlock>
      )}

      {isServiceCategory && draft.description.trim().toLowerCase() !== 'anticipo' && draft.description.trim().toLowerCase() !== 'devolución de anticipo' && (
        <FieldBlock label="Anticipo cobrado previamente">
          <div style={{ position: 'relative', width: '100%' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.875rem', color: 'var(--color-muted)' }}>$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.seña_amount}
              onChange={e => setDraft(d => d && { ...d, seña_amount: e.target.value })}
              placeholder="0"
              style={{ ...inputStyle, paddingLeft: '24px', width: '100%' }}
            />
          </div>
        </FieldBlock>
      )}

      {draft.description.trim().toLowerCase() === 'devolución de anticipo' && (
        <FieldBlock label="Anticipo a devolver">
          <select
            value={draft.refunds_anticipo_id ?? ''}
            onChange={e => {
              const v = e.target.value
              const anticipo = unrefundedAnticipos.find(a => a.id === v)
              const parentId = anticipo?.subcategory_id
                ? txCategories.find(c => c.id === anticipo.subcategory_id)?.parent_id ?? ''
                : ''
              setDraft(d => d && {
                ...d,
                refunds_anticipo_id: v || null,
                subcategory_id: anticipo?.subcategory_id ?? d.subcategory_id,
                category_parent_id: parentId || d.category_parent_id,
              })
            }}
            style={inputStyle}
          >
            <option value="">Seleccionar anticipo...</option>
            {unrefundedAnticipos.filter(a => a.date <= draft.date).map(a => (
              <option key={a.id} value={a.id}>
                {formatDate(a.date)} — ${a.amount.toLocaleString('es-CO')}{a.currency !== 'ARS' ? ` ${a.currency}` : ''}
              </option>
            ))}
          </select>
        </FieldBlock>
      )}

      <div
        className="flex items-baseline justify-between"
        style={{
          paddingTop: '12px',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <span style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
          Total
        </span>
        <span
          className="tabular-nums"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '1.75rem',
            fontWeight: 600,
            color: typeColor,
            letterSpacing: '-0.02em',
          }}
        >
          {CURRENCY_SYMBOL[draft.currency]}{total.toLocaleString('es-CO')}
        </span>
      </div>

      {formError && !formErrorField && (
        <div
          role="alert"
          style={{
            background: 'var(--color-danger-light)',
            color: 'var(--color-danger)',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '0.8125rem',
          }}
        >
          {formError}
        </div>
      )}

      <div className="flex items-center justify-end gap-2" style={{ paddingTop: '4px' }}>
        <button
          type="button"
          tabIndex={-1}
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-muted)',
            fontSize: '0.875rem',
            cursor: 'pointer',
            padding: '8px 12px',
          }}
        >
          Cancelar (Esc)
        </button>
        <button
          type="submit"
          disabled={submitting}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--color-accent)',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '10px 18px',
            fontSize: '0.9375rem',
            fontWeight: 600,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1,
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
          }}
        >
          Guardar
          <kbd style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '20px',
            height: '20px',
            padding: '0 4px',
            background: 'rgba(255,255,255,0.18)',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontFamily: 'inherit',
            fontWeight: 500,
          }}>↵</kbd>
        </button>
      </div>
    </form>
  )
})

const inputStyle: React.CSSProperties = {
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '0.9375rem',
  color: 'var(--color-text)',
  outline: 'none',
  fontFamily: 'inherit',
  width: '100%',
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

const errorInputStyle: React.CSSProperties = {
  borderColor: 'var(--color-danger)',
  boxShadow: '0 0 0 3px var(--color-danger-light)',
}

const mutedTextStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: 'var(--color-muted)',
}

const addLinkStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--color-accent)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 500,
}

function FieldBlock({ label, htmlFor, action, children }: { label: string; htmlFor?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: '6px' }}>
        <label
          htmlFor={htmlFor}
          style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-muted)',
          }}
        >
          {label}
        </label>
        {action}
      </div>
      {children}
    </div>
  )
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      style={{
        marginTop: '6px',
        fontSize: '0.8125rem',
        color: 'var(--color-danger)',
      }}
    >
      {children}
    </p>
  )
}

function PricePill({ amount, label, onClick }: { amount: number; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      style={{
        fontSize: '0.75rem',
        padding: '4px 10px',
        borderRadius: '999px',
        border: '1px solid var(--color-border)',
        background: 'transparent',
        color: 'var(--color-muted)',
        cursor: 'pointer',
        display: 'inline-flex',
        gap: '6px',
        alignItems: 'center',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-accent)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--color-accent)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-muted)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
    >
      <span style={{ fontWeight: 600 }}>${amount.toLocaleString('es-CO')}</span>
      <span style={{ opacity: 0.7 }}>{label}</span>
    </button>
  )
}

function IconButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        background: 'transparent',
        border: 'none',
        borderRadius: '8px',
        color: 'var(--color-muted)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-danger-light)'; e.currentTarget.style.color = 'var(--color-danger)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-muted)' }}
    >
      <X size={14} />
    </button>
  )
}
