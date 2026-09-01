// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react'
import type { CatalogItem, HairdresserService, Professional, StaffRole } from '@/types'

const mutateAsync = vi.fn(async () => {})
const showToast = vi.fn()
let assignments: HairdresserService[] = []

vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/lib/toast', () => ({ showToast: (...args: unknown[]) => showToast(...args) }))
vi.mock('@/hooks/useProfessionals', () => ({
  useProfessionals: () => ({ data: professionals }),
}))
vi.mock('@/hooks/useCatalogItems', () => ({ useCatalogItems: () => ({ data: catalogItems }) }))
vi.mock('@/hooks/useStaffRoles', () => ({ useStaffRoles: () => ({ data: roles }) }))
vi.mock('@/hooks/useHairdresserServices', () => ({
  useHairdresserServices: () => ({ data: assignments }),
  useSetHairdresserServices: () => ({ mutateAsync }),
}))

import { ProfessionalServicesSection } from './ProfessionalServicesSection'

function prof(id: string, name: string, role_id: string | null = null): Professional {
  return { id, name, active: true, role_id, created_at: '' }
}
function item(id: string, name: string): CatalogItem {
  return { id, name, price: 0, created_at: '' }
}

const roles: StaffRole[] = [{ id: 'admin', name: 'Administrativa', assigns_services: false, earns_commission: false, created_at: '' }]
const professionals = [prof('eury', 'Eury'), prof('fabi', 'Fabiana'), prof('vale', 'Valentina', 'admin')]
const catalogItems = [item('c1', 'Corte corto'), item('c2', 'Corte mediano'), item('c3', 'Corte largo'), item('sena', 'Seña')]

afterEach(cleanup)
beforeEach(() => {
  mutateAsync.mockClear()
  showToast.mockClear()
  assignments = [
    { hairdresser_id: 'eury', catalog_item_id: 'c1', commission_rate: 40 },
    { hairdresser_id: 'eury', catalog_item_id: 'c2', commission_rate: 40 },
    { hairdresser_id: 'eury', catalog_item_id: 'c3', commission_rate: 40 },
    { hairdresser_id: 'fabi', catalog_item_id: 'c1', commission_rate: 7 },
  ]
})

function corteRow() {
  return screen.getByText('Corte').closest('tr') as HTMLTableRowElement
}

describe('ProfessionalServicesSection', () => {
  it('shows one row per service family and only professionals who earn commission', () => {
    render(<ProfessionalServicesSection />)
    expect(screen.getByText('Eury')).toBeTruthy()
    expect(screen.getByText('Fabiana')).toBeTruthy()
    expect(screen.queryByText('Valentina')).toBeNull()
    expect(screen.queryByText('Seña')).toBeNull()
    expect(screen.queryByText('Corto')).toBeNull()
    const row = corteRow()
    expect(within(row).getByText('· 3 tallas')).toBeTruthy()
    expect(within(row).getByText('40 %')).toBeTruthy()
    expect(within(row).getByText('mixto')).toBeTruthy()
  })

  it('saves the same rate for every size of the family', async () => {
    render(<ProfessionalServicesSection />)
    fireEvent.click(within(corteRow()).getByText('40 %'))
    const input = within(corteRow()).getByDisplayValue('40') as HTMLInputElement
    fireEvent.change(input, { target: { value: '35' } })
    await act(async () => { fireEvent.blur(input) })
    expect(mutateAsync).toHaveBeenCalledWith({
      hairdresser_id: 'eury',
      rows: [
        { catalog_item_id: 'c1', commission_rate: 35 },
        { catalog_item_id: 'c2', commission_rate: 35 },
        { catalog_item_id: 'c3', commission_rate: 35 },
      ],
    })
  })

  it('unassigns the family when the cell is cleared', async () => {
    render(<ProfessionalServicesSection />)
    fireEvent.click(within(corteRow()).getByText('40 %'))
    const input = within(corteRow()).getByDisplayValue('40') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    await act(async () => { fireEvent.blur(input) })
    expect(mutateAsync).toHaveBeenCalledWith({
      hairdresser_id: 'eury',
      rows: [
        { catalog_item_id: 'c1', commission_rate: null },
        { catalog_item_id: 'c2', commission_rate: null },
        { catalog_item_id: 'c3', commission_rate: null },
      ],
    })
  })

  it('rejects rates outside 0-100 without saving', async () => {
    render(<ProfessionalServicesSection />)
    fireEvent.click(within(corteRow()).getByText('40 %'))
    const input = within(corteRow()).getByDisplayValue('40') as HTMLInputElement
    fireEvent.change(input, { target: { value: '150' } })
    await act(async () => { fireEvent.blur(input) })
    expect(mutateAsync).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('La comisión debe ser un número entre 0 y 100.')
  })
})
