import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ENTITY_FIELDS, ENTITY_LABELS } from '../importLogic'
import type { ParsedSheet, EntityType, SheetAssignments, ColumnMappings } from '../importTypes'

interface Props {
  sheets: ParsedSheet[]
  assignments: SheetAssignments
  mappings: ColumnMappings
  onChange: (mappings: ColumnMappings) => void
  onNext: () => void
  onBack: () => void
}

export function StepMapping({ sheets, assignments, mappings, onChange, onNext, onBack }: Props) {
  const assignedSheets = sheets.filter(s => assignments[s.name])

  const setFieldMapping = (sheetName: string, fieldKey: string, colHeader: string) => {
    onChange({
      ...mappings,
      [sheetName]: { ...(mappings[sheetName] ?? {}), [fieldKey]: colHeader },
    })
  }

  const allRequiredMapped = assignedSheets.every(sheet => {
    const entityType = assignments[sheet.name] as EntityType
    return ENTITY_FIELDS[entityType]
      .filter(f => f.required)
      .every(f => mappings[sheet.name]?.[f.key])
  })

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[var(--color-muted)]">Mapea las columnas del archivo a los campos de cada entidad. Los campos con * son obligatorios.</p>
      {assignedSheets.map(sheet => {
        const entityType = assignments[sheet.name] as EntityType
        const fields = ENTITY_FIELDS[entityType]
        const colOptions = [
          { value: '', label: '— no importar —' },
          ...sheet.headers.map(h => ({ value: h, label: h })),
        ]
        return (
          <div key={sheet.name} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-col gap-4">
            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">{sheet.name}</p>
              <p className="text-xs text-[var(--color-muted)]">{ENTITY_LABELS[entityType]}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {fields.map(field => (
                <Select
                  key={field.key}
                  label={`${field.label}${field.required ? ' *' : ''}`}
                  options={colOptions}
                  value={mappings[sheet.name]?.[field.key] ?? ''}
                  onChange={e => setFieldMapping(sheet.name, field.key, e.target.value)}
                />
              ))}
            </div>
          </div>
        )
      })}
      <div className="flex gap-3 justify-end">
        <Button variant="secondary" onClick={onBack}>Atrás</Button>
        <Button onClick={onNext} disabled={!allRequiredMapped}>Siguiente</Button>
      </div>
    </div>
  )
}
