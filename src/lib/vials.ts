import { addDays } from 'date-fns'
import type { InjectionLog, Protocol, Unit, Vial } from './db'

// Convert a dose in the user's unit to mL consumed from a vial with known mg/mL.
// Returns undefined when conversion isn't well-defined for this unit.
export function mlFromDose(dose: number, unit: Unit, concentrationMgPerMl?: number): number | undefined {
  if (!Number.isFinite(dose) || dose <= 0) return undefined
  if (unit === 'ml') return dose
  if (!concentrationMgPerMl || concentrationMgPerMl <= 0) return undefined
  if (unit === 'mg') return dose / concentrationMgPerMl
  if (unit === 'mcg') return dose / 1000 / concentrationMgPerMl
  return undefined
}

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
