type PageResponse = { data: unknown; error: { message: string } | null }

export async function fetchAllRows<T>(
  fetchPage: (rangeFrom: number, rangeTo: number) => PromiseLike<PageResponse>,
): Promise<T[]> {
  const PAGE_SIZE = 1000
  const rows: T[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await fetchPage(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const batch = (data as T[] | null) ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return rows
}
