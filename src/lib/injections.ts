import { db, type InjectionLog, type Vial } from './db'
import { mlFromDose } from './vials'
import { generateDoseInstants } from './schedule'

// Pick the best vial to draw from for a given compound:
// most-recently-opened, non-archived, with remaining > 0 — falls back to any non-archived.
export function pickActiveVial(vials: Vial[], compoundId: number): Vial | undefined {
  const candidates = vials.filter((v) => v.compoundId === compoundId && !v.archived)
  const usable = candidates.filter((v) => v.remainingMl > 0)
  const ranked = (usable.length ? usable : candidates).slice().sort((a, b) => {
    const ta = a.openedAt ? Date.parse(a.openedAt) : 0
    const tb = b.openedAt ? Date.parse(b.openedAt) : 0
    return tb - ta
  })
  return ranked[0]
}

// Hard window — only auto-attach an injection to a scheduled dose if the
// dose is within ±48h of the injection time. Wider windows produce
// surprising "you just satisfied a dose from 3 days ago" behavior; narrower
// breaks the common case of "I'm a few hours late."
const AUTO_LINK_WINDOW_MS = 48 * 60 * 60 * 1000

export type LogInjectionOptions = {
  // Explicit dose link from a UI flow that already knows which scheduled
  // instant the injection satisfies (e.g., "Mark taken" tile on Overview).
  // Skips auto-matching.
  link?: { protocolId: number; scheduledAt: string }
}

// Transactionally add an InjectionLog, decrementing its associated vial when amounts are known.
// Stamps serverId + updatedAt + dirty so the sync engine will push it on the next tick.
// Also auto-attaches the injection to the nearest pending scheduled dose for
// any protocol on the same compound (within ±48h) so freestyle logs satisfy
// the protocol calendar without requiring the user to log "via the protocol."
export async function logInjection(
  entry: Omit<InjectionLog, 'id'>,
  options?: LogInjectionOptions,
): Promise<number> {
  const injectionId = await db.transaction('rw', [db.injections, db.vials], async () => {
    let nextEntry: Omit<InjectionLog, 'id'> = {
      ...entry,
      serverId: entry.serverId ?? crypto.randomUUID(),
      updatedAt: Date.now(),
      dirty: 1,
    }
    if (entry.vialId && entry.dose !== undefined) {
      const vial = await db.vials.get(entry.vialId)
      const ml = vial ? mlFromDose(entry.dose, entry.unit, vial.concentrationMgPerMl) : undefined
      if (vial && ml !== undefined) {
        const remaining = Math.max(0, vial.remainingMl - ml)
        await db.vials.update(vial.id!, { remainingMl: remaining })
        nextEntry = { ...nextEntry, vialAmount: `${ml.toFixed(3)} mL` }
      }
    }
    return db.injections.add(nextEntry)
  })

  // Protocol-dose linking runs OUTSIDE the injection/vial transaction so a
  // failure here can never roll back the saved injection. Linking is purely
  // a UX nicety — the injection is the source of truth either way.
  try {
    await attachScheduledDose(injectionId, entry, options)
  } catch (err) {
    console.warn('Failed to auto-link injection to scheduled dose', err)
  }

  return injectionId
}

async function attachScheduledDose(
  injectionId: number,
  entry: Omit<InjectionLog, 'id'>,
  options?: LogInjectionOptions,
) {
  // Path A: caller already knows the exact dose to satisfy.
  if (options?.link) {
    await db.protocolDoses.put({
      protocolId: options.link.protocolId,
      scheduledAt: options.link.scheduledAt,
      status: 'done',
      injectionId,
    })
    return
  }

  // Path B: auto-match. Look across all non-archived protocols for the same
  // compound, generate dose instants within ±48h of the injection, and link
  // the closest still-pending one.
  if (!entry.compoundId || !entry.takenAt) return
  const takenAt = Date.parse(entry.takenAt)
  if (!Number.isFinite(takenAt)) return
  const from = new Date(takenAt - AUTO_LINK_WINDOW_MS)
  const to = new Date(takenAt + AUTO_LINK_WINDOW_MS)

  const protocols = await db.protocols
    .where('compoundId').equals(entry.compoundId)
    .toArray()
  const activeProtocols = protocols.filter((p) => !p.archived)
  if (activeProtocols.length === 0) return

  type Candidate = { protocolId: number; instant: Date; distance: number }
  const candidates: Candidate[] = []
  for (const proto of activeProtocols) {
    if (!proto.id) continue
    const instants = generateDoseInstants(proto, from, to)
    for (const instant of instants) {
      const distance = Math.abs(instant.getTime() - takenAt)
      if (distance <= AUTO_LINK_WINDOW_MS) {
        candidates.push({ protocolId: proto.id, instant, distance })
      }
    }
  }
  if (candidates.length === 0) return

  // Closest first. Skip any whose ProtocolDose row already exists with a
  // terminal status (done/skipped) — we don't overwrite the user's choices.
  candidates.sort((a, b) => a.distance - b.distance)
  for (const c of candidates) {
    const iso = c.instant.toISOString()
    const existing = await db.protocolDoses
      .where('protocolId').equals(c.protocolId)
      .and((d) => d.scheduledAt === iso)
      .first()
    if (existing && (existing.status === 'done' || existing.status === 'skipped')) continue
    await db.protocolDoses.put({
      ...(existing ?? {}),
      protocolId: c.protocolId,
      scheduledAt: iso,
      status: 'done',
      injectionId,
    })
    return
  }
}

// Soft-delete locally so the sync engine can propagate the tombstone, then physically remove.
// If the row was never synced (no serverId), we can just hard-delete locally.
export async function deleteInjection(injectionId: number): Promise<void> {
  await db.transaction('rw', [db.injections, db.vials, db.protocolDoses], async () => {
    const entry = await db.injections.get(injectionId)
    if (!entry) return
    if (entry.vialId && entry.dose !== undefined) {
      const vial = await db.vials.get(entry.vialId)
      const ml = vial ? mlFromDose(entry.dose, entry.unit, vial.concentrationMgPerMl) : undefined
      if (vial && ml !== undefined) {
        const restored = Math.min(vial.totalMl, vial.remainingMl + ml)
        await db.vials.update(vial.id!, { remainingMl: restored })
      }
    }
    // Unlink any ProtocolDose that pointed at this injection (revert to pending
    // so the schedule re-surfaces "overdue"). .modify is the right Dexie API
    // for deleting an optional property — partial update with `undefined`
    // doesn't actually remove the key.
    await db.protocolDoses
      .where('injectionId').equals(injectionId)
      .modify((d) => {
        d.status = 'pending'
        delete d.injectionId
      })
    if (entry.serverId) {
      // Mark as tombstone for the sync engine; it pushes the deleted_at to the server.
      await db.injections.update(injectionId, {
        deletedAtSync: Date.now(),
        updatedAt: Date.now(),
        dirty: 1,
      })
    } else {
      await db.injections.delete(injectionId)
    }
  })
}

// Mark a scheduled dose as skipped. Used by overdue/skip UI affordances.
export async function skipScheduledDose(protocolId: number, scheduledAt: string): Promise<void> {
  const existing = await db.protocolDoses
    .where('protocolId').equals(protocolId)
    .and((d) => d.scheduledAt === scheduledAt)
    .first()
  await db.protocolDoses.put({
    ...(existing ?? {}),
    protocolId,
    scheduledAt,
    status: 'skipped',
  })
}
