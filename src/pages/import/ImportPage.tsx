import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TopBar } from '@/components/layout/TopBar'
import { autoSuggestMapping } from './importLogic'
import { StepUpload } from './steps/StepUpload'
import { StepSheets } from './steps/StepSheets'
import { StepMapping } from './steps/StepMapping'
import { StepPreview } from './steps/StepPreview'
import { StepImport } from './steps/StepImport'
import type { ParsedSheet, EntityType, SheetAssignments, ColumnMappings } from './importTypes'

const STEP_LABELS = ['Archivo', 'Hojas', 'Mapeo', 'Preview', 'Importar']

export function ImportPage() {
  const qc = useQueryClient()
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [sheets, setSheets] = useState<ParsedSheet[]>([])
  const [assignments, setAssignments] = useState<SheetAssignments>({})
  const [mappings, setMappings] = useState<ColumnMappings>({})

  const handleParsed = (parsed: ParsedSheet[]) => {
    setSheets(parsed)
    setAssignments(Object.fromEntries(parsed.map(s => [s.name, ''])))
    setMappings({})
    setStep(2)
  }

  const handleSheetsNext = () => {
    const suggested: ColumnMappings = {}
    for (const sheet of sheets) {
      const entityType = assignments[sheet.name] as EntityType | ''
      if (entityType) {
        suggested[sheet.name] = autoSuggestMapping(sheet.headers, entityType)
      }
    }
    setMappings(suggested)
    setStep(3)
  }

  const handleDone = () => {
    qc.invalidateQueries()
    setStep(1)
    setSheets([])
    setAssignments({})
    setMappings({})
  }

  return (
    <div className="animate-fade-in flex-1 min-h-0 flex flex-col">
      <TopBar title="Importar Excel" />
      <div className="flex-1 min-h-0 overflow-y-auto p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          {STEP_LABELS.map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3 | 4 | 5
            const active = n === step
            const done = n < step
            return (
              <div key={n} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold
                    ${done || active ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)]'}`}>
                    {n}
                  </div>
                  <span className={`text-xs ${active ? 'font-medium text-[var(--color-text)]' : 'text-[var(--color-muted)]'}`}>{label}</span>
                </div>
                {i < STEP_LABELS.length - 1 && <div className="w-8 h-px bg-[var(--color-border)]" />}
              </div>
            )
          })}
        </div>

        {step === 1 && <StepUpload onParsed={handleParsed} />}
        {step === 2 && (
          <StepSheets
            sheets={sheets}
            assignments={assignments}
            onChange={setAssignments}
            onNext={handleSheetsNext}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <StepMapping
            sheets={sheets}
            assignments={assignments}
            mappings={mappings}
            onChange={setMappings}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <StepPreview
            sheets={sheets}
            assignments={assignments}
            mappings={mappings}
            onNext={() => setStep(5)}
            onBack={() => setStep(3)}
          />
        )}
        {step === 5 && (
          <StepImport
            sheets={sheets}
            assignments={assignments}
            mappings={mappings}
            onDone={handleDone}
          />
        )}
      </div>
    </div>
  )
}
