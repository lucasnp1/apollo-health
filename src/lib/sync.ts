// Local-IndexedDB ↔ server reconciliation.
//
// Strategy:
//   * Every Dexie row has serverId (uuid, stable across devices), updatedAt
//     (ms epoch, bumped on each local mutation), dirty (1 = unsynced), and
//     deletedAtSync (ms tombstone).
//   * Pull: GET /api/sync/<table>?since=<cursor>. Upsert by serverId. Set
//     dirty=0 on rows pulled from server.
//   * Push: rows where dirty=1, batch POST /api/sync/<table>. On success,
//     clear dirty.
//
// One feature (injections) is wired end-to-end as proof of pattern; the
// other tables follow the same shape — see syncTable() below.

import { api } from './api'
import { db, type InjectionLog } from './db'

const CURSOR_KEY = (table: string) => `sync.cursor.${table}`

type SyncableTable = 'injections' // expand in follow-up commits

type Direction = 'pull' | 'push' | 'both'

export type SyncSummary = {
  table: SyncableTable
  pulled: number
  pushed: number
  conflicts: number
  cursor: number
}

export async function syncAll(direction: Direction = 'both'): Promise<SyncSummary[]> {
  const tables: SyncableTable[] = ['injections']
  const out: SyncSummary[] = []
  for (const t of tables) out.push(await syncTable(t, direction))
  return out
}

export async function syncTable(table: SyncableTable, direction: Direction = 'both'): Promise<SyncSummary> {
  let pulled = 0
  let pushed = 0
  let conflicts = 0

  if (direction !== 'push') pulled = await pullTable(table)
  if (direction !== 'pull') {
    const result = await pushTable(table)
    pushed = result.pushed
    conflicts = result.conflicts
  }
  const cursorRow = await db.meta.get(CURSOR_KEY(table))
  return { table, pulled, pushed, conflicts, cursor: Number(cursorRow?.value || 0) }
}

async function pullTable(table: SyncableTable): Promise<number> {
  const cursorRow = await db.meta.get(CURSOR_KEY(table))
  let since = Number(cursorRow?.value || 0)
  let pulled = 0
  // Loop while server has more, in case the page limit is hit.
  for (let i = 0; i < 50; i++) {
    const res = await api.get<{ rows: Array<Record<string, unknown>>; cursor: number; hasMore: boolean }>(
      `/api/sync/${table}?since=${since}`,
    )
    if (!res.rows.length) break
    for (const row of res.rows) {
      await applyServerRow(table, row)
      pulled++
    }
    since = res.cursor
    await db.meta.put({ key: CURSOR_KEY(table), value: String(since) })
    if (!res.hasMore) break
  }
  return pulled
}

async function pushTable(table: SyncableTable): Promise<{ pushed: number; conflicts: number }> {
  const dirty = await tableDirtyRows(table)
  if (!dirty.length) return { pushed: 0, conflicts: 0 }

  // Ensure every row has a serverId
  const toPush: Array<Record<string, unknown>> = []
  for (const row of dirty) {
    if (!row.serverId) {
      row.serverId = crypto.randomUUID()
      await tableUpdate(table, row.id!, { serverId: row.serverId })
    }
    toPush.push(serializeForServer(table, row))
  }

  const res = await api.post<{ written: string[]; conflicts: Array<{ id: string; reason: string }> }>(
    `/api/sync/${table}`,
    { rows: toPush },
  )

  // Clear dirty on rows that the server accepted.
  for (const row of dirty) {
    const sid = row.serverId as string | undefined
    if (sid && res.written.includes(sid)) {
      await tableUpdate(table, row.id!, { dirty: 0 })
    }
  }
  return { pushed: res.written.length, conflicts: res.conflicts.length }
}

// --- table-aware helpers ----------

async function tableDirtyRows(table: SyncableTable): Promise<Array<Record<string, unknown> & { id?: number }>> {
  if (table === 'injections') {
    return (await db.injections.where('dirty').equals(1).toArray()) as Array<Record<string, unknown> & { id?: number }>
  }
  return []
}

async function tableUpdate(table: SyncableTable, id: number, patch: Record<string, unknown>): Promise<void> {
  if (table === 'injections') {
    await db.injections.update(id, patch as Partial<InjectionLog>)
  }
}

async function applyServerRow(table: SyncableTable, row: Record<string, unknown>): Promise<void> {
  if (table === 'injections') {
    const serverId = String(row.id)
    const existing = await db.injections.where('serverId').equals(serverId).first()
    const next: Partial<InjectionLog> & Record<string, unknown> = {
      serverId,
      compoundId: Number(row.compoundId) || 0,
      takenAt: String(row.takenAt),
      dose: row.dose !== undefined ? Number(row.dose) : undefined,
      unit: row.unit as InjectionLog['unit'],
      route: row.route as InjectionLog['route'],
      site: row.site as string | undefined,
      notes: row.notes as string | undefined,
      rawDose: row.rawDose as string | undefined,
      vialAmount: row.vialAmount as string | undefined,
      weightKg: row.weightKg !== undefined ? Number(row.weightKg) : undefined,
      protocolDoseId: row.protocolDoseId !== undefined ? Number(row.protocolDoseId) : undefined,
      vialId: row.vialId !== undefined ? Number(row.vialId) : undefined,
      updatedAt: Number(row.updatedAt) || Date.now(),
      deletedAtSync: row.deletedAt ? Number(row.deletedAt) : undefined,
      dirty: 0,
    }
    if (next.deletedAtSync && existing?.id) {
      await db.injections.delete(existing.id)
    } else if (existing?.id) {
      await db.injections.update(existing.id, next)
    } else if (!next.deletedAtSync) {
      await db.injections.add(next as InjectionLog)
    }
  }
}

function serializeForServer(table: SyncableTable, row: Record<string, unknown>): Record<string, unknown> {
  if (table === 'injections') {
    return {
      id: row.serverId,
      compoundId: row.compoundId,
      takenAt: row.takenAt,
      dose: row.dose,
      unit: row.unit,
      route: row.route,
      site: row.site,
      notes: row.notes,
      rawDose: row.rawDose,
      vialAmount: row.vialAmount,
      weightKg: row.weightKg,
      protocolDoseId: row.protocolDoseId,
      vialId: row.vialId,
      updatedAt: row.updatedAt || Date.now(),
      deletedAt: row.deletedAtSync ?? null,
    }
  }
  return row
}

// Bump dirty + updatedAt for a Dexie row right before save. Used by logInjection / deleteInjection.
export function stampDirty<T extends { updatedAt?: number; dirty?: 0 | 1 }>(row: T): T {
  row.updatedAt = Date.now()
  row.dirty = 1
  return row
}
