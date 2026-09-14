import { parseISO } from 'date-fns'
import type { InjectionLog, LabExam, LabResult } from './db'

/** A lab result joined to the exam it came from. Used everywhere lab rows are
 *  rendered (Labs, the export sheet, the public /read tool). */
export type EnrichedResult = LabResult & { exam?: LabExam }

/** The latest weight logged on any injection, in kg. Injections carry an
 *  optional weight, so this is the app's only weight history. */
export function latestWeightKg(injections: InjectionLog[]): number | undefined {
  let latest: { at: number; kg: number } | undefined
  for (const entry of injections) {
    if (entry.weightKg === undefined) continue
    const at = parseISO(entry.takenAt).getTime()
    if (!latest || at > latest.at) latest = { at, kg: entry.weightKg }
  }
  return latest?.kg
}
