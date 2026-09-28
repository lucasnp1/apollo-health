import type { Compound, Unit, VialKind } from './db'

const toNum = (s: string) => {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

// Legacy free-text `concentration` held two different things: a strength
// ("300/ml", "250 mg/ml", bare "60.0") for oils, and the VIAL size ("10mg")
// for peptides. Each parser only accepts its own shape, so "10mg" is never
// read as 10 mg/mL again.
export function concFromText(t?: string): number | undefined {
  const m = t?.match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:(?:mg|iu)?\s*(?:\/|per)\s*ml)?\s*$/i)
  return m ? toNum(m[1]) : undefined
}

export function vialFromText(t?: string): number | undefined {
  const m = t?.match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:mg|iu)?\s*$/i)
  return m ? toNum(m[1]) : undefined
}

export type VialInfo = { kind: VialKind; conc?: number; vialMg?: number; water?: number; legacy: boolean }

/**
 * How a compound's vial is set up. Rows saved by the current logger carry an
 * explicit `vialKind`; older rows (legacy) are inferred once from what they
 * hold, never from the route: a testosterone once logged SubQ is still an oil.
 */
export function vialOf(c: Partial<Compound>): VialInfo {
  const legacy = c.vialKind !== 'liquid' && c.vialKind !== 'powder'
  const kind: VialKind = !legacy
    ? c.vialKind!
    : ((c.vialMg ?? 0) > 0 && (c.reconstituteMl ?? 0) > 0) || c.category === 'Peptide' || c.unit === 'iu'
      ? 'powder'
      : 'liquid'
  return {
    kind,
    legacy,
    vialMg: c.vialMg ?? (legacy && kind === 'powder' ? vialFromText(c.concentration) : undefined),
    water: c.reconstituteMl,
    conc: c.concentrationMgPerMl ?? (legacy ? concFromText(c.concentration) : undefined),
  }
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
