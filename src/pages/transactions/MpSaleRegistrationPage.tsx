import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, ChevronDown, ChevronUp, Plus, Trash2, WalletCards } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { StepDetailIncome } from '@/components/transactions/QuickFunnel/StepDetailIncome'
import { StepHeading, SectionLabel } from '@/components/transactions/QuickFunnel/funnelAtoms'
import { money } from '@/components/transactions/QuickFunnel/funnelFormat'
import { useMpMovement, usePublishMpSales } from '@/hooks/useIntegrations'
import { useCatalogItems } from '@/hooks/useCatalogItems'
import { useProducts } from '@/hooks/useProducts'
import { useProfessionals } from '@/hooks/useProfessionals'
import { useHairdresserServices } from '@/hooks/useHairdresserServices'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { buildPublishMpSalesInput, mpSalesBalance, mpTicketLabel, mpTicketTotal, validateMpSalesDraft } from '@/lib/mpSales'
import { formatDate } from '@/lib/formatDate'
import { showToast } from '@/lib/toast'
import type { CatalogItem, MpSaleAdditionalPayment, MpSaleDraftLine, MpSaleDraftTicket, Product, TransactionCategory } from '@/types'

const id = () => crypto.randomUUID()
const emptyTicket = (): MpSaleDraftTicket => ({ clientUuid: id(), lines: [] })

