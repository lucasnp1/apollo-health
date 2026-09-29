// The pull's per-row merge: one server row onto the local copy. Pure (no
// Dexie) so node can check it; sync.ts does the reads and the writes.

import type { TableSpec } from './syncCatalog'

/** Server row to local shape, server FK ids resolved through `fkCache` (field -> serverId -> local id). */
export function translateFkSync(
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

/**
 * The row to put for a live server row, or null to leave the local row alone.
 * Tombstones are handled by the caller.
 */
export function mergeServerRow(
  spec: TableSpec,
  row: Record<string, unknown>,
  existing: Record<string, unknown> | undefined,
  fkCache: Map<string, Map<string, number>> = new Map(),
  now = Date.now(),
): Record<string, unknown> | null {
  // Last-write-wins for real: a local edit that has not pushed yet (dirty)
  // and is at least as new as the server copy stays put. Without this, the
  // echo of our own earlier push could pull back over the newer local row
  // (a PDF stayed "Needs review" after import for exactly this reason).
  if (existing && existing.dirty === 1 && Number(existing.updatedAt ?? 0) >= (Number(row.updatedAt) || 0)) return null

  const localRow = translateFkSync(spec, row, fkCache)

  // A server NULL clears the local value (Dexie treats undefined as delete),
  // so un-archiving, undo and cleared fields reach every device. The exception
  // is a column that was device-local before its migration (spec.keepLocalOnNull):
  // every row already on the server has NULL there, and taking it would wipe
  // exactly the values the user asked us to remember. Runs before the sync
  // fields below, which DO need their explicit undefined to clear a tombstone.
  const keep = new Set(spec.keepLocalOnNull ?? [])
  if (existing) {
    for (const k of Object.keys(localRow)) {
      if (keep.has(k) && localRow[k] === undefined && existing[k] !== undefined) delete localRow[k]
    }
    // A link the server does set but this device cannot resolve yet is not a NULL.
    for (const fk of spec.foreignKeys ?? []) {
      if (localRow[fk.field] === undefined && row[fk.field] != null && row[fk.field] !== '') delete localRow[fk.field]
    }
  }

  localRow.serverId = String(row.id)
  localRow.updatedAt = Number(row.updatedAt) || now
  localRow.dirty = 0
  localRow.deletedAtSync = undefined

  if (existing?.id !== undefined) return { ...existing, ...localRow }
  delete localRow.id
  return localRow
}
