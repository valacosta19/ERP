// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Table } from './Table'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Table responsive presentation', () => {
  it('renders one expandable card with the same fields and actions on mobile', () => {
    const action = vi.fn()
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    const { container } = render(
      <Table
        columns={[
          { key: 'name', header: 'Producto' },
          { key: 'stock', header: 'Stock' },
          { key: 'actions', header: '', render: () => <button onClick={action}>Editar</button> },
        ]}
        data={[{ id: 'p1', name: 'Shampoo', stock: 7 }]}
        keyField="id"
        pageSize={25}
        mobileTitleKey="name"
        mobileSummaryKeys={['stock']}
      />,
    )

    expect(container.querySelector('table')).toBeNull()
    expect(screen.getByText('Shampoo')).toBeTruthy()
    fireEvent.click(screen.getByText('Shampoo').closest('summary')!)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(action).toHaveBeenCalledOnce()
  })

  it('lets a page provide a mobile-only card without rendering desktop controls', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    render(
      <Table
        columns={[
          { key: 'name', header: 'Producto' },
          { key: 'actions', header: '', render: () => <button>Desktop action</button> },
        ]}
        data={[{ id: 'p1', name: 'Shampoo' }]}
        keyField="id"
        pageSize={25}
        renderMobileCard={(row, { isOpen, toggle }) => (
          <article>
            <button type="button" aria-expanded={isOpen} onClick={toggle}>{row.name}</button>
            {isOpen && <p>Mobile detail</p>}
          </article>
        )}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Desktop action' })).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Shampoo' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByText('Mobile detail')).toBeTruthy()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })
})
