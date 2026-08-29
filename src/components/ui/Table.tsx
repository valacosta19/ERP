import type { ReactNode } from 'react'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

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
  paginate?: boolean
  rowProps?: (row: T) => React.HTMLAttributes<HTMLTableRowElement>
  renderExpanded?: (row: T) => ReactNode
}

const SCROLL_CHUNK = 60
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

export function Table<T>({ columns, data, keyField, loading, emptyMessage = 'Sin registros', prependRow, appendRow, pageSize, paginate = true, rowProps, renderExpanded }: TableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const footRef = useRef<HTMLTableSectionElement>(null)
  const [autoPageSize, setAutoPageSize] = useState(pageSize ?? 25)
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [renderCount, setRenderCount] = useState(SCROLL_CHUNK)
  const scrollRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const sentinelRef = useCallback((node: HTMLTableRowElement | null) => {
    observerRef.current?.disconnect()
    if (!node) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) setRenderCount(current => current + SCROLL_CHUNK)
      },
      { root: scrollRef.current }
    )
    observer.observe(node)
    observerRef.current = observer
  }, [])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  function toggleExpanded(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function goToPage(next: number) {
    setExpanded(new Set())
    setPage(next)
  }

  useEffect(() => {
    if (pageSize !== undefined) return
    if (!containerRef.current) return
    const container = containerRef.current
    const recalc = () => {
      const height = container.clientHeight
      const footHeight = footRef.current?.offsetHeight ?? 0
      const rows = Math.max(1, Math.floor((height - HEADER_HEIGHT - PAGINATION_HEIGHT - footHeight) / ROW_HEIGHT))
      setAutoPageSize(rows)
    }
    const observer = new ResizeObserver(recalc)
    observer.observe(container)
    if (footRef.current) observer.observe(footRef.current)
    return () => observer.disconnect()
  }, [pageSize, appendRow])

  const effectivePageSize = pageSize ?? autoPageSize
  const totalPages = paginate ? Math.ceil(data.length / effectivePageSize) : 1
  const safePage = Math.min(page, Math.max(1, totalPages))
  const visible = paginate
    ? data.slice((safePage - 1) * effectivePageSize, safePage * effectivePageSize)
    : data.slice(0, renderCount)
  const rangeStart = data.length === 0 ? 0 : (safePage - 1) * effectivePageSize + 1
  const rangeEnd = Math.min(safePage * effectivePageSize, data.length)
  const totalColumns = columns.length + (renderExpanded ? 1 : 0)

  return (
    <div ref={containerRef} className="data-table h-full flex flex-col">
      <div ref={scrollRef} className="data-table__scroll overflow-auto">
        <table className="data-table__table w-full text-sm">
          <thead className={`data-table__head ${paginate ? '' : 'sticky top-0 z-10 bg-[var(--color-surface)]'}`}>
            <tr className="data-table__head-row border-b border-[var(--color-border)]">
              {renderExpanded && <th className="data-table__head-cell w-8 px-2 py-3" />}
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
                <td colSpan={totalColumns} className="px-4 py-12 text-center text-[var(--color-muted)]">
                  <span className="inline-block w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr className="data-table__empty">
                <td colSpan={totalColumns} className="px-4 py-12 text-center text-[var(--color-muted)]">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visible.map((row, i) => {
                const { className: extraClassName, ...extraProps } = rowProps?.(row) ?? {}
                const rowKey = String(row[keyField])
                const expandedContent = renderExpanded ? renderExpanded(row) : null
                const isOpen = expanded.has(rowKey)
                const isLast = i === visible.length - 1
                return (
                <React.Fragment key={rowKey}>
                <tr
                  {...extraProps}
                  className={`data-table__row border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors ${isLast && !isOpen ? 'border-b-0' : ''} ${extraClassName ?? ''}`}
                >
                  {renderExpanded && (
                    <td className="data-table__cell data-table__cell--expander w-8 px-2 py-3">
                      {expandedContent && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(rowKey)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Contraer detalle' : 'Ver detalle'}
                          className="p-1 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
                        >
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                    </td>
                  )}
                  {columns.map(col => (
                    <td key={col.key} className={`data-table__cell px-4 py-3 text-[var(--color-text)] ${col.className || ''}`}>
                      {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
                {isOpen && expandedContent && (
                  <tr className={`data-table__row data-table__row--expanded border-b border-[var(--color-border)] ${isLast ? 'border-b-0' : ''}`}>
                    <td colSpan={totalColumns} className="px-4 py-3" style={{ background: 'var(--color-bg)' }}>
                      {expandedContent}
                    </td>
                  </tr>
                )}
                </React.Fragment>
                )
              })
            )}
            {!paginate && visible.length < data.length && (
              <tr ref={sentinelRef} className="data-table__sentinel" aria-hidden="true">
                <td colSpan={totalColumns} className="h-1 p-0" />
              </tr>
            )}
          </tbody>
          {appendRow && (
            <tfoot ref={footRef} className={`data-table__foot ${paginate ? '' : 'sticky bottom-0 z-10'}`}>
              {appendRow}
            </tfoot>
          )}
        </table>
      </div>
      {paginate && totalPages > 1 && (
        <div className="data-table__pagination flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)] mt-auto">
          <span className="data-table__pagination-info text-xs text-[var(--color-muted)]">{rangeStart}–{rangeEnd} de {data.length}</span>
          <div className="data-table__pagination-nav flex items-center gap-1.5">
            <PageNavButton onClick={() => goToPage(1)} disabled={safePage === 1} title="Primera página">«</PageNavButton>
            <PageNavButton onClick={() => goToPage(safePage - 1)} disabled={safePage === 1} title="Anterior">‹</PageNavButton>
            {pageRange(safePage, totalPages).map((item, i) =>
              item === '…' ? (
                <span key={`e-${i}`} className="data-table__pagination-ellipsis px-1.5 text-xs text-[var(--color-muted)]">…</span>
              ) : (
                <button
                  key={item}
                  onClick={() => goToPage(item)}
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
            <PageNavButton onClick={() => goToPage(safePage + 1)} disabled={safePage === totalPages} title="Siguiente">›</PageNavButton>
            <PageNavButton onClick={() => goToPage(totalPages)} disabled={safePage === totalPages} title="Última página">»</PageNavButton>
          </div>
        </div>
      )}
    </div>
  )
}
