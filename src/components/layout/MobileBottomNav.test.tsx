// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Profile } from '@/types'
import { AuthContext } from './AuthContext'
import { MobileBottomNav } from './MobileBottomNav'
import { makeAuth } from '@/test/auth'

afterEach(cleanup)

function renderNav(role: Profile['role']) {
  const profile = { id: 'u1', role } as Profile
  render(
    <AuthContext.Provider value={makeAuth({ profile })}>
      <MemoryRouter initialEntries={['/transactions']}>
        <MobileBottomNav />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('MobileBottomNav', () => {
  it('shows the four essential sections to admins', () => {
    renderNav('admin')
    expect(screen.getByRole('link', { name: 'Transacciones' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Inventario' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Reportes' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Cuentas' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull()
  })

  it('does not expose the admin-only accounts section to employees', () => {
    renderNav('employee')
    expect(screen.queryByRole('link', { name: 'Cuentas' })).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })
})
