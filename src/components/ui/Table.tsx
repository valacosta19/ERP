import type { ReactNode } from 'react'
import React, { useState, useEffect } from 'react'

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

export function Table<T>({ columns, data, keyField, loading, emptyMessage = 'Sin registros', prependRow, appendRow, pageSize = 25 }: TableProps<T>) {
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [data.length])

  const totalPages = Math.ceil(data.length / pageSize)
  const visible = data.slice((page - 1) * pageSize, page * pageSize)
  const rangeStart = data.length === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, data.length)

  return (
    <div>
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
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
          <span className="text-xs text-[var(--color-muted)]">{rangeStart}–{rangeEnd} de {data.length}</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-muted)]">Página {page} de {totalPages}</span>
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page === totalPages}
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
