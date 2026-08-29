// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { Toaster } from './Toaster'
import { showToast } from '@/lib/toast'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Toaster', () => {
  it('shows a toast and removes it on close', () => {
    render(<Toaster />)
    act(() => showToast('Guardado', 'success'))
    expect(screen.getByRole('alert').textContent).toContain('Guardado')
    fireEvent.click(screen.getByLabelText('Cerrar aviso'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('auto-dismisses after the timeout', () => {
    vi.useFakeTimers()
    render(<Toaster />)
    act(() => showToast('Error de red'))
    expect(screen.getByRole('alert')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(7100) })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
