// Dose arithmetic for the injection logger: dose <-> mL <-> syringe marks.
// Pure functions, type-only imports, so they can be exercised directly by
// scripts/dose.test.mjs.
//
// Units of measure, kept apart on purpose:
// - the compound's unit (mg, mcg or IU) is the DOSE;
// - a vial's strength is "base per mL", where base is mg (mg and mcg
//   compounds, vials are sold in mg) or IU (IU compounds);
// - the syringe's marks are the DRAW: units on insulin syringes, mL on
//   regular ones.

import type { Compound, SyringeKey, Unit } from './db'

export type Syringe = { key: SyringeKey; label: string; short: string; capacityMl: number; perMl: 100 | 1 }

// Every insulin syringe is U-100: 100 units is 1 mL whatever the barrel size.
// A 30-unit syringe is 0.3 mL. Barrel size changes capacity and how finely it
// reads, never the maths. Order matters: syringeAdvice offers the first fit.
export const SYRINGES: Syringe[] = [
  { key: 'u30', label: 'Insulin, 30 units (0.3 mL)', short: '30 unit insulin', capacityMl: 0.3, perMl: 100 },
  { key: 'u50', label: 'Insulin, 50 units (0.5 mL)', short: '50 unit insulin', capacityMl: 0.5, perMl: 100 },
  { key: 'u100', label: 'Insulin, 100 units (1 mL)', short: '100 unit insulin', capacityMl: 1, perMl: 100 },
  { key: 'ml1', label: 'Regular, 1 mL', short: '1 mL', capacityMl: 1, perMl: 1 },
  { key: 'ml2', label: 'Regular, 2 mL', short: '2 mL', capacityMl: 2, perMl: 1 },
  { key: 'ml3', label: 'Regular, 3 mL', short: '3 mL', capacityMl: 3, perMl: 1 },
]

export type EntryMode = 'dose' | 'draw'

export type Derived = { base?: number; ml?: number; draw?: number; doseInUnit?: number }

/**
 * Lenient number parse: "1,5" is 1.5 (decimal comma), junk is NaN.
 * "5,000" is 5000 to some people and 5.000 to others, and reading an HCG vial
 * 1000 times too weak is worse than asking again, so it is refused.
 */
