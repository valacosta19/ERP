// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { HairdresserService, Professional, StaffRole } from '@/types'
import type { CartLine } from './funnelTypes'

const roles: StaffRole[] = []

vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/hooks/useStaffRoles', () => ({ useStaffRoles: () => ({ data: roles }) }))

import { StepAmount } from './StepAmount'

afterEach(() => {
  cleanup()
  roles.length = 0
})

function role(id: string, name: string, assigns_services: boolean, earns_commission: boolean): StaffRole {
  return { id, name, assigns_services, earns_commission, created_at: '' }
}

function prof(id: string, name: string, role_id: string | null): Professional {
  return { id, name, active: true, role_id, created_at: '' }
}

const assignments: HairdresserService[] = [
  { hairdresser_id: 'eury', catalog_item_id: 'corte', commission_rate: 40 },
  { hairdresser_id: 'ana', catalog_item_id: 'corte', commission_rate: 40 },
  { hairdresser_id: 'sol', catalog_item_id: 'corte', commission_rate: 40 },
]

function renderStep(professionals: Professional[], onLineProfessionals = vi.fn()) {
  const line: CartLine = { key: 'l1', kind: 'service', name: 'Corte corto', unitPrice: 50000, qty: 1, catalogItemId: 'corte', productId: null, subcategoryId: null, professionals: [] }
  render(
    <StepAmount
      mode="income"
      lines={[line]}
      currency="ARS"
      onCurrency={vi.fn()}
      professionals={professionals}
      assignments={assignments}
      onUnitPrice={vi.fn()}
      onLineProfessionals={onLineProfessionals}
      paymentMethods={['Efectivo']}
      selectedMethod="Efectivo"
      onMethod={vi.fn()}
      priceTier="cash"
      onPriceTier={vi.fn()}
    />,
  )
  return onLineProfessionals
}

describe('StepAmount roles', () => {
  it('hides professionals whose role does not attend services', () => {
    roles.push(role('r-pelu', 'Peluquera', true, true), role('r-admin', 'Administrativa', false, false))
    renderStep([prof('eury', 'Eury', 'r-pelu'), prof('ana', 'Ana', 'r-admin')])
    expect(screen.queryByText('Eury')).not.toBeNull()
    expect(screen.queryByText('Ana')).toBeNull()
  })

  it('shows a professional whose role attends but does not earn commission, with no rate to tap', () => {
    roles.push(role('r-asis', 'Asistente', true, false))
    renderStep([prof('sol', 'Sol', 'r-asis')])
    expect(screen.queryByText('Sol')).not.toBeNull()
    expect(screen.queryByTitle('Asignada a este servicio')).toBeNull()
    expect(screen.queryByTitle('Asignada a este servicio al 40%')).toBeNull()
  })

  it('assigns a non-commission professional at 0', () => {
    roles.push(role('r-asis', 'Asistente', true, false))
    const onChange = renderStep([prof('sol', 'Sol', 'r-asis')])
    fireEvent.click(screen.getByText('Sol'))
    expect(onChange).toHaveBeenCalledWith('l1', [{ id: 'sol', commission_rate: 0 }])
  })

  it('treats a professional with no role as attending and earning commission', () => {
    roles.push(role('r-admin', 'Administrativa', false, false))
    renderStep([prof('eury', 'Eury', null)])
    expect(screen.queryByText('Eury')).not.toBeNull()
    expect(screen.getByTitle('Asignada a este servicio').textContent).toBe('40%')
  })
})
