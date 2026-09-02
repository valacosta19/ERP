export function marginColor(pct: number): string {
  if (pct > 30) return 'var(--color-success)'
  if (pct >= 10) return 'var(--color-warning)'
  return 'var(--color-danger)'
}
