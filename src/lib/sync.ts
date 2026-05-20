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

async function pullTable(spec: TableSpec): Promise<number> {
  const cursorRow = await db.meta.get(CURSOR_KEY(spec.slug))
  let since = Number(cursorRow?.value || 0)
  let pulled = 0
  for (let i = 0; i < 50; i++) {
    const res = await api.get<{ rows: Array<Record<string, unknown>>; cursor: number; hasMore: boolean }>(
      `/api/sync/${spec.slug}?since=${since}`,
    )
    if (!res.rows.length) break
    for (const row of res.rows) {
      await applyServerRow(spec, row)
      pulled++
    }
    since = Math.max(since, Number(res.cursor) || since)
    await db.meta.put({ key: CURSOR_KEY(spec.slug), value: String(since) })
    if (!res.hasMore) break
  }
  return pulled
}

async function applyServerRow(spec: TableSpec, row: Record<string, unknown>): Promise<void> {
  const serverId = String(row.id)
  if (!serverId) return
  const table = dexieTable(spec)
  const existing = await table.where('serverId').equals(serverId).first()
  const isDeleted = row.deletedAt !== null && row.deletedAt !== undefined

  if (isDeleted) {
    if (existing?.id !== undefined) await table.delete(existing.id)
    return
  }

  // Translate FK strings → local numeric ids
  const localRow = await translateFkForPull(spec, row)
  localRow.serverId = serverId
  localRow.updatedAt = Number(row.updatedAt) || Date.now()
  localRow.dirty = 0
  localRow.deletedAtSync = undefined

  if (existing?.id !== undefined) {
    // Use a put-style update that overwrites whole row but keeps Dexie id
    const merged = { ...existing, ...localRow }
    // Cast: dexieTable() returns a typed Injections table but at runtime accepts any row shape.
    await (table as unknown as { put: (row: unknown) => Promise<unknown> }).put(merged)
  } else {
    // Drop id so Dexie auto-assigns
    delete (localRow as Record<string, unknown>).id
    await (table as unknown as { add: (row: unknown) => Promise<unknown> }).add(localRow)
  }
}

async function translateFkForPull(spec: TableSpec, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  for (const [client, type] of Object.entries(spec.columns)) {
    const v = row[client]
    if (v === null || v === undefined) {
      out[client] = undefined
    } else if (type === 'bool') {
      out[client] = Boolean(v)
    } else if (type === 'json' && typeof v === 'string') {
      try {
        out[client] = JSON.parse(v)
      } catch {
        out[client] = v
      }
    } else {
      out[client] = v
    }
  }
  // FK strings → local numeric ids
  if (spec.foreignKeys) {
    for (const fk of spec.foreignKeys) {
      const serverFk = row[fk.field]
      if (typeof serverFk === 'string' && serverFk.length > 0) {
        const targetSpec = TABLES.find((t) => t.slug === fk.targetTable)
        if (targetSpec) {
          const targetRow = (await dexieTable(targetSpec).where('serverId').equals(serverFk).first()) as
            | { id?: number }
            | undefined
          out[fk.field] = targetRow?.id ?? undefined
        }
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

  // Clear dirty on rows the server accepted. For tombstoned rows that pushed
  // successfully, also remove from local Dexie.
  const written = new Set(res.written)
  for (const row of dirty) {
    const sid = row.serverId as string
    if (!written.has(sid)) continue
    if (row.deletedAtSync) {
      await table.delete(row.id!)
    } else {
      await tablePutSyncFields(spec, row.id!, { dirty: 0 })
    }
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
