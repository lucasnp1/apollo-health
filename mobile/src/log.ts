// Small pieces of the log that several screens read the same way: units, doses, routes, weights, check-in averages,
// and adding a compound. One copy each, so the Timeline, Home, the widgets and the export never drift apart.
import { type CompoundGroup, compoundGroups, randomDistinctColor } from '@shared/lib/compounds'
import { type BodyMetric, type Compound, db, type InjectionLog, type Symptom } from '@shared/lib/db'
import type { Route } from '@shared/lib/sites'
import { ratingOf, type SymptomDef } from '@shared/lib/symptoms'

export const DAY = 86_400_000

export const unitLabel = (u?: string) => (u === 'iu' ? 'IU' : (u ?? ''))

/** A shot's dose as typed (an imported text wins), or with `drew`, what was drawn when no dose was noted. */
export const doseText = (i: InjectionLog, { drew = false } = {}) =>
  i.rawDose ?? (i.dose != null ? `${i.dose} ${unitLabel(i.unit)}` : drew && i.vialAmount ? `drew ${i.vialAmount}` : '')

export const routeOf = (i: InjectionLog): Route => (i.route === 'SubQ' ? 'SubQ' : 'IM')

/** Every weight in kg (`v`), from both places it's kept (a weigh-in, or the weight noted with a shot), oldest first. */
export function weightPoints(bodyMetrics: BodyMetric[], injections: InjectionLog[]) {
  const out: { t: number; v: number }[] = []
  for (const b of bodyMetrics) if (b.weightKg !== undefined) out.push({ t: Date.parse(b.measuredAt), v: b.weightKg })
  for (const i of injections) if (i.weightKg !== undefined) out.push({ t: Date.parse(i.takenAt), v: i.weightKg })
  return out.sort((a, b) => a.t - b.t)
}

export const average = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : undefined)

/** A check-in's average rating over some symptoms, 0 to 5, or nothing if none of them was rated. */
export const ratingMean = (s: Symptom, defs: SymptomDef[]) =>
  average(defs.map((d) => ratingOf(s, d)).filter((v): v is number => typeof v === 'number'))

/** The colours your compounds already use, for a new one to stay clear of. */
export const usedColours = (compounds: Compound[]) => compoundGroups(compounds).map((g: CompoundGroup) => g.color ?? '').filter(Boolean)

/** Adds a compound in a colour none in `taken` has; the colour joins `taken`, so a batch never repeats one. */
export async function addCompound(c: Omit<Compound, 'id' | 'color' | 'schedule'> & Partial<Compound>, taken: string[]) {
  const color = randomDistinctColor(taken)
  taken.push(color)
  return (await db.compounds.add({ schedule: 'As needed', ...c, name: c.name.trim(), color })) as number
}
