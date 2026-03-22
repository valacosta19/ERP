import type { ReactNode } from 'react'
import React, { useState, useRef, useEffect } from 'react'

interface Column<T> {
  key: string
  header: string
  render?: (row: T) => ReactNode
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyField: keyof T
  loading?: boolean
  emptyMessage?: string
  prependRow?: React.ReactNode
  appendRow?: React.ReactNode
  pageSize?: number
}

const ROW_HEIGHT = 45
const HEADER_HEIGHT = 45
const PAGINATION_HEIGHT = 52

export function Table<T>({ columns, data, keyField, loading, emptyMessage = 'Sin registros', prependRow, appendRow, pageSize }: TableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoPageSize, setAutoPageSize] = useState(pageSize ?? 25)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (pageSize !== undefined) return
    if (!containerRef.current) return
    const observer = new ResizeObserver(entries => {
      const height = entries[0].contentRect.height
      const rows = Math.max(1, Math.floor((height - HEADER_HEIGHT - PAGINATION_HEIGHT) / ROW_HEIGHT))
      setAutoPageSize(rows)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [pageSize])

  const effectivePageSize = pageSize ?? autoPageSize
  const totalPages = Math.ceil(data.length / effectivePageSize)
  const safePage = Math.min(page, Math.max(1, totalPages))
  const visible = data.slice((safePage - 1) * effectivePageSize, safePage * effectivePageSize)
  const rangeStart = data.length === 0 ? 0 : (safePage - 1) * effectivePageSize + 1
  const rangeEnd = Math.min(safePage * effectivePageSize, data.length)

  return (
    <div ref={containerRef} className="h-full flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] ${col.className || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prependRow}
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-[var(--color-muted)]">
                  <span className="inline-block w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-[var(--color-muted)]">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visible.map((row, i) => (
                <tr
                  key={String(row[keyField])}
                  className={`border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors ${i === visible.length - 1 ? 'border-b-0' : ''}`}
                >
                  {columns.map(col => (
                    <td key={col.key} className={`px-4 py-3 text-[var(--color-text)] ${col.className || ''}`}>
                      {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
            {appendRow}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)] mt-auto">
          <span className="text-xs text-[var(--color-muted)]">{rangeStart}–{rangeEnd} de {data.length}</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-muted)]">Página {safePage} de {totalPages}</span>
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={safePage === 1}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={safePage === totalPages}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