export function MpSaleRegistrationPage() {
  const { movementId } = useParams<{ movementId: string }>()
  const navigate = useNavigate()
  const movementQuery = useMpMovement(movementId)
  const publish = usePublishMpSales()
  const { data: catalogItems = [], isLoading: catalogLoading } = useCatalogItems()
  const { data: products = [], isLoading: productsLoading } = useProducts()
  const { data: professionals = [] } = useProfessionals()
  const { data: assignments = [] } = useHairdresserServices()
  const { data: paymentMethods = [] } = usePaymentMethods()
  const [tickets, setTickets] = useState<MpSaleDraftTicket[]>([emptyTicket()])
  const [activeTicket, setActiveTicket] = useState(0)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [additionalPayments, setAdditionalPayments] = useState<MpSaleAdditionalPayment[]>([])
  const [error, setError] = useState('')
  const idempotencyKey = useRef(id())
  const movement = movementQuery.data
  const balance = mpSalesBalance(movement?.amount ?? 0, tickets, additionalPayments)
  const activeMethods = paymentMethods.filter(method => method.active && method.name.toLowerCase() !== 'mercado pago').map(method => method.name)
  const loadingCatalog = catalogLoading || productsLoading

  const productLabel = (product: Product) => product.unit ? `${product.name} ${product.unit}` : product.name
  const incomeSubcategories: TransactionCategory[] = []

  function updateTicket(index: number, update: (ticket: MpSaleDraftTicket) => MpSaleDraftTicket) {
    setTickets(current => current.map((ticket, ticketIndex) => ticketIndex === index ? update(ticket) : ticket))
  }

  function addService(item: CatalogItem) {
    const assigned = assignments.filter(assignment => assignment.catalog_item_id === item.id)
    const defaultProfessionals = assigned.length === 1
      ? [{ id: assigned[0].hairdresser_id, commissionRate: assigned[0].commission_rate }]
      : []
    const line: MpSaleDraftLine = {
      key: id(), clientUuid: id(), kind: 'service', description: item.name,
      catalogItemId: item.id, productId: null, quantity: 1,
      unitPrice: item.price_transfer ?? item.price,
      professionals: defaultProfessionals, withoutProfessional: false,
    }
    updateTicket(activeTicket, ticket => ({ ...ticket, lines: [...ticket.lines, line] }))
  }

  function addProduct(product: Product) {
    updateTicket(activeTicket, ticket => {
      const existing = ticket.lines.find(line => line.kind === 'product' && line.productId === product.id)
      if (existing) return { ...ticket, lines: ticket.lines.map(line => line.key === existing.key ? { ...line, quantity: line.quantity + 1 } : line) }
      return { ...ticket, lines: [...ticket.lines, {
        key: id(), clientUuid: id(), kind: 'product' as const, description: productLabel(product),
        catalogItemId: null, productId: product.id, quantity: 1, unitPrice: product.sale_price ?? 0,
        professionals: [], withoutProfessional: true,
      }] }
    })
  }

  function addTicket() {
    setTickets(current => [...current, emptyTicket()])
    setActiveTicket(tickets.length)
  }

  function removeTicket(index: number) {
    if (tickets.length === 1) return
    setTickets(current => current.filter((_, ticketIndex) => ticketIndex !== index))
    setActiveTicket(current => Math.max(0, Math.min(current, tickets.length - 2)))
  }

  function addPayment() {
    const used = new Set(additionalPayments.map(payment => payment.paymentMethod))
    const method = activeMethods.find(candidate => !used.has(candidate)) ?? ''
    setAdditionalPayments(current => [...current, { paymentMethod: method, amount: Math.max(0, balance.paymentDifference) }])
  }

  async function submit() {
    if (!movement || !movementId) return
    const validation = validateMpSalesDraft(movement.amount, tickets, additionalPayments)
    if (validation) { setError(validation); return }
    setError('')
    await publish.mutateAsync(buildPublishMpSalesInput(movementId, idempotencyKey.current, tickets, additionalPayments))
    showToast(`${tickets.length === 1 ? 'Venta registrada' : `${tickets.length} ventas registradas`} desde Mercado Pago.`, 'success')
    navigate('/transactions?view=mercadopago', { replace: true })
  }

  if (movementQuery.isLoading || loadingCatalog) return <div className="flex flex-1 items-center justify-center"><span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" /></div>
  if (!movement || movementQuery.error) return <div className="p-6"><p className="text-[var(--color-danger)]">No se pudo cargar el movimiento.</p><Button className="mt-4" variant="secondary" onClick={() => navigate('/transactions?view=mercadopago')}>Volver</Button></div>
  if (movement.status !== 'pending' || movement.suggested_classification !== 'received_payment' || movement.amount <= 0) return <div className="p-6"><p>Este movimiento no está disponible para registrar como venta.</p><Button className="mt-4" variant="secondary" onClick={() => navigate('/transactions?view=mercadopago')}>Volver</Button></div>

  return <div className="quick-funnel-page animate-fade-in flex min-h-0 flex-1 flex-col">
    <TopBar title="Registrar venta desde Mercado Pago" subtitle={`${formatDate(movement.occurred_at.slice(0, 10))} · MP ${movement.external_id}`} actions={<Button variant="secondary" size="sm" onClick={() => navigate('/transactions?view=mercadopago')}><ArrowLeft size={15} />Volver</Button>} />
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="space-y-5">
          <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sky-950">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-sky-700">Cobro importado</p><strong>{movement.description || 'Movimiento Mercado Pago'}</strong></div><strong className="text-xl">{money(movement.amount, 'ARS')}</strong></div>
            <p className="mt-2 text-xs text-sky-700">La fecha, referencia y pago de Mercado Pago quedan fijos. Completá únicamente qué se vendió.</p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between"><StepHeading kicker="Ventas" title="Productos y servicios" /><Button size="sm" variant="secondary" onClick={addTicket}><Plus size={15} />Otra venta</Button></div>
            {tickets.map((ticket, ticketIndex) => {
              const isCollapsed = collapsed.has(ticketIndex)
              return <article key={ticket.clientUuid} className={`overflow-hidden rounded-xl border bg-[var(--color-surface)] ${activeTicket === ticketIndex ? 'border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]' : 'border-[var(--color-border)]'}`}>
                <header className="flex items-center justify-between gap-3 p-4">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setActiveTicket(ticketIndex); setCollapsed(current => { const next = new Set(current); next.delete(ticketIndex); return next }) }}>
                    <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Venta {ticketIndex + 1}</span>
                    <strong className="block truncate">{ticket.lines.length ? mpTicketLabel(ticket) : 'Agregá productos o servicios'}</strong>
                  </button>
                  <strong>{money(mpTicketTotal(ticket), 'ARS')}</strong>
                  <button type="button" className="rounded-lg p-2 text-[var(--color-muted)] hover:bg-[var(--color-bg)]" onClick={() => setCollapsed(current => { const next = new Set(current); if (next.has(ticketIndex)) next.delete(ticketIndex); else next.add(ticketIndex); return next })} aria-label={isCollapsed ? 'Expandir venta' : 'Contraer venta'}>{isCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button>
                  {tickets.length > 1 && <button type="button" className="rounded-lg p-2 text-[var(--color-danger)] hover:bg-[var(--color-danger-light)]" onClick={() => removeTicket(ticketIndex)} aria-label="Eliminar venta"><Trash2 size={16} /></button>}
                </header>
                {!isCollapsed && <div className="border-t border-[var(--color-border)] p-4">
                  {activeTicket === ticketIndex && <StepDetailIncome catalogItems={catalogItems} products={products} cartCount={ticket.lines.length} incomeSubcategories={incomeSubcategories} selectedOtherId={null} onAddService={addService} onAddProduct={addProduct} onAddOther={() => undefined} productLabel={productLabel} showOther={false} servicePrice={item => item.price_transfer ?? item.price} />}
                  <div className="mt-5 space-y-3">{ticket.lines.map(line => <SaleLineEditor key={line.key} line={line} professionals={professionals.filter(professional => professional.active)} suggestedRates={new Map(assignments.filter(assignment => assignment.catalog_item_id === line.catalogItemId).map(assignment => [assignment.hairdresser_id, assignment.commission_rate]))} onChange={patch => updateTicket(ticketIndex, current => ({ ...current, lines: current.lines.map(item => item.key === line.key ? { ...item, ...patch } : item) }))} onRemove={() => updateTicket(ticketIndex, current => ({ ...current, lines: current.lines.filter(item => item.key !== line.key) }))} />)}</div>
                  {activeTicket !== ticketIndex && <Button variant="secondary" size="sm" onClick={() => setActiveTicket(ticketIndex)}>Editar esta venta</Button>}
                </div>}
              </article>
            })}
          </section>
        </main>

        <aside className="h-fit rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:sticky lg:top-4">
          <SectionLabel>Revisión</SectionLabel>
          <div className="mt-3 space-y-2 text-sm">
            <SummaryRow label="Total ventas" value={money(balance.saleTotal, 'ARS')} />
            <SummaryRow label="Mercado Pago" value={money(balance.mpAmount, 'ARS')} accent />
            {balance.unassigned > 0 && <p className="rounded-lg bg-[var(--color-warning-light)] p-3 font-semibold text-amber-800">Faltan asignar {money(balance.unassigned, 'ARS')} a productos o servicios.</p>}
            {balance.requiredAdditional > 0 && <SummaryRow label="Otros medios" value={money(balance.requiredAdditional, 'ARS')} />}
          </div>

          {balance.requiredAdditional > 0 && <div className="mt-5 space-y-3 border-t border-[var(--color-border)] pt-4">
            <div className="flex items-center justify-between"><SectionLabel>Completar diferencia</SectionLabel><Button size="sm" variant="secondary" onClick={addPayment} disabled={additionalPayments.length >= activeMethods.length}><Plus size={14} />Medio</Button></div>
            {additionalPayments.map((payment, index) => <div key={index} className="grid grid-cols-[1fr_8rem_auto] items-end gap-2"><Select id={`additional-method-${index}`} label={index === 0 ? 'Medio' : undefined} value={payment.paymentMethod} onChange={event => setAdditionalPayments(current => current.map((item, paymentIndex) => paymentIndex === index ? { ...item, paymentMethod: event.target.value } : item))} placeholder="Elegir" options={activeMethods.filter(method => method === payment.paymentMethod || !additionalPayments.some(item => item.paymentMethod === method)).map(method => ({ value: method, label: method }))} /><Input id={`additional-amount-${index}`} label={index === 0 ? 'Monto' : undefined} type="number" min="0" value={payment.amount || ''} onChange={event => setAdditionalPayments(current => current.map((item, paymentIndex) => paymentIndex === index ? { ...item, amount: Number(event.target.value) } : item))} /><button type="button" className="mb-1 rounded-lg p-2 text-[var(--color-danger)]" onClick={() => setAdditionalPayments(current => current.filter((_, paymentIndex) => paymentIndex !== index))} aria-label="Quitar medio"><Trash2 size={16} /></button></div>)}
            {additionalPayments.length === 0 && <Button className="w-full" variant="secondary" onClick={addPayment} disabled={activeMethods.length === 0}><WalletCards size={16} />Agregar otro medio de pago</Button>}
            {activeMethods.length === 0 && <p className="text-xs text-[var(--color-danger)]">Configurá otro medio de pago activo para cubrir la diferencia.</p>}
            {Math.abs(balance.paymentDifference) >= 0.01 && <p className="text-xs font-semibold text-[var(--color-danger)]">Diferencia pendiente: {money(balance.paymentDifference, 'ARS')}</p>}
          </div>}

          {error && <p className="mt-4 rounded-lg bg-[var(--color-danger-light)] p-3 text-sm text-[var(--color-danger)]">{error}</p>}
          <Button className="mt-5 w-full" disabled={!balance.balanced || publish.isPending} loading={publish.isPending} onClick={() => void submit()}><Check size={17} />{tickets.length === 1 ? 'Registrar venta' : `Registrar ${tickets.length} ventas`}</Button>
          <p className="mt-3 text-xs text-[var(--color-muted)]">Se crearán tickets, costos, comisiones, inventario y pagos en una sola operación.</p>
        </aside>
      </div>
    </div>
  </div>
}

