// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettleCommissionModal } from './SettleCommissionModal'

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }))

vi.mock('@/hooks/useStaffReceivables', () => ({
  useStaffReceivables: () => ({ data: [] }),
  useSettleCommissionPayout: () => ({ mutateAsync, isPending: false }),
}))

vi.mock('@/hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({
    data: [
      { id: 'cash', name: 'Efectivo', active: true, created_at: '2026-01-01' },
      { id: 'mp', name: 'Mercado Pago', active: true, created_at: '2026-01-02' },
    ],
  }),
}))

vi.mock('@/hooks/useTransactionCategories', () => ({
  useTransactionCategories: () => ({
    data: [{ id: 'commission-category', name: 'Comisiones', parent_id: 'expenses', transaction_type: 'expense' }],
  }),
}))

afterEach(cleanup)

beforeEach(() => {
  mutateAsync.mockReset()
  mutateAsync.mockResolvedValue('payout-id')
})

function renderModal() {
  render(
    <SettleCommissionModal
      open
      onClose={() => undefined}
      hairdresserId="hairdresser-id"
      hairdresserName="Flor"
      periodStart="2026-09-01"
      periodEnd="2026-09-15"
      grossAmount={1000}
      alreadySettled={0}
    />,
  )
}

describe('SettleCommissionModal', () => {
  it('submits one settlement split between Cash and Mercado Pago', async () => {
    renderModal()

    await waitFor(() => expect((screen.getByLabelText('Importe 1') as HTMLInputElement).value).toBe('1000'))
    fireEvent.click(screen.getByText('Dividir pago'))
    fireEvent.change(screen.getByLabelText('Importe 1'), { target: { value: '600' } })

    expect((screen.getByLabelText('Importe 2') as HTMLInputElement).value).toBe('400')
    fireEvent.click(screen.getByText('Confirmar liquidación'))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      installment_amount: 1000,
      payments: [
        { payment_method: 'Efectivo', currency: 'ARS', amount: 600 },
        { payment_method: 'Mercado Pago', currency: 'ARS', amount: 400 },
      ],
    }))
  })

  it('blocks submission when payment rows do not equal the net amount', async () => {
    renderModal()

    await waitFor(() => expect((screen.getByLabelText('Importe 1') as HTMLInputElement).value).toBe('1000'))
    fireEvent.change(screen.getByLabelText('Importe 1'), { target: { value: '900' } })
    fireEvent.click(screen.getByText('Confirmar liquidación'))

    expect(await screen.findByText('La suma de los métodos debe coincidir con el neto a pagar.')).toBeTruthy()
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
