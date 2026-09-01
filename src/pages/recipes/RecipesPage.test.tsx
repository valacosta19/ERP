// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { CatalogItem, Product, ServiceRecipe } from '@/types'

const upsertRecipes = vi.fn(async () => {})
const updateHours = vi.fn(async () => {})
const updateProduct = vi.fn(async () => {})

vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/hooks/useCatalogItems', () => ({
  useCatalogItems: () => ({ data: catalogItems, isLoading: false }),
  useUpdateCatalogItemHours: () => ({ mutateAsync: updateHours }),
  useUpdateCatalogItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useProducts', () => ({
  useProducts: () => ({ data: products, isLoading: false }),
  useUpdateProduct: () => ({ mutateAsync: updateProduct }),
}))
vi.mock('@/hooks/useServiceRecipes', () => ({
  useAllServiceRecipes: () => ({ data: recipes, isLoading: false }),
  useUpsertServiceRecipes: () => ({ mutateAsync: upsertRecipes, isPending: false }),
}))
vi.mock('@/hooks/useFixedCosts', () => ({ useFixedCosts: () => ({ data: [] }) }))
vi.mock('@/hooks/useProfessionals', () => ({ useProfessionals: () => ({ data: [] }) }))
vi.mock('@/hooks/useHairdresserServices', () => ({ useHairdresserServices: () => ({ data: [] }) }))
vi.mock('@/hooks/useServiceSales', () => ({ useServiceSalesByMonth: () => ({ data: undefined }) }))

import { RecipesPage } from './RecipesPage'

function product(id: string, name: string, unit_size: number | null): Product {
  return { id, name, sku: '', unit: null, sale_price: 0, min_stock: 0, brand: null, deleted_at: null, created_at: '', skip_restock: false, unit_size, min_cost: 1000, max_cost: 1000, stock: 0 }
}

const catalogItems: CatalogItem[] = [
  { id: 'c-corto', name: 'Corte corto', price: 50000, hours: 1.5, created_at: '' },
  { id: 'c-medio', name: 'Corte mediano', price: 50000, hours: 1.5, created_at: '' },
  { id: 'onda', name: 'Descubre tu onda', price: 100000, hours: null, created_at: '' },
]
const products = [product('p1', 'Evolution', 100), product('p2', 'Gel', 200)]
const recipes: ServiceRecipe[] = [
  { id: 'r1', catalog_item_id: 'c-corto', product_id: 'p1', quantity_grams: 10 },
  { id: 'r2', catalog_item_id: 'c-medio', product_id: 'p1', quantity_grams: 15 },
]

function renderPage(path = '/recetas') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <RecipesPage />
    </MemoryRouter>,
  )
}

function card(family: string) {
  return screen.getByText(family).closest('section') as HTMLElement
}

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver
globalThis.IntersectionObserver = ObserverStub as unknown as typeof IntersectionObserver

afterEach(cleanup)
beforeEach(() => {
  upsertRecipes.mockClear()
  updateHours.mockClear()
  updateProduct.mockClear()
})

describe('RecipesPage', () => {
  it('shows one card per family with grams and cost per size', () => {
    renderPage()
    const corte = card('Corte')
    expect(within(corte).getByText('Corto')).toBeTruthy()
    expect(within(corte).getByText('Mediano')).toBeTruthy()
    expect(within(corte).getByText('10')).toBeTruthy()
    expect(within(corte).getByText('15')).toBeTruthy()
    expect(within(corte).getAllByText('$100')).toHaveLength(2)
    expect(within(corte).getAllByText('$150')).toHaveLength(2)
    expect(screen.getByText('Sin receta')).toBeTruthy()
    expect(screen.getByText('Descubre tu onda')).toBeTruthy()
  })

  it('saves only the sizes whose recipe changed', async () => {
    renderPage()
    fireEvent.click(within(card('Corte')).getByText('Editar'))
    const input = screen.getByLabelText('Evolution en Corte corto')
    fireEvent.change(input, { target: { value: '20' } })
    expect(within(card('Corte')).getAllByText('$200')).toHaveLength(2)
    await act(async () => { fireEvent.click(screen.getByText('Guardar receta')) })
    expect(upsertRecipes).toHaveBeenCalledTimes(1)
    expect(upsertRecipes).toHaveBeenCalledWith({ catalogItemId: 'c-corto', recipes: [{ product_id: 'p1', quantity_grams: 20 }] })
    expect(updateHours).not.toHaveBeenCalled()
  })

  it('adds a product to the family, saves hours, and removes rows', async () => {
    renderPage()
    fireEvent.click(within(card('Corte')).getByText('Editar'))
    fireEvent.change(within(card('Corte')).getByDisplayValue('Agregar insumo…'), { target: { value: 'p2' } })
    fireEvent.change(screen.getByLabelText('Gel en Corte mediano'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Horas de Corte corto'), { target: { value: '2' } })
    await act(async () => { fireEvent.click(screen.getByText('Guardar receta')) })
    expect(upsertRecipes).toHaveBeenCalledTimes(1)
    expect(upsertRecipes).toHaveBeenCalledWith({
      catalogItemId: 'c-medio',
      recipes: [
        { product_id: 'p1', quantity_grams: 15 },
        { product_id: 'p2', quantity_grams: 4 },
      ],
    })
    expect(updateHours).toHaveBeenCalledWith({ id: 'c-corto', hours: 2 })
  })

  it('opens an empty card in edit mode from the "Sin receta" chips', () => {
    renderPage()
    fireEvent.click(screen.getByText('Descubre tu onda'))
    const onda = card('Descubre tu onda')
    expect(within(onda).getByText('Guardar receta')).toBeTruthy()
    expect(within(onda).getByText('Sin insumos. Agregá el primero abajo.')).toBeTruthy()
  })

  it('lists supplies with cost per gram and lets the package size be edited', async () => {
    renderPage('/recetas?tab=insumos')
    const row = screen.getByText('Evolution').closest('tr') as HTMLTableRowElement
    expect(within(row).getByText('$10,00')).toBeTruthy()
    expect(within(row).getByText('2')).toBeTruthy()
    fireEvent.click(within(row).getByTitle('Clic para editar'))
    const input = within(row).getByDisplayValue('100') as HTMLInputElement
    fireEvent.change(input, { target: { value: '250' } })
    await act(async () => { fireEvent.blur(input) })
    expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', unit_size: 250 }))
  })
})
