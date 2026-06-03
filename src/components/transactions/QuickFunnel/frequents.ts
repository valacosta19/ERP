const KEY = 'funnel-frequents-v1'

type Tally = Record<string, number>

function read(): Tally {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function write(tally: Tally): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tally))
  } catch (e) {
    throw new Error(`No se pudo guardar frecuentes: ${(e as Error).message}`)
  }
}

export function bumpFrequent(id: string): void {
  const tally = read()
  tally[id] = (tally[id] ?? 0) + 1
  write(tally)
}

export function frequencyOf(id: string): number {
  return read()[id] ?? 0
}

export function topFrequentIds(ids: string[], limit: number): string[] {
  const tally = read()
  return [...ids]
    .filter(id => (tally[id] ?? 0) > 0)
    .sort((a, b) => (tally[b] ?? 0) - (tally[a] ?? 0))
    .slice(0, limit)
}
