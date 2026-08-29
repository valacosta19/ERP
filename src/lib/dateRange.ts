export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayLocal(): string {
  return formatLocalDate(new Date())
}

export function daysAgoLocal(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return formatLocalDate(d)
}

export function currentMonthRange(): { from: string; to: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  return { from: formatLocalDate(new Date(year, month, 1)), to: formatLocalDate(new Date(year, month + 1, 0)) }
}
