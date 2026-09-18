import type { ReactNode } from 'react'

interface TopBarProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function TopBar({ title, subtitle, actions }: TopBarProps) {
  return (
    <div className="top-bar flex items-start md:items-center justify-between gap-3 px-4 md:px-6 py-4 md:py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="top-bar__left min-w-0">
        <h1 className="top-bar__title text-xl font-bold text-[var(--color-text)]">{title}</h1>
        {subtitle && <p className="top-bar__subtitle text-sm text-[var(--color-muted)] mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="top-bar__actions flex items-center gap-2 max-w-full">{actions}</div>}
    </div>
  )
}
