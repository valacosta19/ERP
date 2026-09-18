// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Stepper } from './funnelAtoms'

afterEach(cleanup)

describe('Quick Funnel progress', () => {
  it('exposes the active mobile step as compact progress without removing the desktop stepper', () => {
    const { container } = render(
      <Stepper
        steps={[
          { key: 'type', label: 'Tipo' },
          { key: 'detail', label: 'Detalle' },
          { key: 'amount', label: 'Monto' },
        ]}
        current="detail"
      />,
    )

    expect(screen.getByText(/Paso 2 de 3/)).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Paso 2 de 3: Detalle' }).getAttribute('aria-valuenow')).toBe('2')
    expect(container.querySelector('.quick-funnel__desktop-stepper')?.textContent).toContain('Tipo')
    expect(container.querySelector('.quick-funnel__desktop-stepper')?.textContent).toContain('Detalle')
  })
})
