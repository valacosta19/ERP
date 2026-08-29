import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { parseWorkbook, downloadSampleTemplate } from '../importLogic'
import type { ParsedSheet } from '../importTypes'

interface Props {
  onParsed: (sheets: ParsedSheet[]) => void
}

export function StepUpload({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    setError(null)
    setLoading(true)
    try {
      const sheets = await parseWorkbook(file)
      if (sheets.length === 0) throw new Error('El archivo no contiene hojas')
      onParsed(sheets)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar el archivo')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="w-full border-2 border-dashed border-[var(--color-border)] rounded-xl p-16 flex flex-col items-center gap-3 cursor-pointer hover:border-[var(--color-accent)] transition-colors"
      >
        <Upload size={32} className="text-[var(--color-muted)]" />
        <p className="text-sm font-medium text-[var(--color-text)]">Arrastra tu archivo aquí o haz clic para seleccionarlo</p>
        <p className="text-xs text-[var(--color-muted)]">.xlsx, .xls</p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleChange} />
      </div>
      {loading && <p className="text-sm text-[var(--color-muted)]">Procesando...</p>}
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      <button
        type="button"
        onClick={() => void downloadSampleTemplate()}
        className="text-sm text-[var(--color-accent)] underline underline-offset-2 hover:opacity-75 transition-opacity"
      >
        Descargar plantilla de ejemplo
      </button>
    </div>
  )
}
