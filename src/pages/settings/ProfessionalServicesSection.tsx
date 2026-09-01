import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { InlineEditCell } from '@/components/ui/InlineEditCell'
import { useProfessionals } from '@/hooks/useProfessionals'
import { useCatalogItems } from '@/hooks/useCatalogItems'
import { useHairdresserServices, useSetHairdresserServices } from '@/hooks/useHairdresserServices'
import { useStaffRoles } from '@/hooks/useStaffRoles'
import { groupServiceFamilies } from '@/lib/serviceFamilies'
import { showToast } from '@/lib/toast'
import type { Professional } from '@/types'

function fmtPct(value: number) {
  return `${value.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`
}

function parseRate(value: string): number | null | undefined {
  if (value.trim() === '') return null
  const n = parseFloat(value)
  if (isNaN(n) || n < 0 || n > 100) return undefined
  return n
}

export function ProfessionalServicesSection() {
  const [search, setSearch] = useState('')
  const { data: professionals = [] } = useProfessionals()
  const { data: catalogItems = [] } = useCatalogItems()
  const { data: assignments = [] } = useHairdresserServices()
  const { data: staffRoles = [] } = useStaffRoles()
  const setServices = useSetHairdresserServices()

  const columns = useMemo(() => {
    const roleById = new Map(staffRoles.map(r => [r.id, r]))
    return professionals.filter(p => {
      if (!p.active) return false
      const role = p.role_id != null ? roleById.get(p.role_id) : undefined
      return role == null || role.earns_commission
    })
  }, [professionals, staffRoles])
  const families = useMemo(() => {
    const all = groupServiceFamilies(catalogItems)
    const q = search.trim().toLowerCase()
    return q ? all.filter(f => f.family.toLowerCase().includes(q)) : all
  }, [catalogItems, search])

  const rateByKey = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of assignments) map.set(`${a.hairdresser_id}:${a.catalog_item_id}`, a.commission_rate)
    return map
  }, [assignments])

  function familyRate(prof: Professional, serviceIds: string[]): { value: string; display: string } {
    const rates = serviceIds.map(id => rateByKey.get(`${prof.id}:${id}`))
    const defined = rates.filter((r): r is number => r != null)
    if (defined.length === 0) return { value: '', display: '' }
    const uniform = defined.length === rates.length && defined.every(r => r === defined[0])
    return uniform ? { value: String(defined[0]), display: fmtPct(defined[0]) } : { value: '', display: 'mixto' }
  }

  async function save(prof: Professional, serviceIds: string[], value: string) {
    const rate = parseRate(value)
    if (rate === undefined) {
      showToast('La comisión debe ser un número entre 0 y 100.')
      return
    }
    await setServices.mutateAsync({ hairdresser_id: prof.id, rows: serviceIds.map(id => ({ catalog_item_id: id, commission_rate: rate })) })
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Servicios por profesional</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Escribí el % de comisión en la celda para asignar el servicio; dejala vacía para quitarlo. El % aplica a todas las tallas del servicio.
          </p>
        </div>
        <div className="relative w-56 shrink-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar servicio…"
            className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          />
        </div>
      </div>
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-x-auto">
        {columns.length === 0 ? (
          <p className="px-4 py-3 text-sm text-[var(--color-muted)]">Sin profesionales activas que cobren comisión</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Servicio</th>
                {columns.map(p => (
                  <th key={p.id} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] whitespace-nowrap">{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {families.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-xs text-[var(--color-muted)]">Ningún servicio coincide</td>
                </tr>
              )}
              {families.map(family => {
                const serviceIds = family.columns.map(c => c.item.id)
                return (
                  <tr key={family.family} className="border-t border-[var(--color-border)]">
                    <td className="px-4 py-2 text-[var(--color-text)]">
                      {family.family}
                      {family.columns.length > 1 && (
                        <span className="ml-1.5 text-xs text-[var(--color-muted)]">· {family.columns.length} tallas</span>
                      )}
                    </td>
                    {columns.map(p => {
                      const { value, display } = familyRate(p, serviceIds)
                      return (
                        <td key={p.id} className="px-3 py-1.5 text-right tabular-nums">
                          <InlineEditCell
                            type="number"
                            value={value}
                            displayValue={display}
                            placeholder="—"
                            onSave={v => save(p, serviceIds, v)}
                            className={display === 'mixto' ? 'text-xs text-[var(--color-muted)]' : 'text-[var(--color-text)]'}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
