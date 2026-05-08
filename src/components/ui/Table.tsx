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

function pageRange(current: number, total: number, siblings = 2, boundaries = 1): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set<number>()
  for (let i = 1; i <= boundaries; i++) pages.add(i)
  for (let i = total - boundaries + 1; i <= total; i++) pages.add(i)
  const start = Math.max(1, current - siblings)
  const end = Math.min(total, current + siblings)
  for (let i = start; i <= end; i++) pages.add(i)
  const sorted = [...pages].sort((a, b) => a - b)
  const result: (number | '…')[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const gap = sorted[i] - sorted[i - 1]
      if (gap === 2) result.push(sorted[i - 1] + 1)
      else if (gap > 2) result.push('…')
    }
    result.push(sorted[i])
  }
  return result
}

function PageNavButton({ onClick, disabled, title, children }: { onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="data-table__pagination-btn text-xs tabular-nums px-2 py-1 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      style={{ minWidth: '32px' }}
    >
      {children}
    </button>
  )
}

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
    <div ref={containerRef} className="data-table h-full flex flex-col">
      <div className="data-table__scroll overflow-x-auto">
        <table className="data-table__table w-full text-sm">
          <thead className="data-table__head">
            <tr className="data-table__head-row border-b border-[var(--color-border)]">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`data-table__head-cell px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] ${col.className || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="data-table__body">
            {prependRow}
            {loading ? (
              <tr className="data-table__loading">
                <td colSpan={columns.length} className="px-4 py-12 text-center text-[var(--color-muted)]">
                  <span className="inline-block w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr className="data-table__empty">
                <td colSpan={columns.length} className="px-4 py-12 text-center text-[var(--color-muted)]">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visible.map((row, i) => (
                <tr
                  key={String(row[keyField])}
                  className={`data-table__row border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors ${i === visible.length - 1 ? 'border-b-0' : ''}`}
                >
                  {columns.map(col => (
                    <td key={col.key} className={`data-table__cell px-4 py-3 text-[var(--color-text)] ${col.className || ''}`}>
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
        <div className="data-table__pagination flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)] mt-auto">
          <span className="data-table__pagination-info text-xs text-[var(--color-muted)]">{rangeStart}–{rangeEnd} de {data.length}</span>
          <div className="data-table__pagination-nav flex items-center gap-1.5">
            <PageNavButton onClick={() => setPage(1)} disabled={safePage === 1} title="Primera página">«</PageNavButton>
            <PageNavButton onClick={() => setPage(p => p - 1)} disabled={safePage === 1} title="Anterior">‹</PageNavButton>
            {pageRange(safePage, totalPages).map((item, i) =>
              item === '…' ? (
                <span key={`e-${i}`} className="data-table__pagination-ellipsis px-1.5 text-xs text-[var(--color-muted)]">…</span>
              ) : (
                <button
                  key={item}
                  onClick={() => setPage(item)}
                  aria-current={item === safePage ? 'page' : undefined}
                  className={
                    item === safePage
                      ? 'data-table__pagination-num data-table__pagination-num--active text-xs tabular-nums px-2 py-1 rounded-lg border-0 transition-colors'
                      : 'data-table__pagination-num text-xs tabular-nums px-2 py-1 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors'
                  }
                  style={
                    item === safePage
                      ? { background: 'var(--color-accent)', color: '#fff', minWidth: '32px' }
                      : { minWidth: '32px' }
                  }
                >
                  {item}
                </button>
              )
            )}
            <PageNavButton onClick={() => setPage(p => p + 1)} disabled={safePage === totalPages} title="Siguiente">›</PageNavButton>
            <PageNavButton onClick={() => setPage(totalPages)} disabled={safePage === totalPages} title="Última página">»</PageNavButton>
          </div>
        </div>
      )}
    </div>
  )
}
