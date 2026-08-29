import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Table } from '@/components/ui/Table'
import { useAuth } from '@/hooks/useAuth'
import { useProducts } from '@/hooks/useProducts'
import { useLockedPeriods } from '@/hooks/useLockedPeriods'
import {
  useInventoryRecountPreview,
  useApplyInventoryRecount,
  type RecountLine,
  type RecountPreview,
  type RecountPreviewLine,
  type RecountTotals,
} from '@/hooks/useInventoryRecount'
import { parseWorkbook } from '../import/importLogic'
import { COUNT_SHEET_NAME, parseCountSheet } from './countSheet'
import { todayLocal } from '@/lib/dateRange'

interface Props {
  open: boolean
  onClose: () => void
}

type Step = 'upload' | 'preview' | 'done'

function money(value: number): string {
  const rounded = Math.round(value)
  return `${rounded < 0 ? '-' : ''}$${Math.abs(rounded).toLocaleString('es-CO')}`
}

function qty(value: number): string {
  return Number(value).toLocaleString('es-CO', { maximumFractionDigits: 3 })
}

function deltaColor(value: number): string {
  if (value < 0) return 'var(--color-danger)'
  if (value > 0) return 'var(--color-success)'
  return 'var(--color-muted)'
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className="text-base font-semibold tabular-nums" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
    </div>
  )
}

function PreviewSummary({ totals, excluded }: { totals: RecountTotals; excluded: number }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      <SummaryTile label="Contados" value={qty(totals.contados)} />
      <SummaryTile label="Sin contar" value={qty(totals.omitidos)} />
      <SummaryTile label="Faltantes" value={qty(totals.faltantes)} tone="var(--color-danger)" />
      <SummaryTile label="Sobrantes" value={qty(totals.sobrantes)} tone="var(--color-success)" />
      <SummaryTile label="Valor antes" value={money(totals.valor_antes)} />
      <SummaryTile
        label="Diferencia"
        value={money(totals.delta_valor)}
        tone={deltaColor(totals.delta_valor)}
      />
      {excluded > 0 && (
        <SummaryTile label="Filas con error" value={qty(excluded)} tone="var(--color-warning)" />
      )}
    </div>
  )
}

const previewColumns = [
  {
    key: 'product',
    header: 'Producto',
    render: (l: RecountPreviewLine) => (
      <div>
        <p className="font-medium text-[var(--color-text)]">{l.product_name}</p>
        <p className="text-xs text-[var(--color-muted)]">{l.sku}</p>
      </div>
    ),
  },
  {
    key: 'system_quantity',
    header: 'Sistema',
    className: 'text-right',
    render: (l: RecountPreviewLine) => (
      <span className="tabular-nums text-[var(--color-muted)]">{qty(l.system_quantity)}</span>
    ),
  },
  {
    key: 'counted_quantity',
    header: 'Contado',
    className: 'text-right',
    render: (l: RecountPreviewLine) => <span className="tabular-nums">{qty(l.counted_quantity)}</span>,
  },
  {
    key: 'delta_quantity',
    header: 'Diferencia',
    className: 'text-right',
    render: (l: RecountPreviewLine) => (
      <span className="tabular-nums font-medium" style={{ color: deltaColor(l.delta_quantity) }}>
        {l.delta_quantity > 0 ? '+' : ''}
        {qty(l.delta_quantity)}
      </span>
    ),
  },
  {
    key: 'unit_cost',
    header: 'Costo',
    className: 'text-right',
    render: (l: RecountPreviewLine) => (
      <span className="tabular-nums text-[var(--color-muted)]">{money(l.unit_cost)}</span>
    ),
  },
  {
    key: 'delta_value',
    header: 'Impacto',
    className: 'text-right',
    render: (l: RecountPreviewLine) => (
      <span className="tabular-nums font-medium" style={{ color: deltaColor(l.delta_value) }}>
        {money(l.delta_value)}
      </span>
    ),
  },
]