export function num(s: string): number {
  const t = s.trim()
  if (/^[1-9]\d{0,2}(,\d{3})+$/.test(t)) return NaN
  const n = parseFloat(t.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

export const unitLabel = (u?: string) => (u === 'iu' ? 'IU' : u ?? '')

/** Units a vial strength can convert. Tablets, capsules and mL log as typed. */
export const converts = (u: Unit) => u === 'mg' || u === 'mcg' || u === 'iu'

const toBase = (x: number, unit: Unit) => (unit === 'mg' || unit === 'iu' ? x : unit === 'mcg' ? x / 1000 : undefined)

export function syringeOf(key: string | undefined, route: 'IM' | 'SubQ'): Syringe {
  return SYRINGES.find((s) => s.key === key) ?? SYRINGES.find((s) => s.key === (route === 'SubQ' ? 'u100' : 'ml1'))!
}

/** The compound's last syringe, but only on the route it was used on. */
export function rememberedSyringe(c: Pick<Compound, 'syringe' | 'defaultRoute'> | undefined, route: 'IM' | 'SubQ'): Syringe {
  return c?.syringe && (c.defaultRoute ?? route) === route ? syringeOf(c.syringe, route) : syringeOf(undefined, route)
}

/**
 * Convert one syringe line. `amount` is read in `mode`; `unit` is the compound's
 * own unit so the value can be stored and shown again next time. `conc` is
 * base per mL, undefined when the user has not given a strength yet. `perMl`
 * is how many marks make 1 mL on the syringe in use.
 */
export function derive(mode: EntryMode, amount: number, unit: Unit, conc?: number, perMl = 100): Derived {
  if (!Number.isFinite(amount) || amount <= 0) return {}
  if (mode === 'draw') {
    const ml = amount / perMl
    const base = conc && converts(unit) ? ml * conc : undefined
    const doseInUnit = base === undefined ? undefined : unit === 'mcg' ? base * 1000 : base
    return { base, ml, draw: amount, doseInUnit }
  }
  const base = toBase(amount, unit)
  const ml = conc && base !== undefined ? base / conc : undefined
  const draw = ml !== undefined ? ml * perMl : undefined
  return { base, ml, draw, doseInUnit: amount }
}

/** Units are read off a barrel, so one decimal is all the precision there is. */
export function roundForMode(v: number, mode: EntryMode, unit: Unit, perMl = 100): string {
  const digits = mode === 'draw' ? (perMl === 100 ? 1 : 3) : unit === 'mcg' ? 1 : unit === 'iu' ? 2 : 3
  return String(Number(v.toFixed(digits)))
}

/**
 * The amount to show after switching between the dose and draw tabs.
 * Returns undefined when there is nothing to carry over (no value typed, or no
 * strength to convert through). The caller then just swaps the tab.
 */
export function convertAmount(
  amount: string,
  from: EntryMode,
  to: EntryMode,
  unit: Unit,
  conc?: number,
  perMl = 100,
): string | undefined {
  if (from === to) return undefined
  const d = derive(from, num(amount), unit, conc, perMl)
  const next = to === 'draw' ? d.draw : d.doseInUnit
  if (next === undefined || !Number.isFinite(next)) return undefined
  return roundForMode(next, to, unit, perMl)
}

/** Re-express a draw when the syringe changes family: 20 units is 0.2 mL, never 20 mL. */
export function convertDraw(amount: string, fromPerMl: number, toPerMl: number): string | undefined {
  if (fromPerMl === toPerMl) return undefined
  const a = num(amount)
  if (!(a > 0)) return undefined
  return roundForMode((a / fromPerMl) * toPerMl, 'draw', 'mg', toPerMl)
}

/** A volume as read on this syringe: "6.7" units, or "0.07" mL. Display only. */
export function formatDraw(ml: number, s: Syringe): string {
  return s.perMl === 100 ? String(Number((ml * 100).toFixed(1))) : ml.toFixed(2)
}

/** "units" / "unit" / "mL" after a formatted draw. */
export const drawUnit = (formatted: string, s: Syringe) => (s.perMl === 1 ? 'mL' : formatted === '1' ? 'unit' : 'units')

/**
 * Where to stop for each compound when several share one syringe: a running
 * total. The sum is rounded, not the parts, so the marks never drift.
 */
export function drawMarks(mls: number[], s: Syringe): string[] {
  let sum = 0
  return mls.map((ml) => formatDraw((sum += ml), s))
}

const EPS = 1e-9

/**
 * Over: the syringe can't hold the shot; offer the first one that can, in the
 * same family first. Small: the smallest draw is under a tenth of the barrel,
 * too fine to read; offer a smaller barrel of the same family. Advice never
 * crosses from regular to insulin, so oil users are not pushed to slin pins.
 */
export function syringeAdvice(totalMl: number, minLineMl: number, s: Syringe): { kind: 'over' | 'small'; use?: Syringe } | undefined {
  if (totalMl > s.capacityMl + EPS) {
    const use =
      SYRINGES.find((x) => x.perMl === s.perMl && x.capacityMl + EPS >= totalMl) ??
      SYRINGES.find((x) => x.perMl === 1 && x.capacityMl + EPS >= totalMl)
    return { kind: 'over', use }
  }
  if (minLineMl < s.capacityMl / 10) {
    const use = SYRINGES.find((x) => x.perMl === s.perMl && x.capacityMl < s.capacityMl && x.capacityMl + EPS >= totalMl)
    return use ? { kind: 'small', use } : undefined
  }
  return undefined
}
