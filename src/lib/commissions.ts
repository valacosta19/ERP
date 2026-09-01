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

export function teamCommissionFor(
  serviceId: string,
  teamIds: Iterable<string>,
  assignments: HairdresserService[],
  professionals: Professional[],
): { pct: number; members: AssignedProfessional[] } | null {
  const team = new Set(teamIds)
  const members = assignedProfessionalsFor(serviceId, assignments, professionals).filter(p => team.has(p.id))
  if (members.length === 0) return null
  return { pct: members.reduce((s, p) => s + p.commission_rate, 0), members }
}
