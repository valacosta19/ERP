// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react'
import type { CatalogItem, Product, Professional, ServiceRecipe } from '@/types'
import type { ServiceSaleRow } from '@/hooks/useServiceSalesDetail'
import { groupServiceFamilies } from '@/lib/serviceFamilies'

const updatePrice = vi.fn(async () => {})
const confirmDialog = vi.fn<(request: unknown) => Promise<boolean>>(async () => true)

vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/lib/confirm', () => ({ confirmDialog: (request: unknown) => confirmDialog(request) }))
vi.mock('@/hooks/useDolarBlue', () => ({ useDolarBlue: () => ({ data: { venta: 1000, fechaActualizacion: '' }, isError: false }) }))
vi.mock('@/hooks/useServiceSalesDetail', () => ({
  useServiceSalesDetail: (from: string) => ({ data: from === '2026-09-01' ? monthRows : from === '2026-06-01' ? prevRows : [] }),
}))
vi.mock('@/hooks/useTransactionRecipeCosts', () => ({ useTransactionRecipeCosts: () => ({ data: snapshots }) }))
vi.mock('@/hooks/useReports', () => ({
  useProfitReport: () => ({
    data: {
      rows: [
        { month: '2026-09', product_profit: 5000 },
        { month: '2026-08', product_profit: 3000 },
        { month: '2026-07', product_profit: 3000 },
        { month: '2026-06', product_profit: 3000 },
        { month: '2026-04', product_profit: 99999 },
      ],
      totals: {},
    },
  }),
}))
vi.mock('@/hooks/useFixedCosts', () => ({
  useFixedCosts: () => ({ data: [{ id: 'f1', name: 'Alquiler', monthly_amount: 150000, active: true }, { id: 'f2', name: 'Viejo', monthly_amount: 999999, active: false }] }),
  useAllFixedCostRates: () => ({
    data: [
      { id: 'r1', fixed_cost_id: 'f1', monthly_amount: 100000, effective_from: '2026-01-01', created_at: '' },
      { id: 'r2', fixed_cost_id: 'f1', monthly_amount: 150000, effective_from: '2026-09-01', created_at: '' },
    ],
  }),
}))
vi.mock('@/hooks/useProfessionals', () => ({ useProfessionals: () => ({ data: professionals }) }))
vi.mock('@/hooks/useCatalogItems', () => ({
  useUpdateCatalogItem: () => ({ mutateAsync: updatePrice, isPending: false }),
}))

import { ProfitabilityTab } from './ProfitabilityTab'

function prof(id: string, name: string): Professional {
  return { id, name, active: true, role_id: null, created_at: '' }
}

const professionals = [prof('eury', 'Eury'), prof('fabi', 'Fabiana')]
const catalogItems: CatalogItem[] = [
  { id: 'corte-corto', name: 'Corte corto', price: 50000, price_transfer: 52000, price_card: 55000, hours: null, created_at: '' },
  { id: 'color-largo', name: 'Cambio de color largo', price: 100000, price_transfer: null, price_card: null, hours: null, created_at: '' },
]
const product: Product = {
  id: 'p1', name: 'Evolution', sku: '', unit: null, sale_price: 0, min_stock: 0, brand: null, deleted_at: null, created_at: '', skip_restock: false,
  unit_size: 100, min_cost: 1000, max_cost: 1000,
}
const recipes: ServiceRecipe[] = [{ id: 'r1', catalog_item_id: 'corte-corto', product_id: 'p1', quantity_grams: 10 }]

function sale(id: string, date: string, serviceId: string, amount: number, currency: string, hairdresser: string, rate: number): ServiceSaleRow {
  return { id, date, catalog_item_id: serviceId, amount, seña_amount: null, currency, transaction_hairdressers: [{ hairdresser_id: hairdresser, commission_rate: rate }] }
}

const monthRows: ServiceSaleRow[] = [
  sale('t1', '2026-09-01', 'corte-corto', 50000, 'ARS', 'eury', 40),
  sale('t2', '2026-09-02', 'corte-corto', 50000, 'ARS', 'fabi', 40),
  sale('t3', '2026-09-02', 'color-largo', 100, 'USD', 'eury', 45),
]
const prevRows: ServiceSaleRow[] = [
  ...[1, 2, 3, 4, 5, 6].map(i => sale(`c${i}`, `2026-0${6 + (i % 3)}-10`, 'corte-corto', 50000, 'ARS', 'eury', 40)),
  ...[1, 2, 3].map(i => sale(`k${i}`, `2026-0${5 + i}-20`, 'color-largo', 100000, 'ARS', 'eury', 45)),
]
const snapshots = [
  { transaction_id: 't1', quantity_grams: 10, avg_unit_cost: 1000, unit_size: 100 },
  ...[1, 2, 3, 4, 5, 6].map(i => ({ transaction_id: `c${i}`, quantity_grams: 10, avg_unit_cost: 1000, unit_size: 100 })),
]

function renderTab() {
  render(<ProfitabilityTab families={groupServiceFamilies(catalogItems)} recipes={recipes} productById={new Map([[product.id, product]])} />)
}

function rowOf(text: string) {
  return screen.getByText(text).closest('tr') as HTMLTableRowElement
}

