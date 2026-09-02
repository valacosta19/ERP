import type { HairdresserService, Professional } from '@/types'

export interface AssignedProfessional {
  id: string
  name: string
  commission_rate: number
}

export function assignedProfessionalsFor(
  serviceId: string,
  assignments: HairdresserService[],
  professionals: Professional[],
): AssignedProfessional[] {
  const byId = new Map(professionals.map(p => [p.id, p]))
  return assignments
    .filter(a => a.catalog_item_id === serviceId)
    .flatMap(a => {
      const professional = byId.get(a.hairdresser_id)
      if (!professional || !professional.active) return []
      return [{ id: professional.id, name: professional.name, commission_rate: a.commission_rate }]
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}
