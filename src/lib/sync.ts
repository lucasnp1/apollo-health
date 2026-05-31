// Catalog-driven local-IndexedDB ↔ server reconciliation.
//
// One engine drives every syncable table. The catalog (syncCatalog.ts)
// specifies column types and foreign-key relationships. Pull happens in
// parent-first order so FK targets exist locally before children reference
// them. Push mirrors the order; the server is permissive about FK strings,
// so push order is mostly about getting parents stamped with serverIds first.
//
// Conflict policy: last-write-wins by `updatedAt`. Both sides include it.

import { api } from './api'
import { db } from './db'
import { pushUnuploadedBlobs } from './fileSync'
import { TABLES, type ForeignKey, type TableSpec } from './syncCatalog'

type Direction = 'pull' | 'push' | 'both'

export type TableSyncResult = {
  table: string
  pulled: number
  pushed: number
  conflicts: number
  error?: string
}

export type SyncSummary = TableSyncResult

const CURSOR_KEY = (slug: string) => `sync.cursor.${slug}`
const BACKFILL_KEY = 'sync.initialBackfillDone'

export async function syncAll(direction: Direction = 'both'): Promise<SyncSummary[]> {
  // First-time backfill: dirty every existing row so it pushes up to the new account.
  if (direction !== 'pull') await runBackfillOnce()

  const out: SyncSummary[] = []
  for (const spec of TABLES) {
    try {
      out.push(await syncTable(spec, direction))
    } catch (e) {
      out.push({
        table: spec.slug,
        pulled: 0,
        pushed: 0,
        conflicts: 0,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // After metadata rows have pushed, ship any pending file blobs to R2.
  // Failures here don't block the rest of sync — they retry on the next tick.
  if (direction !== 'pull') {
    try {
      await pushUnuploadedBlobs()
    } catch {
      /* best-effort */
    }
  }

  return out
}

async function syncTable(spec: TableSpec, direction: Direction): Promise<TableSyncResult> {
  let pulled = 0
  let pushed = 0
  let conflicts = 0
  if (direction !== 'push') pulled = await pullTable(spec)
  if (direction !== 'pull') {
    const result = await pushTable(spec)
    pushed = result.pushed
    conflicts = result.conflicts
  }
  return { table: spec.slug, pulled, pushed, conflicts }
}

// --- pull -----------------------------------------------------------------
// Batched: one DB transaction per page of results instead of one per row.
// Before: N rows × (1 read + 1 write + M FK reads) = many IDB round-trips.
// After:  1 bulk read + pre-fetched FK cache + 1 bulkPut/bulkDelete = fast.

async function pullTable(spec: TableSpec): Promise<number> {
  const cursorRow = await db.meta.get(CURSOR_KEY(spec.slug))
  let since = Number(cursorRow?.value || 0)
  let pulled = 0

  for (let i = 0; i < 50; i++) {
    const res = await api.get<{ rows: Array<Record<string, unknown>>; cursor: number; hasMore: boolean }>(
      `/api/sync/${spec.slug}?since=${since}`,
    )
    if (!res.rows.length) break

    pulled += await applyServerRowsBatch(spec, res.rows)

    since = Math.max(since, Number(res.cursor) || since)
    await db.meta.put({ key: CURSOR_KEY(spec.slug), value: String(since) })
    if (!res.hasMore) break
  }
  return pulled
}

async function applyServerRowsBatch(
  spec: TableSpec,
  rows: Array<Record<string, unknown>>,
): Promise<number> {
  if (!rows.length) return 0
  const table = dexieTable(spec)

  // 1. Look up ALL existing local rows in one query
  const serverIds = rows.map((r) => String(r.id)).filter(Boolean)
  const existingRows = await table.where('serverId').anyOf(serverIds).toArray()
  const existingMap = new Map(
    existingRows.map((r) => [(r as Record<string, unknown>).serverId as string, r]),
  )

  // 2. Pre-fetch ALL FK targets in one pass per FK field
  const fkCache = await buildFkCache(spec, rows)

  // 3. Build the to-put and to-delete lists
  const toDelete: number[] = []
  const toPut: Record<string, unknown>[] = []
  let count = 0

  for (const row of rows) {
    const serverId = String(row.id)
    if (!serverId) continue
    const existing = existingMap.get(serverId) as Record<string, unknown> | undefined

    if (row.deletedAt !== null && row.deletedAt !== undefined) {
      if (existing?.id !== undefined) toDelete.push(existing.id as number)
      continue
    }

    const localRow = translateFkSync(spec, row, fkCache)
    localRow.serverId = serverId
    localRow.updatedAt = Number(row.updatedAt) || Date.now()
    localRow.dirty = 0
    localRow.deletedAtSync = undefined

    if (existing?.id !== undefined) {
      toPut.push({ ...existing, ...localRow })
    } else {
      delete localRow.id
      toPut.push(localRow)
    }
    count++
  }

  // 4. ONE transaction — one useLiveQuery notification fires, not N
  if (toDelete.length || toPut.length) {
    await db.transaction('rw', table, async () => {
      if (toDelete.length) await (table as unknown as { bulkDelete: (ids: number[]) => Promise<void> }).bulkDelete(toDelete)
      if (toPut.length)   await (table as unknown as { bulkPut: (rows: unknown[]) => Promise<unknown> }).bulkPut(toPut)
    })
  }

  return count
}

/** Pre-fetch all FK target ids for a batch of server rows. */
async function buildFkCache(
  spec: TableSpec,
  rows: Array<Record<string, unknown>>,
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>()
  if (!spec.foreignKeys?.length) return result

  for (const fk of spec.foreignKeys) {
    const targetSpec = TABLES.find((t) => t.slug === fk.targetTable)
    if (!targetSpec) continue

    const fkIds = [...new Set(
      rows.map((r) => r[fk.field]).filter((v): v is string => typeof v === 'string' && v.length > 0),
    )]

    if (!fkIds.length) { result.set(fk.field, new Map()); continue }

    const targetRows = await dexieTable(targetSpec).where('serverId').anyOf(fkIds).toArray()
    const idMap = new Map<string, number>()
    for (const tr of targetRows) {
      const r = tr as Record<string, unknown>
      if (r.serverId && r.id !== undefined) idMap.set(r.serverId as string, r.id as number)
    }
    result.set(fk.field, idMap)
  }
  return result
}

/** Synchronous FK translation using the pre-built cache. */
function translateFkSync(
  spec: TableSpec,
  row: Record<string, unknown>,
  fkCache: Map<string, Map<string, number>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [client, type] of Object.entries(spec.columns)) {
    const v = row[client]
    if (v === null || v === undefined) {
      out[client] = undefined
    } else if (type === 'bool') {
      out[client] = Boolean(v)
    } else if (type === 'json' && typeof v === 'string') {
      try { out[client] = JSON.parse(v) } catch { out[client] = v }
    } else {
      out[client] = v
    }
  }
  if (spec.foreignKeys) {
    for (const fk of spec.foreignKeys) {
      const serverFk = row[fk.field]
      if (typeof serverFk === 'string' && serverFk.length > 0) {
        out[fk.field] = fkCache.get(fk.field)?.get(serverFk) ?? undefined
      } else if (typeof serverFk === 'number') {
        out[fk.field] = serverFk
      } else {
        out[fk.field] = undefined
      }
    }
  }
  return out
}

// --- push -----------------------------------------------------------------

async function pushTable(spec: TableSpec): Promise<{ pushed: number; conflicts: number }> {
  const table = dexieTable(spec)
  const dirty = (await table.where('dirty').equals(1).toArray()) as Array<Record<string, unknown> & { id?: number }>
  if (!dirty.length) return { pushed: 0, conflicts: 0 }

  // Ensure every row has a serverId — the creating hook should set this
  // automatically, but legacy rows from before phase 2 may lack one.
  for (const row of dirty) {
    if (!row.serverId) {
      row.serverId = crypto.randomUUID()
      await tablePutSyncFields(spec, row.id!, { serverId: row.serverId as string })
    }
  }

  const payload = await Promise.all(dirty.map((row) => serializeForPush(spec, row)))

  const res = await api.post<{ written: string[]; conflicts: Array<{ id: string; reason: string }> }>(
    `/api/sync/${spec.slug}`,
    { rows: payload },
  )

  // Batch-clear dirty flags and delete tombstones in one transaction
  const written = new Set(res.written)
  const toDelete: number[] = []
  const toClearDirty: number[] = []
  for (const row of dirty) {
    if (!written.has(row.serverId as string)) continue
    if (row.deletedAtSync) toDelete.push(row.id!)
    else                   toClearDirty.push(row.id!)
  }
  if (toDelete.length || toClearDirty.length) {
    await db.transaction('rw', table, async () => {
      if (toDelete.length) await (table as unknown as { bulkDelete: (ids: number[]) => Promise<void> }).bulkDelete(toDelete)
      await Promise.all(toClearDirty.map((id) => dexieTable(spec).update(id, { dirty: 0 })))
    })
  }
  return { pushed: res.written.length, conflicts: res.conflicts.length }
}

async function tablePutSyncFields(spec: TableSpec, id: number, patch: Record<string, unknown>): Promise<void> {
  // Use .update() with sync-only fields so the updating hook stays quiet.
  await dexieTable(spec).update(id, patch)
}

async function serializeForPush(spec: TableSpec, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {
    id: row.serverId,
    updatedAt: row.updatedAt || Date.now(),
    deletedAt: row.deletedAtSync ?? null,
  }
  for (const [client, type] of Object.entries(spec.columns)) {
    let v: unknown = row[client]
    if (v === undefined) {
      out[client] = null
      continue
    }
    if (type === 'bool') v = v ? 1 : 0
    out[client] = v
  }
  // FK numeric → serverId string
  if (spec.foreignKeys) {
    for (const fk of spec.foreignKeys) {
      const localFk = row[fk.field]
      if (typeof localFk === 'number') {
        const targetSpec = TABLES.find((t) => t.slug === fk.targetTable)
        if (targetSpec) {
          const targetRow = (await dexieTable(targetSpec).get(localFk)) as { serverId?: string } | undefined
          out[fk.field] = targetRow?.serverId ?? null
        } else {
          out[fk.field] = null
        }
      } else if (typeof localFk === 'string') {
        // Already a server-style id (pulled previously).
        out[fk.field] = localFk
      } else {
        out[fk.field] = null
      }
    }
  }
  return out
}

// --- backfill --------------------------------------------------------------

async function runBackfillOnce(): Promise<void> {
  const flag = await db.meta.get(BACKFILL_KEY)
  if (flag?.value === '1') return
  // Dirty everything that hasn't been stamped yet so it pushes on the first sync.
  // For rows that already have serverId from a previous run, leave them alone.
  for (const spec of TABLES) {
    const table = dexieTable(spec)
    const rows = await table.toArray()
    for (const row of rows as Array<Record<string, unknown> & { id?: number }>) {
      if (row.id === undefined) continue
      if (!row.serverId || row.dirty == null) {
        const patch: Record<string, unknown> = {}
        if (!row.serverId) patch.serverId = crypto.randomUUID()
        if (row.dirty == null) patch.dirty = 1
        if (!row.updatedAt) patch.updatedAt = Date.now()
        await table.update(row.id, patch)
      }
    }
  }
  await db.meta.put({ key: BACKFILL_KEY, value: '1' })
}

// --- helpers --------------------------------------------------------------

function dexieTable(spec: TableSpec) {
  // Dexie's table API is identical across tables; the type-cast keeps the
  // engine table-agnostic without forcing each row to share a discriminator.
  return (db as unknown as Record<string, typeof db.injections>)[spec.dexie]
}

// `ForeignKey` is imported above to make the engine self-documenting; ensure
// the symbol is treated as used by older TS configs.
export type { ForeignKey }
