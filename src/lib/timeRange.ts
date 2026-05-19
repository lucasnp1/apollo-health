export type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'ALL'

export const RANGE_DAYS: Record<TimeRange, number | null> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  ALL: null,
}

export function filterByRange<T>(items: T[], range: TimeRange, getDate: (item: T) => Date): T[] {
  const days = RANGE_DAYS[range]
  if (days === null) return items
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return items.filter((item) => getDate(item).getTime() >= cutoff)
}
