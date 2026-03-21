import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ENTITY_LABELS } from '../importLogic'
import type { ParsedSheet, EntityType, SheetAssignments } from '../importTypes'

const ENTITY_OPTIONS = [
  { value: '', label: 'Ignorar' },
  ...Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label })),
]

interface Props {
  sheets: ParsedSheet[]
  assignments: SheetAssignments
  onChange: (assignments: SheetAssignments) => void
  onNext: () => void
  onBack: () => void
}

export function StepSheets({ sheets, assignments, onChange, onNext, onBack }: Props) {
  const hasAssignment = Object.values(assignments).some(v => v !== '')

  const setAssignment = (sheetName: string, entityType: EntityType | '') => {
    onChange({ ...assignments, [sheetName]: entityType })
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[var(--color-muted)]">Asigna cada hoja del archivo a un tipo de entidad.</p>
      <div className="flex flex-col gap-3">
        {sheets.map(sheet => (
          <div key={sheet.name} className="flex items-center gap-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
            <span className="flex-1 text-sm font-medium text-[var(--color-text)] truncate">{sheet.name}</span>
            <span className="text-xs text-[var(--color-muted)]">{sheet.rows.length} filas</span>
            <div className="w-52">
              <Select
                options={ENTITY_OPTIONS}
                value={assignments[sheet.name] ?? ''}
                onChange={e => setAssignment(sheet.name, e.target.value as EntityType | '')}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 justify-end">
        <Button variant="secondary" onClick={onBack}>Atrás</Button>
        <Button onClick={onNext} disabled={!hasAssignment}>Siguiente</Button>
      </div>
    </div>
  )
}