function SaleLineEditor({ line, professionals, suggestedRates, onChange, onRemove }: { line: MpSaleDraftLine; professionals: Array<{ id: string; name: string }>; suggestedRates: Map<string, number>; onChange: (patch: Partial<MpSaleDraftLine>) => void; onRemove: () => void }) {
  const selected = line.professionals[0]
  return <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_7rem_9rem_auto] md:items-end">
      <div><span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">{line.kind === 'service' ? 'Servicio' : 'Producto'}</span><strong className="block">{line.description}</strong></div>
      {line.kind === 'product' ? <Input id={`quantity-${line.key}`} label="Cantidad" type="number" min="1" value={line.quantity} onChange={event => onChange({ quantity: Math.max(1, Number(event.target.value)) })} /> : <div className="pb-2 text-sm text-[var(--color-muted)]">1 ocurrencia</div>}
      <Input id={`price-${line.key}`} label="Precio" type="number" min="0" value={line.unitPrice || ''} onChange={event => onChange({ unitPrice: Number(event.target.value) })} />
      <button type="button" className="mb-1 rounded-lg p-2 text-[var(--color-danger)] hover:bg-[var(--color-danger-light)]" onClick={onRemove} aria-label={`Quitar ${line.description}`}><Trash2 size={17} /></button>
    </div>
    {line.kind === 'service' && <div className="mt-3 grid gap-3 border-t border-[var(--color-border)] pt-3 md:grid-cols-[minmax(0,1fr)_8rem]">
      <Select id={`professional-${line.key}`} label="Profesional" value={selected?.id ?? ''} onChange={event => {
        const professionalId = event.target.value
        onChange({ professionals: professionalId ? [{ id: professionalId, commissionRate: suggestedRates.get(professionalId) ?? 0 }] : [] })
      }} placeholder="Elegir profesional" options={professionals.map(professional => ({ value: professional.id, label: professional.name }))} disabled={line.withoutProfessional} />
      <Input id={`commission-${line.key}`} label="Comisión %" type="number" min="0" max="100" value={selected?.commissionRate ?? ''} onChange={event => selected && onChange({ professionals: [{ ...selected, commissionRate: Number(event.target.value) }] })} disabled={!selected || line.withoutProfessional} />
      <label className="flex items-center gap-2 text-sm text-[var(--color-muted)] md:col-span-2"><input type="checkbox" checked={line.withoutProfessional} onChange={event => onChange({ withoutProfessional: event.target.checked, professionals: event.target.checked ? [] : line.professionals })} />Sin profesional / no genera comisión</label>
    </div>}
  </div>
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className="flex items-center justify-between"><span className="text-[var(--color-muted)]">{label}</span><strong className={accent ? 'text-sky-600' : ''}>{value}</strong></div>
}
