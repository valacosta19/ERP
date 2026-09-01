import { describe, it, expect } from 'vitest'
import { assignedProfessionalsFor, teamCommissionFor } from './commissions'
import type { HairdresserService, Professional } from '@/types'

function prof(id: string, name: string, active = true): Professional {
  return { id, name, active, role_id: null, created_at: '' }
}

const professionals = [prof('e', 'Eury'), prof('f', 'Fabiana'), prof('l', 'Flor'), prof('x', 'Ex', false)]
const assignments: HairdresserService[] = [
  { hairdresser_id: 'f', catalog_item_id: 'corte', commission_rate: 7 },
  { hairdresser_id: 'e', catalog_item_id: 'corte', commission_rate: 40 },
  { hairdresser_id: 'l', catalog_item_id: 'corte', commission_rate: 40 },
  { hairdresser_id: 'x', catalog_item_id: 'corte', commission_rate: 50 },
  { hairdresser_id: 'e', catalog_item_id: 'color', commission_rate: 45 },
]

describe('assignedProfessionalsFor', () => {
  it('returns active assigned professionals sorted by name with their rate', () => {
    expect(assignedProfessionalsFor('corte', assignments, professionals)).toEqual([
      { id: 'e', name: 'Eury', commission_rate: 40 },
      { id: 'f', name: 'Fabiana', commission_rate: 7 },
      { id: 'l', name: 'Flor', commission_rate: 40 },
    ])
  })
  it('returns an empty list without assignments', () => {
    expect(assignedProfessionalsFor('nada', assignments, professionals)).toEqual([])
  })
})

describe('teamCommissionFor', () => {
  it('sums the rates of the team members assigned to the service', () => {
    expect(teamCommissionFor('corte', ['e', 'f'], assignments, professionals)).toEqual({
      pct: 47,
      members: [
        { id: 'e', name: 'Eury', commission_rate: 40 },
        { id: 'f', name: 'Fabiana', commission_rate: 7 },
      ],
    })
  })
  it('ignores team members not assigned to the service', () => {
    expect(teamCommissionFor('color', ['e', 'f'], assignments, professionals)?.pct).toBe(45)
  })
  it('is null when nobody in the team does the service', () => {
    expect(teamCommissionFor('color', ['f', 'l'], assignments, professionals)).toBeNull()
    expect(teamCommissionFor('corte', [], assignments, professionals)).toBeNull()
  })
})
