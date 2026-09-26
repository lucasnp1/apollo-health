// Dose arithmetic for the injection logger: mg/mcg <-> mL <-> syringe units.
// Pure functions, no imports beyond the Unit type, so they can be exercised
// directly by scripts/dose.test.mjs.

import type { Unit } from './db'

export const SYRINGE_UNITS_PER_ML = 100

export type EntryMode = 'dose' | 'units'

export type Derived = { mg?: number; ml?: number; units?: number; doseInUnit?: number }

/**
 * Convert one syringe line. `amount` is read in `mode`; `unit` is the compound's
 * own unit so the value can be stored and shown again next time. `conc` is mg/mL,
 * undefined when the user has not given a concentration yet.
 */
export function derive(mode: EntryMode, amount: number, unit: Unit, conc?: number): Derived {
  if (!Number.isFinite(amount) || amount <= 0) return {}
  if (mode === 'units') {
    const ml = amount / SYRINGE_UNITS_PER_ML
    const mg = conc ? ml * conc : undefined
    const doseInUnit = mg === undefined ? undefined : unit === 'mcg' ? mg * 1000 : mg
    return { mg, ml, units: amount, doseInUnit }
  }
  const mg = unit === 'mg' ? amount : unit === 'mcg' ? amount / 1000 : undefined
  const ml = conc && mg !== undefined ? mg / conc : undefined
  const units = ml !== undefined ? ml * SYRINGE_UNITS_PER_ML : undefined
  return { mg, ml, units, doseInUnit: amount }
}

/** Units are read off a barrel, so one decimal is all the precision there is. */
export function roundForMode(v: number, mode: EntryMode, unit: Unit): string {
  const digits = mode === 'units' ? 1 : unit === 'mcg' ? 1 : 3
  return String(Number(v.toFixed(digits)))
}

/**
 * The amount to show after switching between the "mg" and "units" tabs.
 * Returns undefined when there is nothing to carry over (no value typed, or no
 * concentration to convert through) — the caller then just swaps the tab.
 */
export function convertAmount(
  amount: string,
  from: EntryMode,
  to: EntryMode,
  unit: Unit,
  conc?: number,
): string | undefined {
  if (from === to) return undefined
  const d = derive(from, parseFloat(amount), unit, conc)
  const next = to === 'units' ? d.units : d.doseInUnit
  if (next === undefined || !Number.isFinite(next)) return undefined
  return roundForMode(next, to, unit)
}
