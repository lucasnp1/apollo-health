import type { Unit } from './db'

// Best-effort parse of a free-text concentration string into mg/mL.
// Handles "250 mg/ml", "250mg/mL", "200 mg per ml", and bare "250" (assumed mg/mL).
export function parseConcentrationMgPerMl(text?: string): number | undefined {
  if (!text) return undefined
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:mg)?\s*(?:\/|per)?\s*m?l?/i)
  const n = m ? parseFloat(m[1]) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

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

