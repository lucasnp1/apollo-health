import { db, type InjectionLog, type Vial } from './db'
import { mlFromDose } from './vials'

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

// Transactionally add an InjectionLog, decrementing its associated vial when amounts are known.
export async function logInjection(entry: Omit<InjectionLog, 'id'>): Promise<number> {
  return db.transaction('rw', [db.injections, db.vials], async () => {
    let nextEntry = entry
    if (entry.vialId && entry.dose !== undefined) {
      const vial = await db.vials.get(entry.vialId)
      const ml = vial ? mlFromDose(entry.dose, entry.unit, vial.concentrationMgPerMl) : undefined
      if (vial && ml !== undefined) {
        const remaining = Math.max(0, vial.remainingMl - ml)
        await db.vials.update(vial.id!, { remainingMl: remaining })
        nextEntry = { ...entry, vialAmount: `${ml.toFixed(3)} mL` }
      }
    }
    return db.injections.add(nextEntry)
  })
}

// Reverse of logInjection — used when an entry is deleted. Restores mL if we know the vial.
export async function deleteInjection(injectionId: number): Promise<void> {
  await db.transaction('rw', [db.injections, db.vials], async () => {
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
    await db.injections.delete(injectionId)
  })
}
