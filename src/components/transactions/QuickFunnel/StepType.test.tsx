// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StepType } from './StepType'

afterEach(cleanup)

describe('StepType', () => {
  it('offers exactly Ingreso, Gasto, Costo, and Movimiento without a separate internal-transfer tile', () => {
    const onPick = vi.fn()
    render(<StepType value={null} onPick={onPick} />)

    expect(screen.getAllByRole('button')).toHaveLength(4)
    expect(screen.getByText('Ingreso')).toBeTruthy()
    expect(screen.getByText('Gasto')).toBeTruthy()
    expect(screen.getByText('Costo')).toBeTruthy()
    expect(screen.queryByText('Transferencia interna')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Movimiento Entrada o salida de caja/i }))
    expect(onPick).toHaveBeenLastCalledWith('transfer')
  })
})
