import { describe, it, expect } from 'vitest'
import { reorderIds, compareByDisplayOrder } from './transactionOrder'

const ORDER = ['a', 'b', 'c', 'd', 'e']

describe('reorderIds', () => {
  it('mueve una fila hacia abajo, después del ancla', () => {
    expect(reorderIds(ORDER, { movedIds: ['a'], anchorIds: ['c'], position: 'after' }))
      .toEqual(['b', 'c', 'a', 'd', 'e'])
  })

  it('mueve una fila hacia arriba, antes del ancla', () => {
    expect(reorderIds(ORDER, { movedIds: ['d'], anchorIds: ['b'], position: 'before' }))
      .toEqual(['a', 'd', 'b', 'c', 'e'])
  })

  it('mueve un grupo como bloque conservando su orden interno', () => {
    expect(reorderIds(ORDER, { movedIds: ['b', 'd'], anchorIds: ['e'], position: 'after' }))
      .toEqual(['a', 'c', 'e', 'b', 'd'])
  })

  it('ancla en un grupo: before usa su primer miembro y after el último', () => {
    expect(reorderIds(ORDER, { movedIds: ['e'], anchorIds: ['b', 'c'], position: 'before' }))
      .toEqual(['a', 'e', 'b', 'c', 'd'])
    expect(reorderIds(ORDER, { movedIds: ['a'], anchorIds: ['b', 'c'], position: 'after' }))
      .toEqual(['b', 'c', 'a', 'd', 'e'])
  })

  it('no hace nada si el ancla está dentro de lo movido', () => {
    expect(reorderIds(ORDER, { movedIds: ['a', 'b'], anchorIds: ['b'], position: 'after' }))
      .toEqual(ORDER)
  })

  it('no hace nada si el ancla no está en el orden actual', () => {
    expect(reorderIds(ORDER, { movedIds: ['a'], anchorIds: ['z'], position: 'after' }))
      .toEqual(ORDER)
  })

  it('no hace nada si no hay nada que mover', () => {
    expect(reorderIds(ORDER, { movedIds: ['z'], anchorIds: ['c'], position: 'after' }))
      .toEqual(ORDER)
  })
})

describe('compareByDisplayOrder', () => {
  const row = (id: string, date: string, created_at: string, display_position: number | null) =>
    ({ id, date, created_at, display_position })

  it('ordena por fecha descendente antes que por posición', () => {
    const older = row('a', '2026-05-01', '2026-05-01T10:00:00Z', 1)
    const newer = row('b', '2026-05-02', '2026-05-02T10:00:00Z', 99)
    expect([older, newer].sort(compareByDisplayOrder).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('dentro del día, la posición manual manda', () => {
    const first = row('a', '2026-05-01', '2026-05-01T08:00:00Z', 2)
    const second = row('b', '2026-05-01', '2026-05-01T09:00:00Z', 1)
    expect([first, second].sort(compareByDisplayOrder).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('una fila sin posición cuenta como 0 y queda arriba de su día', () => {
    const positioned = row('a', '2026-05-01', '2026-05-01T09:00:00Z', 1)
    const fresh = row('b', '2026-05-01', '2026-05-01T08:00:00Z', null)
    expect([positioned, fresh].sort(compareByDisplayOrder).map(r => r.id)).toEqual(['b', 'a'])
  })
})
