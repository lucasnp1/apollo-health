// One compound identity, shared by every screen that lists compounds.
//
// The same drug can own several rows: sync reconciles on serverId alone, so a
// compound created on two devices becomes two rows on both, and logging a shot
// under a name the picker was hiding creates another. Grouping by name is what
// makes five "Retatrutide" rows read as one compound everywhere.
//
// `ids` carries EVERY row in the group, not a winner, so filtering by a group
// never hides the shots logged against its other rows.

import type { Compound, InjectionLog } from './db'

export const compoundKey = (name: string) => name.trim().toLowerCase()

export type CompoundGroup = {
  key: string
  name: string
  color?: string
  /** The row to read remembered dose / vial numbers from, and write them back to. */
  canonical: Compound
  /** Every row id sharing this name. Filter with `ids.includes(i.compoundId)`. */
  ids: number[]
}

/**
 * One entry per distinct compound name, in first-seen order.
 * Canonical row = the one with the most injections (ties broken by the newest
 * row), because that is the row whose remembered numbers the user has actually
 * been using — not whichever happens to have the lowest id, which is what the
 * old per-screen dedups picked.
 */
export function compoundGroups(compounds: Compound[], injections: InjectionLog[] = []): CompoundGroup[] {
  const shots = new Map<number, number>()
  for (const i of injections) {
    if (i.compoundId === undefined) continue
    shots.set(i.compoundId, (shots.get(i.compoundId) ?? 0) + 1)
  }

  const byKey = new Map<string, Compound[]>()
  for (const c of compounds) {
    const k = compoundKey(c.name)
    const list = byKey.get(k)
    if (list) list.push(c)
    else byKey.set(k, [c])
  }

  const out: CompoundGroup[] = []
  for (const [key, rows] of byKey) {
    const canonical = rows.reduce((best, c) => {
      const a = shots.get(c.id ?? -1) ?? 0
      const b = shots.get(best.id ?? -1) ?? 0
      if (a !== b) return a > b ? c : best
      return (c.id ?? 0) > (best.id ?? 0) ? c : best
    }, rows[0])
    out.push({
      key,
      name: canonical.name,
      color: canonical.color ?? rows.find((r) => r.color)?.color,
      canonical,
      ids: rows.map((r) => r.id).filter((id): id is number => id !== undefined),
    })
  }
  return out
}

/** compoundId -> its group, so any per-id lookup resolves to one identity. */
export function groupByCompoundId(groups: CompoundGroup[]): Map<number, CompoundGroup> {
  const map = new Map<number, CompoundGroup>()
  for (const g of groups) for (const id of g.ids) map.set(id, g)
  return map
}

/** The existing row for this name, if any. Used to stop new duplicates at the source. */
export function findCompoundByName(compounds: Compound[], name: string): Compound | undefined {
  const k = compoundKey(name)
  return compounds.find((c) => compoundKey(c.name) === k)
}
