import type { MpSaleAdditionalPayment, MpSaleDraftTicket, PublishMpSalesInput } from '@/types'

export function groupMpMovementsByDate<T extends { occurred_at: string }>(movements: T[]) {
  const groups = new Map<string, T[]>()
  for (const movement of movements) {
    const date = movement.occurred_at.slice(0, 10)
    groups.set(date, [...(groups.get(date) ?? []), movement])
  }
  return Array.from(groups, ([date, rows]) => ({ date, rows }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function mpTicketTotal(ticket: MpSaleDraftTicket): number {
  return roundMoney(ticket.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0))
}

export function mpSalesTotal(tickets: MpSaleDraftTicket[]): number {
  return roundMoney(tickets.reduce((sum, ticket) => sum + mpTicketTotal(ticket), 0))
}

export function mpAdditionalPaymentsTotal(payments: MpSaleAdditionalPayment[]): number {
  return roundMoney(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0))
}

export function mpSalesBalance(
  movementAmount: number,
  tickets: MpSaleDraftTicket[],
  payments: MpSaleAdditionalPayment[],
) {
  const mpAmount = roundMoney(Math.max(0, movementAmount))
  const saleTotal = mpSalesTotal(tickets)
  const requiredAdditional = roundMoney(Math.max(0, saleTotal - mpAmount))
  const additionalTotal = mpAdditionalPaymentsTotal(payments)
  return {
    mpAmount,
    saleTotal,
    unassigned: roundMoney(Math.max(0, mpAmount - saleTotal)),
    requiredAdditional,
    additionalTotal,
    paymentDifference: roundMoney(requiredAdditional - additionalTotal),
    balanced: saleTotal >= mpAmount && Math.abs(requiredAdditional - additionalTotal) < 0.01,
  }
}

export function mpTicketLabel(ticket: MpSaleDraftTicket): string {
  const names = ticket.lines.map(line => line.description.trim()).filter(Boolean)
  if (names.length === 0) return 'Venta Mercado Pago'
  const shown = names.slice(0, 3).join(' + ')
  return names.length > 3 ? `${shown} + ${names.length - 3} más` : shown
}

export function validateMpSalesDraft(
  movementAmount: number,
  tickets: MpSaleDraftTicket[],
  payments: MpSaleAdditionalPayment[],
): string | null {
  if (tickets.length === 0 || tickets.some(ticket => ticket.lines.length === 0)) return 'Cada venta necesita al menos un producto o servicio.'
  for (const ticket of tickets) {
    for (const line of ticket.lines) {
      if (line.quantity <= 0 || line.unitPrice <= 0) return 'Cada ítem necesita una cantidad y un precio mayores que cero.'
      if (line.kind === 'service' && line.quantity !== 1) return 'Cada servicio se registra como una ocurrencia separada.'
      if (line.kind === 'service' && line.professionals.length === 0 && !line.withoutProfessional) {
        return 'Elegí un profesional o confirmá que el servicio no genera comisión.'
      }
    }
  }
  const names = payments.map(payment => payment.paymentMethod.trim().toLowerCase())
  if (names.some(name => !name || name === 'mercado pago') || new Set(names).size !== names.length) {
    return 'Los medios adicionales deben ser distintos entre sí y de Mercado Pago.'
  }
  const balance = mpSalesBalance(movementAmount, tickets, payments)
  if (balance.unassigned > 0) return `Faltan asignar ${balance.unassigned.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })} a productos o servicios.`
  if (Math.abs(balance.paymentDifference) >= 0.01) return 'Los medios adicionales deben cubrir exactamente la diferencia.'
  return null
}

export function buildPublishMpSalesInput(
  movementId: string,
  idempotencyKey: string,
  tickets: MpSaleDraftTicket[],
  additionalPayments: MpSaleAdditionalPayment[],
): PublishMpSalesInput {
  return {
    movementId,
    idempotencyKey,
    tickets: tickets.map(ticket => ({
      clientUuid: ticket.clientUuid,
      label: mpTicketLabel(ticket),
      lines: ticket.lines.map(line => ({
        clientUuid: line.clientUuid,
        kind: line.kind,
        description: line.description,
        catalogItemId: line.catalogItemId,
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: roundMoney(line.unitPrice),
        professionals: line.professionals.map(professional => ({
          hairdresserId: professional.id,
          commissionRate: professional.commissionRate,
        })),
        withoutProfessional: line.withoutProfessional,
      })),
    })),
    additionalPayments: additionalPayments.map(payment => ({
      paymentMethod: payment.paymentMethod,
      amount: roundMoney(payment.amount),
    })),
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
