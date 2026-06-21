import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, CloudOff, List, Loader2, RefreshCw, X } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { useTransactionCategories } from '@/hooks/useTransactionCategories'
import { useCatalogItems } from '@/hooks/useCatalogItems'
import { useProducts } from '@/hooks/useProducts'
import { useProfessionals } from '@/hooks/useProfessionals'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useAnticipoPresets } from '@/hooks/useAnticipoPresets'
import { useAnticipoBalance } from '@/hooks/useAnticipoBalance'
import type { CatalogItem, Product } from '@/types'
import {
  type FunnelState,
  type FunnelStep,
  type FunnelType,
  type CartLine,
  FUNNEL_TYPE_META,
  makeEmptyFunnelState,
  linesGross,
  discountValueFor,
  ticketNet,
  chargeTotal,
  paymentsTotal as paymentsTotalFn,
  hasServiceLine,
} from '@/components/transactions/QuickFunnel/funnelTypes'
import { buildTicket } from '@/components/transactions/QuickFunnel/buildTicket'
import { useFunnelSubmit } from '@/components/transactions/QuickFunnel/funnelSubmit'
import { useFunnelQueue } from '@/components/transactions/QuickFunnel/useFunnelQueue'
import { bumpFrequent } from '@/components/transactions/QuickFunnel/frequents'
import { Stepper } from '@/components/transactions/QuickFunnel/funnelAtoms'
import { money } from '@/components/transactions/QuickFunnel/funnelFormat'
import { StepType } from '@/components/transactions/QuickFunnel/StepType'
import { StepDetailIncome } from '@/components/transactions/QuickFunnel/StepDetailIncome'
import { StepDetailSimple } from '@/components/transactions/QuickFunnel/StepDetailSimple'
import { StepAmount } from '@/components/transactions/QuickFunnel/StepAmount'
import { StepAdjust } from '@/components/transactions/QuickFunnel/StepAdjust'
import { StepPayment } from '@/components/transactions/QuickFunnel/StepPayment'
import { TicketPanel } from '@/components/transactions/QuickFunnel/TicketPanel'

const STEP_LABELS: Record<FunnelStep, string> = {
  type: 'Tipo', detail: 'Detalle', amount: 'Monto', adjust: 'Ajustes', payment: 'Pago', done: 'Cierre',
}

function stepsFor(type: FunnelType | null): FunnelStep[] {
  if (type === 'income') return ['type', 'detail', 'amount', 'adjust', 'payment', 'done']
  return ['type', 'detail', 'amount', 'done']
}

let lineSeq = 0
const nextKey = () => `l${++lineSeq}`

