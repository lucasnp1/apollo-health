// Reactive count of rows that haven't been synced yet, per table.
// Drives the import-progress banner.

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { TABLES } from './syncCatalog'

export type DirtyCounts = Record<string, number> & { total: number }

export function useDirtyCounts(): DirtyCounts {
  const counts = useLiveQuery(async () => {
    const out: DirtyCounts = { total: 0 } as DirtyCounts
    for (const spec of TABLES) {
      const table = (db as unknown as Record<string, typeof db.injections>)[spec.dexie]
      const n = await table.where('dirty').equals(1).count()
      out[spec.slug] = n
      out.total += n
    }
    return out
  }, [], { total: 0 } as DirtyCounts)
  return counts
}
