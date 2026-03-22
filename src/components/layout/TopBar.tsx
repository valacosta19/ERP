import type { ReactNode } from 'react'

interface TopBarProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function TopBar({ title, subtitle, actions }: TopBarProps) {
  return (
    <div className="top-bar flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="top-bar__left">
        <h1 className="top-bar__title text-xl font-bold text-[var(--color-text)]">{title}</h1>
        {subtitle && <p className="top-bar__subtitle text-sm text-[var(--color-muted)] mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="top-bar__actions flex items-center gap-2">{actions}</div>}
    </div>
  )
}
