import { addDays } from 'date-fns'
import type { InjectionLog, Protocol, Vial } from './db'

// Estimate mL consumed per week for a protocol, given concentration.
export function weeklyMlForProtocol(protocol: Protocol, concentrationMgPerMl: number): number {
  const ml = (dosePerEvent: number) => dosePerEvent / concentrationMgPerMl
  switch (protocol.cadence.kind) {
    case 'everyNDays':
      return (7 / protocol.cadence.n) * ml(protocol.dose)
    case 'weekly':
      return protocol.cadence.daysOfWeek.length * ml(protocol.dose)
    case 'daily':
      return 7 * protocol.cadence.timesOfDay.length * ml(protocol.dose)
    case 'asNeeded':
      return 0
  }
}

// Empirical fallback: weekly mL based on last N injections for a compound.
export function recentWeeklyMl(injections: InjectionLog[], compoundId: number, concentrationMgPerMl: number, days = 28): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const relevant = injections.filter(
    (i) => i.compoundId === compoundId && new Date(i.takenAt).getTime() >= cutoff && i.dose !== undefined,
  )
  if (relevant.length === 0) return 0
  const totalMg = relevant.reduce((sum, i) => sum + (i.dose ?? 0), 0)
  const ml = totalMg / concentrationMgPerMl
  return (ml / days) * 7
}

export function projectedEmptyDate(vial: Vial, weeklyMl: number): Date | undefined {
  if (weeklyMl <= 0 || vial.remainingMl <= 0) return undefined
  const weeks = vial.remainingMl / weeklyMl
  return addDays(new Date(), Math.round(weeks * 7))
}