export function RecountModal({ open, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [lines, setLines] = useState<RecountLine[]>([])
  const [rowErrors, setRowErrors] = useState<string[]>([])
  const [preview, setPreview] = useState<RecountPreview | null>(null)
  const [clientUuid, setClientUuid] = useState('')
  const [cutoffDate, setCutoffDate] = useState(() => todayLocal())
  const [applied, setApplied] = useState<RecountTotals | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)

  const { profile } = useAuth()
  const { data: products = [] } = useProducts()
  const { data: lockedPeriods = [] } = useLockedPeriods()
  const previewRecount = useInventoryRecountPreview()
  const applyRecount = useApplyInventoryRecount()

  const cutoffYear = Number(cutoffDate.slice(0, 4))
  const cutoffMonth = Number(cutoffDate.slice(5, 7))
  const cutoffLocked = lockedPeriods.some(p => p.year === cutoffYear && p.month === cutoffMonth)

  function reset() {
    setStep('upload')
    setLines([])
    setRowErrors([])
    setPreview(null)
    setClientUuid('')
    setApplied(null)
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleFile(file: File) {
    setError(null)
    setParsing(true)
    try {
      const sheets = await parseWorkbook(file)
      const sheet = sheets.find(s => s.name === COUNT_SHEET_NAME) ?? sheets[0]
      if (!sheet) throw new Error('El archivo no contiene hojas.')

      const knownIds = new Set(products.map(p => p.id))
      const parsed = parseCountSheet(sheet.rows, knownIds)
      if (parsed.lines.length === 0) {
        throw new Error(
          'No hay ninguna fila con la columna "Conteo físico" completada. Llená al menos un producto.'
        )
      }

      const result = await previewRecount.mutateAsync(parsed.lines)
      setLines(parsed.lines)
      setRowErrors(parsed.errors)
      setPreview(result)
      setClientUuid(crypto.randomUUID())
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar la planilla.')
    } finally {
      setParsing(false)
    }
  }

  async function handleApply() {
    setError(null)
    try {
      const result = await applyRecount.mutateAsync({
        clientUuid,
        cutoffDate,
        lines,
        createdBy: profile?.id ?? null,
      })
      setApplied(result.totals)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aplicar el recuento.')
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Recuento físico de inventario" size="xl">
      {step === 'upload' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-accent-light)] p-3 text-sm text-[var(--color-text)]">
            <p className="font-medium">Cómo funciona</p>
            <p className="mt-1 text-[var(--color-muted)]">
              Subí la planilla de conteo con la columna <strong>Conteo físico</strong> completada. Los
              lotes actuales de esos productos se llevan a cero y se abre un lote nuevo con lo que
              contaste. Nada se borra y los informes de meses cerrados no se mueven.
            </p>
            <p className="mt-2 text-[var(--color-muted)]">
              Dejar una celda <strong>vacía</strong> significa «no lo conté»: ese producto queda
              intacto. Poner <strong>0</strong> significa «lo conté y no hay nada».
            </p>
          </div>

          <div
            onClick={() => inputRef.current?.click()}
            onDrop={e => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file) handleFile(file)
            }}
            onDragOver={e => e.preventDefault()}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--color-border)] p-12 transition-colors hover:border-[var(--color-accent)]"
          >
            <Upload size={28} className="text-[var(--color-muted)]" />
            <p className="text-sm font-medium text-[var(--color-text)]">
              Arrastrá la planilla o hacé clic para elegirla
            </p>
            <p className="text-xs text-[var(--color-muted)]">.xlsx, .xls</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
          </div>

          {parsing && <p className="text-sm text-[var(--color-muted)]">Analizando la planilla…</p>}
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-light)] p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--color-warning)]" />
            <p className="text-sm text-[var(--color-text)]">
              Todavía no se escribió nada. Revisá las diferencias y confirmá abajo. Esta operación no
              se puede deshacer con un botón: quedaría corregirla con otro recuento.
            </p>
          </div>

          <PreviewSummary totals={preview.totals} excluded={rowErrors.length} />

          <div className="max-h-72 overflow-auto rounded-xl border border-[var(--color-border)]">
            <Table
              columns={previewColumns}
              data={preview.lines}
              keyField="product_id"
              emptyMessage="Sin diferencias para mostrar"
            />
          </div>

          {rowErrors.length > 0 && (
            <div className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-light)] p-3">
              <p className="text-sm font-medium text-[var(--color-text)]">
                {rowErrors.length} fila(s) quedaron afuera
              </p>
              <ul className="mt-1 max-h-28 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-[var(--color-muted)]">
                {rowErrors.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Fecha de corte"
              type="date"
              value={cutoffDate}
              onChange={e => setCutoffDate(e.target.value)}
            />
          </div>

          {cutoffLocked && (
            <p className="text-sm text-[var(--color-danger)]">
              El período {String(cutoffMonth).padStart(2, '0')}/{cutoffYear} está cerrado. Elegí una
              fecha de corte en un mes abierto.
            </p>
          )}
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={reset}>
              Cambiar planilla
            </Button>
            <Button
              variant="danger"
              disabled={cutoffLocked}
              loading={applyRecount.isPending}
              onClick={handleApply}
            >
              Aplicar recuento a {qty(preview.totals.contados)} producto(s)
            </Button>
          </div>
        </div>
      )}

      {step === 'done' && applied && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-[var(--color-success)] bg-[var(--color-success-light)] p-3">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--color-success)]" />
            <div className="text-sm text-[var(--color-text)]">
              <p className="font-medium">Recuento aplicado el {cutoffDate}</p>
              <p className="mt-1 text-[var(--color-muted)]">
                Queda guardado en el historial de recuentos, en la pestaña Valoración de Reportes.
              </p>
            </div>
          </div>

          <PreviewSummary totals={applied} excluded={0} />

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-[var(--color-muted)]">
            La diferencia de valor de {money(applied.delta_valor)} se registró como ajuste de
            inventario. No impacta la utilidad del mes: es una corrección acumulada de meses
            anteriores.
          </div>

          <div className="flex justify-end pt-1">
            <Button onClick={handleClose}>Listo</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
