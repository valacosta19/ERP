import { describe, it, expect } from 'vitest'
import { splitServiceName, groupServiceFamilies } from './serviceFamilies'
import type { CatalogItem } from '@/types'

function item(name: string): CatalogItem {
  return { id: name, name, price: 0, created_at: '', hours: null, price_transfer: null, price_card: null }
}

describe('splitServiceName', () => {
  it('splits the trailing size word', () => {
    expect(splitServiceName('Corte corto')).toEqual({ family: 'Corte', size: 'corto' })
    expect(splitServiceName('Retoque de raíces con deco LARGO ')).toEqual({ family: 'Retoque de raíces con deco', size: 'largo' })
  })
  it('keeps names without a size suffix whole', () => {
    expect(splitServiceName('Descubre tu onda')).toEqual({ family: 'Descubre tu onda', size: null })
    expect(splitServiceName('Cortometraje')).toEqual({ family: 'Cortometraje', size: null })
  })
})

describe('groupServiceFamilies', () => {
  it('groups sizes under one family in corto/mediano/largo order', () => {
    const families = groupServiceFamilies([item('Corte largo'), item('Corte corto'), item('Corte mediano')])
    expect(families).toHaveLength(1)
    expect(families[0].family).toBe('Corte')
    expect(families[0].columns.map(c => c.size)).toEqual(['corto', 'mediano', 'largo'])
  })
  it('puts single-size services in the unico column and sorts families by name', () => {
    const families = groupServiceFamilies([item('Olaplex agregado'), item('Cambio de color corto')])
    expect(families.map(f => f.family)).toEqual(['Cambio de color', 'Olaplex agregado'])
    expect(families[1].columns).toEqual([{ size: 'unico', item: item('Olaplex agregado') }])
  })
  it('excludes anticipo and seña', () => {
    expect(groupServiceFamilies([item('Anticipo'), item('Seña'), item('Corte corto')])).toHaveLength(1)
  })
})