function ledgerValue(label: string) {
  return screen.getByText(label).parentElement?.querySelector('dd')?.textContent
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 15, 12))
  updatePrice.mockClear()
  confirmDialog.mockClear()
})

describe('ProfitabilityTab', () => {
  it('closes the current month with real sales, cost snapshots, accrued commissions and the fixed costs in force', () => {
    renderTab()
    expect(screen.getByRole('heading', { name: /septiembre de 2026/i })).toBeTruthy()
    expect(ledgerValue('Ingresos por servicios')).toBe('$200.000')
    expect(ledgerValue('− Insumos')).toBe('$200')
    expect(ledgerValue('− Comisiones devengadas')).toBe('$85.000')
    expect(ledgerValue('= Margen de servicios')).toBe('$114.800')
    expect(ledgerValue('+ Margen de productos')).toBe('$5.000')
    expect(ledgerValue('= Margen bruto')).toBe('$119.800')
    expect(screen.getAllByText('− Fijos del mes').map(el => el.parentElement?.querySelector('dd')?.textContent)).toEqual(['$150.000', '$150.000'])
    expect(ledgerValue('= Resultado')).toBe('$-30.200')
    expect(screen.getByText('Faltan $30.200 para cubrir los fijos')).toBeTruthy()
    expect(screen.getByText('80%')).toBeTruthy()
  })

  it('lists services and commission per professional with a per-service breakdown', () => {
    renderTab()
    const eury = rowOf('Eury')
    expect(within(eury).getByText('2')).toBeTruthy()
    expect(within(eury).getByText('$150.000')).toBeTruthy()
    expect(within(eury).getByText('$65.000')).toBeTruthy()
    expect(within(eury).getByText('43,3%')).toBeTruthy()
    const fabi = rowOf('Fabiana')
    expect(within(fabi).getByText('1')).toBeTruthy()
    expect(within(fabi).getByText('$20.000')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Ver servicios de Eury'))
    const color = rowOf('Cambio de color largo')
    expect(within(color).getByText('1 servicio')).toBeTruthy()
    expect(within(color).getByText('$45.000')).toBeTruthy()
    expect(within(color).getByText('45,0%')).toBeTruthy()
  })

  it('projects the month from the previous three closed months and suggests raising the low-margin services', async () => {
    renderTab()
    expect(ledgerValue('Margen de servicios promedio')).toBe('$114.800')
    expect(ledgerValue('+ Margen de productos promedio')).toBe('$3.000')
    expect(ledgerValue('= Resultado estimado')).toBe('$-32.200')
    expect(screen.getByText('No se estima rentable: faltan $32.200 por mes')).toBeTruthy()
    expect(screen.getByText('Subir 58,5%')).toBeTruthy()
    expect(screen.getByText(/1 servicio con margen bruto por debajo del promedio \(57,4%\)/)).toBeTruthy()

    const corte = rowOf('Corto')
    expect(within(corte).getByText('2')).toBeTruthy()
    expect(within(corte).getAllByText('$50.000')).toHaveLength(2)
    expect(within(corte).getByText('$100')).toBeTruthy()
    expect(within(corte).getByText('$29.900')).toBeTruthy()
    expect(within(corte).getByText('59,8%')).toBeTruthy()
    expect(within(corte).getByText('—')).toBeTruthy()

    const color = rowOf('Largo')
    expect(within(color).getByText('55,0%')).toBeTruthy()
    expect(within(color).getByText('$158.500')).toBeTruthy()
    await act(async () => { fireEvent.click(within(color).getByText('Aplicar')) })
    expect(confirmDialog).toHaveBeenCalledTimes(1)
    expect(updatePrice).toHaveBeenCalledWith({ id: 'color-largo', price: 158500 })
  })

  it('applies every suggested raise at once, scaling transfer and card prices too', async () => {
    renderTab()
    fireEvent.change(screen.getByLabelText('Ganancia objetivo por mes'), { target: { value: '100000' } })
    expect(ledgerValue('= Resultado')).toBe('$-130.200')
    expect(screen.getByText('Faltan $130.200 para cubrir los fijos y la ganancia objetivo')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByText('Aplicar a todos los sugeridos')) })
    expect(confirmDialog).toHaveBeenCalledTimes(1)
    expect(updatePrice).toHaveBeenCalledTimes(1)
    expect(updatePrice).toHaveBeenCalledWith({ id: 'color-largo', price: 340400 })
  })

  it('switches to a closed month and handles months without sales', () => {
    renderTab()
    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '2026-08' } })
    expect(screen.getByRole('heading', { name: /agosto de 2026/i })).toBeTruthy()
    expect(screen.getByText('Mes cerrado')).toBeTruthy()
    expect(screen.getAllByText('− Fijos del mes').map(el => el.parentElement?.querySelector('dd')?.textContent)).toEqual(['$100.000', '$100.000'])
    expect(screen.getByText('Sin servicios registrados en el mes')).toBeTruthy()
    expect(ledgerValue('= Resultado estimado')).toBe('$-98.000')
    expect(screen.getByText('No se estima rentable: faltan $98.000 por mes')).toBeTruthy()
    expect(screen.queryByText(/Subir/)).toBeNull()
  })
})
