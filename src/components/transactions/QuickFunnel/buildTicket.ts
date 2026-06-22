import type { TransactionCategory } from '@/types'
import type { TicketPayload, TicketUnit } from './funnelSubmit'
import {
  type FunnelState,
  lineGross,
  linesGross,
  discountValueFor,
  chargeTotal,
} from './funnelTypes'

export type BuildContext = {
  categories: TransactionCategory[]
}

function findIncomeSubcat(categories: TransactionCategory[], name: string): TransactionCategory | undefined {
  const incomeParent = categories.find(c => c.parent_id === null && c.name === 'Ingresos')
  if (!incomeParent) return undefined
  return categories.find(c => c.parent_id === incomeParent.id && c.name.toLowerCase() === name.toLowerCase())
}

/** Distribute a single payment amount across units proportionally to their charge base, remainder on the last billable unit. */
function allocate(chargeBases: number[], amount: number, total: number): number[] {
  const out = chargeBases.map(() => 0)
  if (total <= 0 || amount <= 0) return out
  const lastIdx = chargeBases.reduce((acc, b, i) => (b > 0 ? i : acc), -1)
  let used = 0
  for (let i = 0; i < chargeBases.length; i++) {
    if (chargeBases[i] <= 0) continue
    const share = i === lastIdx ? amount - used : Math.round((amount * chargeBases[i]) / total)
    out[i] = share
    used += share
  }
  return out
}

export function buildTicket(state: FunnelState, ctx: BuildContext): TicketPayload {
  const base = { date: state.date, currency: state.currency }

  if (state.type === 'income') {
    const gross = linesGross(state.lines)
    const discount = discountValueFor(state)
    const netTotal = Math.max(0, gross - discount)

    const servicio = findIncomeSubcat(ctx.categories, 'Servicio')
    const producto = findIncomeSubcat(ctx.categories, 'Producto')

    // Net per line after proportional discount (remainder on last line).
    const lineNets: number[] = []
    let usedNet = 0
    state.lines.forEach((line, i) => {
      const isLast = i === state.lines.length - 1
      const net = gross <= 0 ? 0 : isLast ? netTotal - usedNet : Math.round((lineGross(line) * netTotal) / gross)
      lineNets.push(net)
      usedNet += net
    })

    // Charge base per line; anticipo reduces the first service line and is recorded as seña_amount there.
    const firstServiceIdx = state.lines.findIndex(l => l.kind === 'service')
    const anticipo = Math.max(0, state.anticipoAmount)
    const chargeBases = lineNets.map((net, i) => {
      if (i === firstServiceIdx && anticipo > 0) return Math.max(0, net - anticipo)
      return net
    })

    const tip = state.tipEnabled ? Math.max(0, state.tipAmount) : 0
    if (tip > 0) chargeBases.push(tip)

    const total = chargeTotal(state)
    const perUnitPayments: { payment_method: string; instrument: null; amount: number }[][] = chargeBases.map(() => [])
    state.payments.forEach(p => {
      const alloc = allocate(chargeBases, Math.round(Number(p.amount) || 0), total)
      alloc.forEach((amt, i) => {
        if (amt > 0) perUnitPayments[i].push({ payment_method: p.payment_method, instrument: null, amount: amt })
      })
    })

    const units: TicketUnit[] = state.lines.map((line, i) => {
      const otherSubcat = line.kind === 'other' ? ctx.categories.find(c => c.id === line.subcategoryId) : undefined
      return {
        client_uuid: crypto.randomUUID(),
        kind: line.kind === 'other' ? 'service' : line.kind,
        transaction_type: 'income',
        description: line.name,
        catalog_item_id: line.catalogItemId,
        product_id: line.productId,
        product_qty: line.qty,
        unit_sale_price: line.qty > 0 ? Math.round(lineNets[i] / line.qty) : 0,
        subcategory_id: line.kind === 'service' ? servicio?.id ?? null : line.kind === 'product' ? producto?.id ?? null : otherSubcat?.id ?? null,
        subcategory_name: line.kind === 'service' ? servicio?.name ?? null : line.kind === 'product' ? producto?.name ?? null : otherSubcat?.name ?? null,
        professionals: line.kind === 'service' ? line.professionals : [],
        sena_amount: i === firstServiceIdx && anticipo > 0 ? anticipo : null,
        payments: perUnitPayments[i],
      }
    })

    if (tip > 0) {
      units.push({
        client_uuid: crypto.randomUUID(),
        kind: 'tip',
        transaction_type: 'income',
        description: 'Propina',
        catalog_item_id: null,
        product_id: null,
        product_qty: 0,
        unit_sale_price: 0,
        subcategory_id: null,
        subcategory_name: null,
        professionals: [],
        sena_amount: null,
        payments: perUnitPayments[perUnitPayments.length - 1],
      })
    }

    return { ...base, units }
  }

  // expense / cost / transfer — single simple unit, one payment method.
  const subcat = ctx.categories.find(c => c.id === state.subcategoryId)
  const txType: TicketUnit['transaction_type'] = state.type === 'transfer' ? 'transfer' : 'expense'
  const amount = Math.round(Math.max(0, state.manualAmount))
  return {
    ...base,
    units: [
      {
        client_uuid: crypto.randomUUID(),
        kind: 'simple',
        transaction_type: txType,
        description: state.concept || subcat?.name || null,
        catalog_item_id: null,
        product_id: null,
        product_qty: 0,
        unit_sale_price: 0,
        subcategory_id: state.subcategoryId || null,
        subcategory_name: subcat?.name ?? null,
        professionals: [],
        sena_amount: null,
        transfer_direction: state.type === 'transfer' ? state.transferDirection : undefined,
        payments: amount > 0 ? [{ payment_method: state.simpleMethod, instrument: null, amount }] : [],
      },
    ],
  }
}
