// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { HairdresserService, Professional } from '@/types'
import type { CartLine } from './funnelTypes'

vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/hooks/useStaffRoles', () => ({ useStaffRoles: () => ({ data: [] }) }))

import { StepAmount } from './StepAmount'

afterEach(cleanup)

function prof(id: string, name: string): Professional {
  return { id, name, active: true, role_id: null, created_at: '' }
}

const professionals = [prof('flor', 'Flor'), prof('eury', 'Eury')]
const assignments: HairdresserService[] = [{ hairdresser_id: 'eury', catalog_item_id: 'corte', commission_rate: 40 }]

function line(professionals: CartLine['professionals'] = []): CartLine {
  return { key: 'l1', kind: 'service', name: 'Corte corto', unitPrice: 50000, qty: 1, catalogItemId: 'corte', productId: null, subcategoryId: null, professionals }
}

function renderStep(lineValue: CartLine, onLineProfessionals = vi.fn()) {
  render(
    <StepAmount
      mode="income"
      lines={[lineValue]}
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

describe('StepAmount professionals', () => {
  it('lists the professional assigned to the service first, with her rate', () => {
    renderStep(line())
    const names = screen.getAllByRole('button').map(b => b.textContent ?? '')
    const eury = names.findIndex(t => t.includes('Eury'))
    const flor = names.findIndex(t => t.includes('Flor'))
    expect(eury).toBeGreaterThan(-1)
    expect(eury).toBeLessThan(flor)
    expect(screen.getByTitle('Asignada a este servicio').textContent).toBe('40%')
  })

  it('assigns the professional with her assigned rate in one tap', () => {
    const onChange = renderStep(line())
    fireEvent.click(screen.getByTitle('Asignada a este servicio al 40%'))
    expect(onChange).toHaveBeenCalledWith('l1', [{ id: 'eury', commission_rate: 40 }])
  })

  it('assigns an unassigned professional at 0 so the rate can be typed', () => {
    const onChange = renderStep(line())
    fireEvent.click(screen.getByText('Flor'))
    expect(onChange).toHaveBeenCalledWith('l1', [{ id: 'flor', commission_rate: 0 }])
  })

  it('shows a free input when the loaded rate differs from the assigned one and removes on second tap', () => {
    const onChange = renderStep(line([{ id: 'eury', commission_rate: 35 }]))
    const input = screen.getByPlaceholderText('0') as HTMLInputElement
    expect(input.value).toBe('35')
    fireEvent.change(input, { target: { value: '45' } })
    expect(onChange).toHaveBeenCalledWith('l1', [{ id: 'eury', commission_rate: 45 }])
    fireEvent.click(screen.getByTitle('Quitar'))
    expect(onChange).toHaveBeenLastCalledWith('l1', [])
  })
})

describe('StepAmount Movimiento', () => {
  const simpleProps = {
    mode: 'simple' as const,
    type: 'transfer' as const,
    currency: 'ARS' as const,
    onCurrency: vi.fn(),
    manualAmount: 1000,
    onAmount: vi.fn(),
    transferDestinationAmount: 900,
    onTransferDestinationAmount: vi.fn(),
    transferDestinationCurrency: 'USD' as const,
    onTransferDestinationCurrency: vi.fn(),
    simpleMethod: 'Efectivo',
    onMethod: vi.fn(),
    transferDirection: 'entrada' as const,
    onDirection: vi.fn(),
    transferDestinationMethod: 'Mercado Pago',
    onTransferDestinationMethod: vi.fn(),
    paymentMethods: ['Efectivo', 'Mercado Pago'],
  }

  it('shows direction and one account selector for a generic movement category', () => {
    render(<StepAmount {...simpleProps} isInternalTransfer={false} />)

    expect(screen.getByText('Dirección')).toBeTruthy()
    expect(screen.getByText('Cuenta / caja')).toBeTruthy()
    expect(screen.queryByText('Cuenta de origen')).toBeNull()
    expect(screen.queryByText('Cuenta de destino')).toBeNull()
  })

  it('shows distinct origin and destination selectors only for Transferencia interna', () => {
    render(<StepAmount {...simpleProps} isInternalTransfer />)

    expect(screen.queryByText('Dirección')).toBeNull()
    expect(screen.getByText('Cuenta de origen')).toBeTruthy()
    expect(screen.getByText('Cuenta de destino')).toBeTruthy()
    expect(screen.getByText('Moneda de origen')).toBeTruthy()
    expect(screen.getByText('Moneda de destino')).toBeTruthy()
    expect(screen.getByLabelText('Importe de destino')).toBeTruthy()
  })
})