export function QuickFunnelPage() {
  const navigate = useNavigate()
  const [state, setState] = useState<FunnelState>(makeEmptyFunnelState)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [closed, setClosed] = useState<{ summary: string; queued: boolean } | null>(null)

  const { data: categories = [] } = useTransactionCategories()
  const { data: catalogItems = [] } = useCatalogItems()
  const { data: products = [] } = useProducts()
  const { data: professionals = [] } = useProfessionals()
  const { data: paymentMethodsData = [] } = usePaymentMethods()
  const { data: anticipoPresets = [] } = useAnticipoPresets()
  const { data: anticipoBalance } = useAnticipoBalance()
  const { submitTicket } = useFunnelSubmit()
  const { pending, syncing, enqueue, flush } = useFunnelQueue(submitTicket)

  const paymentMethods = useMemo(() => paymentMethodsData.filter(m => m.active).map(m => m.name), [paymentMethodsData])
  const cashMethod = useMemo(() => paymentMethods.find(m => m.toLowerCase().includes('efectivo')) ?? null, [paymentMethods])
  const productLabel = useCallback((p: Product) => (p.unit ? `${p.name} ${p.unit}` : p.name), [])

  const steps = stepsFor(state.type)
  const stepperItems = steps.map(s => ({ key: s, label: STEP_LABELS[s] }))

  const gross = linesGross(state.lines)
  const discountAmount = discountValueFor(state)
  const netToPay = ticketNet(state) + (state.tipEnabled ? Math.max(0, state.tipAmount) : 0)
  const totalToCharge = chargeTotal(state)
  const paymentsSum = paymentsTotalFn(state)

  function reset() {
    setState(makeEmptyFunnelState())
    setError('')
    setClosed(null)
  }

  function pickType(t: FunnelType) {
    setState(s => ({ ...makeEmptyFunnelState(), type: t, date: s.date, step: 'detail' }))
    setError('')
  }

  function addService(item: CatalogItem) {
    bumpFrequent(`s:${item.id}`)
    setState(s => {
      const existing = s.lines.find(l => l.catalogItemId === item.id)
      if (existing) return { ...s, lines: s.lines.map(l => l === existing ? { ...l, qty: l.qty + 1 } : l) }
      const line: CartLine = { key: nextKey(), kind: 'service', name: item.name, unitPrice: item.price, qty: 1, catalogItemId: item.id, productId: null, professionals: [] }
      return { ...s, lines: [...s.lines, line] }
    })
  }

  function addProduct(p: Product) {
    bumpFrequent(`p:${p.id}`)
    setState(s => {
      const existing = s.lines.find(l => l.productId === p.id)
      if (existing) return { ...s, lines: s.lines.map(l => l === existing ? { ...l, qty: l.qty + 1 } : l) }
      const line: CartLine = { key: nextKey(), kind: 'product', name: productLabel(p), unitPrice: p.sale_price ?? 0, qty: 1, catalogItemId: null, productId: p.id, professionals: [] }
      return { ...s, lines: [...s.lines, line] }
    })
  }

  const setLineQty = (key: string, qty: number) => setState(s => ({ ...s, lines: s.lines.map(l => l.key === key ? { ...l, qty } : l) }))
  const removeLine = (key: string) => setState(s => ({ ...s, lines: s.lines.filter(l => l.key !== key) }))
  const setUnitPrice = (key: string, price: number) => setState(s => ({ ...s, lines: s.lines.map(l => l.key === key ? { ...l, unitPrice: price } : l) }))
  const setLineProfs = (key: string, profs: { id: string; commission_rate: number }[]) => setState(s => ({ ...s, lines: s.lines.map(l => l.key === key ? { ...l, professionals: profs } : l) }))

  function canAdvance(step: FunnelStep): boolean {
    switch (step) {
      case 'type': return state.type !== null
      case 'detail':
        return state.type === 'income' ? state.lines.length > 0 : !!state.subcategoryId
      case 'amount':
        return state.type === 'income'
          ? state.lines.every(l => l.unitPrice > 0)
          : state.manualAmount > 0 && !!state.simpleMethod
      case 'adjust': return true
      case 'payment': return totalToCharge <= 0 || Math.abs(totalToCharge - paymentsSum) < 1
      default: return true
    }
  }

  function goNext() {
    const idx = steps.indexOf(state.step)
    if (!canAdvance(state.step)) {
      setError(advanceHint(state.step))
      return
    }
    setError('')
    const next = steps[idx + 1]
    if (next === 'done') { void submit(); return }
    // entering payment: prefill a single full payment with cash/first method
    if (next === 'payment') {
      setState(s => {
        if (s.payments.length > 0) return { ...s, step: next }
        const method = cashMethod ?? paymentMethods[0]
        const total = chargeTotal(s)
        return { ...s, step: next, payments: method && total > 0 ? [{ payment_method: method, amount: total, received: null }] : [] }
      })
      return
    }
    setState(s => ({ ...s, step: next }))
  }

  function goBack() {
    const idx = steps.indexOf(state.step)
    if (idx <= 0) { navigate('/transactions'); return }
    setError('')
    setState(s => ({ ...s, step: steps[idx - 1] }))
  }

  function advanceHint(step: FunnelStep): string {
    if (step === 'detail') return state.type === 'income' ? 'Agregá al menos un ítem al ticket.' : 'Elegí una categoría.'
    if (step === 'amount') return state.type === 'income' ? 'Cada ítem necesita un precio mayor a cero.' : 'Ingresá un monto mayor a cero.'
    if (step === 'payment') return 'El pago debe cubrir el total a cobrar.'
    return 'Completá este paso para continuar.'
  }

  async function submit() {
    setSubmitting(true)
    setError('')
    const payload = buildTicket(state, { categories })
    const summary = state.type === 'income'
      ? totalToCharge <= 0
        ? `Pagado con anticipo · ${money(netToPay, state.currency)}`
        : `Cobrado ${money(totalToCharge, state.currency)}`
      : `Registrado ${money(Math.round(state.manualAmount), state.currency)}`
    const finishQueued = () => { enqueue(payload); setClosed({ summary, queued: true }); setState(s => ({ ...s, step: 'done' })) }

    if (!navigator.onLine) {
      finishQueued()
      setSubmitting(false)
      return
    }
    try {
      await submitTicket(payload)
      setClosed({ summary, queued: false })
      setState(s => ({ ...s, step: 'done' }))
    } catch (e) {
      const msg = (e as Error).message || ''
      const networkish = !navigator.onLine || /fetch|network|failed to fetch|load failed|timeout/i.test(msg)
      if (networkish) finishQueued()
      else setError(msg || 'No se pudo registrar. Intentá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  // Keyboard: digits to pick type, Enter to advance (unless typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
      if (state.step === 'type' && !inField && /^[1-4]$/.test(e.key)) {
        const map: FunnelType[] = ['income', 'expense', 'cost', 'transfer']
        pickType(map[parseInt(e.key) - 1])
        return
      }
      if (e.key === 'Enter' && !inField && state.step !== 'done') {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const activeSubcats = state.type && state.type !== 'income'
    ? categories.filter(c => {
        const parent = categories.find(p => p.id === c.parent_id)
        return parent?.name === FUNNEL_TYPE_META[state.type as FunnelType].parentName
      })
    : []

  const showTicketPanel = state.step !== 'type' && state.step !== 'done'
  const isLastInput = steps[steps.indexOf(state.step) + 1] === 'done'

  return (
    <div className="animate-fade-in flex-1 min-h-0 flex flex-col">
      <TopBar
        title="Carga rápida"
        subtitle="Registro veloz de caja"
        actions={
          <div className="flex items-center gap-3">
            {pending > 0 && (
              <button
                onClick={() => { void flush() }}
                className="flex items-center gap-1.5"
                title="Pendientes de sincronizar"
                style={{
                  fontSize: '0.8125rem', fontWeight: 600, padding: '6px 12px', borderRadius: '999px',
                  border: '1px solid var(--color-warning)', background: 'var(--color-warning-light)', color: 'var(--color-warning)', cursor: 'pointer',
                }}
              >
                {syncing ? <RefreshCw size={13} className="animate-spin" /> : <CloudOff size={13} />}
                {pending} sin sincronizar
              </button>
            )}
            <button
              onClick={() => navigate('/transactions')}
              className="flex items-center gap-1.5"
              style={{ fontSize: '0.875rem', color: 'var(--color-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <List size={15} /> Ver lista
            </button>
          </div>
        }
      />

      {state.step !== 'done' && (
        <div className="flex items-center justify-between px-6 py-3" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          <Stepper steps={stepperItems} current={state.step} />
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto p-7">
            {state.step === 'type' && <StepType value={state.type} onPick={pickType} />}

            {state.step === 'detail' && state.type === 'income' && (
              <StepDetailIncome
                catalogItems={catalogItems}
                products={products}
                cartCount={state.lines.length}
                onAddService={addService}
                onAddProduct={addProduct}
                productLabel={productLabel}
              />
            )}
            {state.step === 'detail' && state.type && state.type !== 'income' && (
              <StepDetailSimple
                type={state.type}
                subcategories={activeSubcats}
                subcategoryId={state.subcategoryId}
                concept={state.concept}
                onSubcategory={id => setState(s => ({ ...s, subcategoryId: id }))}
                onConcept={v => setState(s => ({ ...s, concept: v }))}
              />
            )}

            {state.step === 'amount' && state.type === 'income' && (
              <StepAmount
                mode="income"
                lines={state.lines}
                currency={state.currency}
                professionals={professionals}
                onUnitPrice={setUnitPrice}
                onLineProfessionals={setLineProfs}
              />
            )}
            {state.step === 'amount' && state.type && state.type !== 'income' && (
              <StepAmount
                mode="simple"
                type={state.type}
                currency={state.currency}
                onCurrency={c => setState(s => ({ ...s, currency: c }))}
                manualAmount={state.manualAmount}
                onAmount={v => setState(s => ({ ...s, manualAmount: v }))}
                simpleMethod={state.simpleMethod}
                onMethod={m => setState(s => ({ ...s, simpleMethod: m }))}
                paymentMethods={paymentMethods}
                transferDirection={state.transferDirection}
                onDirection={d => setState(s => ({ ...s, transferDirection: d }))}
              />
            )}

            {state.step === 'adjust' && (
              <StepAdjust
                currency={state.currency}
                gross={gross}
                discountMode={state.discountMode}
                discountValue={state.discountValue}
                discountAmount={discountAmount}
                onDiscountMode={m => setState(s => ({ ...s, discountMode: m, discountValue: m === 'none' ? 0 : s.discountValue }))}
                onDiscountValue={v => setState(s => ({ ...s, discountValue: v }))}
                hasService={hasServiceLine(state)}
                tipEnabled={state.tipEnabled}
                tipAmount={state.tipAmount}
                onTipEnabled={v => setState(s => ({ ...s, tipEnabled: v, tipAmount: v ? s.tipAmount : 0 }))}
                onTipAmount={v => setState(s => ({ ...s, tipAmount: v }))}
              />
            )}

            {state.step === 'payment' && (
              <StepPayment
                currency={state.currency}
                netToPay={netToPay}
                totalToCharge={totalToCharge}
                paymentsTotal={paymentsSum}
                payments={state.payments}
                onPayments={rows => setState(s => ({ ...s, payments: rows }))}
                paymentMethods={paymentMethods}
                cashMethod={cashMethod}
                anticipoAmount={state.anticipoAmount}
                onAnticipo={v => setState(s => {
                  const next = { ...s, anticipoAmount: v }
                  if (s.payments.length === 1) {
                    next.payments = [{ ...s.payments[0], amount: Math.max(0, chargeTotal(next)), received: null }]
                  }
                  return next
                })}
                anticipoPresets={anticipoPresets.map(p => p.amount)}
                anticipoBalance={anticipoBalance?.[state.currency] ?? 0}
              />
            )}

            {state.step === 'done' && (
              <DoneScreen summary={closed?.summary ?? ''} queued={closed?.queued ?? false} onAnother={reset} onList={() => navigate('/transactions')} />
            )}
          </div>

          {state.step !== 'done' && (
            <div className="flex items-center justify-between px-7 py-4" style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
              <button
                onClick={goBack}
                className="flex items-center gap-2"
                style={{ padding: '10px 16px', borderRadius: '11px', border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}
              >
                <ArrowLeft size={16} /> {state.step === 'type' ? 'Salir' : 'Atrás'}
              </button>

              <div className="flex items-center gap-3">
                {error && <span style={{ fontSize: '0.8125rem', color: 'var(--color-danger)', fontWeight: 500 }}>{error}</span>}
                {state.step !== 'type' && (
                  <button
                    onClick={goNext}
                    disabled={submitting || !canAdvance(state.step)}
                    className="flex items-center gap-2"
                    style={{
                      padding: '11px 22px', borderRadius: '11px', border: 'none',
                      background: canAdvance(state.step) ? 'var(--color-accent)' : 'var(--color-border)',
                      color: '#fff', cursor: canAdvance(state.step) && !submitting ? 'pointer' : 'not-allowed',
                      fontSize: '0.9375rem', fontWeight: 700,
                      boxShadow: canAdvance(state.step) ? '0 6px 18px -8px var(--color-accent)' : 'none',
                      opacity: submitting ? 0.7 : 1,
                    }}
                  >
                    {submitting ? <><Loader2 size={16} className="animate-spin" /> Registrando…</>
                      : isLastInput ? <><Check size={16} /> Confirmar y registrar</>
                      : <>Continuar <ArrowRight size={16} /></>}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {showTicketPanel && <TicketPanel state={state} onQty={setLineQty} onRemove={removeLine} onDate={d => setState(s => ({ ...s, date: d }))} />}
      </div>
    </div>
  )
}

function DoneScreen({ summary, queued, onAnother, onList }: { summary: string; queued: boolean; onAnother: () => void; onList: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Enter') onAnother() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAnother])

  return (
    <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: '60vh', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '84px', height: '84px', borderRadius: '50%', background: queued ? 'var(--color-warning-light)' : 'var(--color-success-light)', color: queued ? 'var(--color-warning)' : 'var(--color-success)' }}>
        {queued ? <CloudOff size={40} /> : <Check size={42} />}
      </div>
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
          {queued ? 'Guardado sin conexión' : '¡Registrado!'}
        </h2>
        <p style={{ marginTop: '6px', fontSize: '1.05rem', color: 'var(--color-muted)', fontWeight: 500 }}>{summary}</p>
        {queued && (
          <p style={{ marginTop: '4px', fontSize: '0.875rem', color: 'var(--color-warning)', fontWeight: 600 }}>
            Se sincronizará automáticamente al recuperar la conexión.
          </p>
        )}
      </div>
      <div className="flex items-center gap-3" style={{ marginTop: '4px' }}>
        <button
          onClick={onAnother}
          className="flex items-center gap-2"
          style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 700, boxShadow: '0 6px 18px -8px var(--color-accent)' }}
        >
          Cargar otra <kbd style={{ marginLeft: '4px', padding: '0 6px', borderRadius: '5px', background: 'rgba(255,255,255,0.2)', fontSize: '0.75rem' }}>↵</kbd>
        </button>
        <button
          onClick={onList}
          className="flex items-center gap-2"
          style={{ padding: '12px 20px', borderRadius: '12px', border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600 }}
        >
          <X size={16} /> Ir a la lista
        </button>
      </div>
    </div>
  )
}
