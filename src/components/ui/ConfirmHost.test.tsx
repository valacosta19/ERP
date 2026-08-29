// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { ConfirmHost } from './ConfirmHost'
import { confirmDialog } from '@/lib/confirm'

afterEach(cleanup)

describe('ConfirmHost', () => {
  it('renders nothing until a confirmation is requested', () => {
    const { container } = render(<ConfirmHost />)
    expect(container.innerHTML).toBe('')
  })

  it('resolves true when the user confirms', async () => {
    render(<ConfirmHost />)
    let answer: Promise<boolean>
    act(() => { answer = confirmDialog({ message: '¿Eliminar?', confirmLabel: 'Eliminar', danger: true }) })
    expect(screen.getByText('¿Eliminar?')).toBeTruthy()
    fireEvent.click(screen.getByText('Eliminar'))
    await expect(answer!).resolves.toBe(true)
    expect(screen.queryByText('¿Eliminar?')).toBeNull()
  })

  it('resolves false on cancel and on Escape', async () => {
    render(<ConfirmHost />)
    let first: Promise<boolean>
    act(() => { first = confirmDialog({ message: 'uno' }) })
    fireEvent.click(screen.getByText('Cancelar'))
    await expect(first!).resolves.toBe(false)

    let second: Promise<boolean>
    act(() => { second = confirmDialog({ message: 'dos' }) })
    fireEvent.keyDown(document, { key: 'Escape' })
    await expect(second!).resolves.toBe(false)
  })
})
