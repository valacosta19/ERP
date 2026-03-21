import { Button } from '@/components/ui/Button'
import { ENTITY_LABELS, ENTITY_FIELDS } from '../importLogic'
import type { ParsedSheet, EntityType, SheetAssignments, ColumnMappings } from '../importTypes'

interface Props {
  sheets: ParsedSheet[]
  assignments: SheetAssignments
  mappings: ColumnMappings
  onNext: () => void
  onBack: () => void
}

export function StepPreview({ sheets, assignments, mappings, onNext, onBack }: Props) {
  const assignedSheets = sheets.filter(s => assignments[s.name])

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[var(--color-muted)]">Revisa los datos antes de importar. Se muestran las primeras 5 filas de cada hoja.</p>
      {assignedSheets.map(sheet => {
        const entityType = assignments[sheet.name] as EntityType
        const fields = ENTITY_FIELDS[entityType]
        const sheetMapping = mappings[sheet.name] ?? {}
        const mappedFields = fields.filter(f => sheetMapping[f.key])
        const preview = sheet.rows.slice(0, 5)

        return (
          <div key={sheet.name} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--color-text)]">{sheet.name}</span>
                <span className="text-xs text-[var(--color-muted)]">{ENTITY_LABELS[entityType]}</span>
              </div>
              <span className="text-xs text-[var(--color-muted)]">{sheet.rows.length} filas</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {mappedFields.map(f => (
                      <th key={f.key} className="px-3 py-2 text-left font-semibold text-[var(--color-muted)] uppercase tracking-wider whitespace-nowrap">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0">
                      {mappedFields.map(f => (
                        <td key={f.key} className="px-3 py-2 text-[var(--color-text)] whitespace-nowrap max-w-[200px] truncate">
                          {row[sheetMapping[f.key]] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      <div className="flex gap-3 justify-end">
        <Button variant="secondary" onClick={onBack}>Atrás</Button>
        <Button onClick={onNext}>Importar</Button>
      </div>
    </div>
  )
}
