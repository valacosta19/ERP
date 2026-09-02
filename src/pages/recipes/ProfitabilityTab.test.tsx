// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react'
import type { CatalogItem, HairdresserService, Product, Professional, ServiceRecipe } from '@/types'
import { groupServiceFamilies } from '@/lib/serviceFamilies'

const updatePrice = vi.fn(async () => {})
const confirmDialog = vi.fn<(request: unknown) => Promise<boolean>>(async () => true)

vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/lib/confirm', () => ({ confirmDialog: (request: unknown) => confirmDialog(request) }))
vi.mock('@/hooks/useFixedCosts', () => ({
  useFixedCosts: () => ({ data: [{ id: 'f1', name: 'Alquiler', monthly_amount: 160000, active: true }, { id: 'f2', name: 'Viejo', monthly_amount: 999999, active: false }] }),
}))
vi.mock('@/hooks/useProfessionals', () => ({ useProfessionals: () => ({ data: professionals }) }))
vi.mock('@/hooks/useHairdresserServices', () => ({ useHairdresserServices: () => ({ data: assignments }) }))
vi.mock('@/hooks/useServiceSales', () => ({
  useServiceSalesByMonth: () => ({ data: { countByService: new Map([['corte-corto', 6]]), months: 3 } }),
}))
vi.mock('@/hooks/useCatalogItems', () => ({
  useCatalogItems: () => ({ data: catalogItems }),
  useUpdateCatalogItem: () => ({ mutateAsync: updatePrice, isPending: false }),
  useUpdateCatalogItemHours: () => ({ mutateAsync: vi.fn() }),
}))

import { ProfitabilityTab } from './ProfitabilityTab'

function prof(id: string, name: string): Professional {
  return { id, name, active: true, role_id: null, created_at: '' }
}

const professionals = [prof('eury', 'Eury'), prof('fabi', 'Fabiana')]
const assignments: HairdresserService[] = [
  { hairdresser_id: 'eury', catalog_item_id: 'corte-corto', commission_rate: 40 },
  { hairdresser_id: 'fabi', catalog_item_id: 'corte-corto', commission_rate: 7 },
]
const catalogItems: CatalogItem[] = [
  { id: 'corte-corto', name: 'Corte corto', price: 50000, price_transfer: 52000, price_card: 55000, hours: 1.5, created_at: '' },
  { id: 'color-largo', name: 'Cambio de color largo', price: 100000, price_transfer: null, price_card: null, hours: null, created_at: '' },
]
const product: Product = {
  id: 'p1', name: 'Evolution', sku: '', unit: null, sale_price: 0, min_stock: 0, brand: null, deleted_at: null, created_at: '', skip_restock: false,
  unit_size: 100, min_cost: 1000, max_cost: 1000,
}
const recipes: ServiceRecipe[] = [{ id: 'r1', catalog_item_id: 'corte-corto', product_id: 'p1', quantity_grams: 10 }]

function renderTab(onEditFamily = vi.fn()) {
  render(
    <ProfitabilityTab
      families={groupServiceFamilies(catalogItems)}
      recipes={recipes}
      productById={new Map([[product.id, product]])}
      onEditFamily={onEditFamily}
    />,
  )
}

function rowOf(text: string) {
  return screen.getByText(text).closest('tr') as HTMLTableRowElement
}

afterEach(cleanup)
beforeEach(() => {
  updatePrice.mockClear()
  confirmDialog.mockClear()
})

describe('ProfitabilityTab', () => {
  it('uses the assigned professional with most services as default team and shows the fixed cost per hour as reference', () => {
    renderTab()
    const corte = rowOf('Corto')
    expect(within(corte).getByText('Eury 40%')).toBeTruthy()
    expect(within(corte).getByText('$20.000')).toBeTruthy()
    expect(within(corte).getByText('$100')).toBeTruthy()
    expect(within(corte).getByText('$29.900')).toBeTruthy()
    expect(within(corte).getByText('59,8%')).toBeTruthy()
    expect(screen.getByText('$1.000')).toBeTruthy()
  })

  it('adds a team member and recalculates the commission', () => {
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: 'Fabiana' }))
    const corte = rowOf('Corto')
    expect(within(corte).getByText('Eury 40% · Fabiana 7%')).toBeTruthy()
    expect(within(corte).getByText('$23.500')).toBeTruthy()
  })

  it('leaves services nobody in the team does without margin and out of the summary', () => {
    renderTab()
    const color = rowOf('Largo')
    expect(within(color).getByText('nadie del equipo')).toBeTruthy()
    expect(within(color).getAllByText('—')).toHaveLength(5)
    expect(within(color).queryByText('$100.000', { selector: 'span' })).toBeNull()
    expect(screen.getByText(/1 servicio no lo hace nadie del equipo marcado: sin margen/)).toBeTruthy()
    expect(screen.getByText('de 1')).toBeTruthy()
    fireEvent.click(within(color).getByLabelText('Ver desglose'))
    expect(screen.getByText('sin calcular: nadie del equipo hace este servicio')).toBeTruthy()
  })

  it('suggests a price for the target margin and applies it after confirmation', async () => {
    renderTab()
    const corte = rowOf('Corto')
    expect(within(corte).getByText('$700')).toBeTruthy()
    await act(async () => { fireEvent.click(within(corte).getByText('Aplicar')) })
    expect(confirmDialog).toHaveBeenCalledTimes(1)
    expect(updatePrice).toHaveBeenCalledWith({ id: 'corte-corto', price: 700 })
  })

  it('switches the price by payment method and the reference fixed cost by hours per month without touching margins', () => {
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: 'Tarjeta' }))
    expect(within(rowOf('Corto')).getByText('$55.000')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Horas trabajadas por mes'), { target: { value: '320' } })
    expect(screen.getByText('$500')).toBeTruthy()
    expect(within(rowOf('Corto')).getByText('$32.900')).toBeTruthy()
  })

  it('projects the monthly margin, closes the month against fixed costs and opens the recipe from the breakdown', () => {
    const onEditFamily = vi.fn()
    renderTab(onEditFamily)
    const corte = rowOf('Corto')
    expect(within(corte).getByText('2')).toBeTruthy()
    expect(within(corte).getByText('$59.800')).toBeTruthy()
    expect(screen.getByText('$160.000')).toBeTruthy()
    expect(screen.getByText('$-100.200')).toBeTruthy()
    expect(screen.getByText('No rentable: el margen bruto no cubre los fijos')).toBeTruthy()
    fireEvent.click(within(corte).getByLabelText('Ver desglose'))
    fireEvent.click(screen.getByText('Editar receta'))
    expect(onEditFamily).toHaveBeenCalledWith('Corte')
  })
})
