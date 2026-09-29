// The one range language in Bloods. The lab's own flag (labFlag) always shows
// next to the value; Magno's read (readMarker) only picks the chip, so the two
// can never argue. Common practice, not medical advice. Pure, so node can load it.

import type { MarkerTarget } from './db'
import { addDays, fmtDay } from './dates.ts'
import { isPointsMarker, toUnit } from './labUnits.ts'

export type LabFlag = 'high' | 'low' | 'in' | 'none'
export type Read = 'act' | 'watch' | 'expected' | 'fine' | 'none'
export type MarkerRead = { read: Read; reason: string; next?: string; retestWeeks?: 4 | 8 }

/** Markers a protocol is judged on. Missing ones are listed as "Not in this test". */
export const CORE_KEYS = ['total_testosterone', 'estradiol', 'hematocrit', 'psa', 'ldl', 'hdl', 'alt', 'egfr', 'hba1c']

/** The result against its own printed range. The printed H/L wins only when there is no range. */
export function labFlag(value?: number, low?: number, high?: number, printed?: string): LabFlag {
  const p = printed?.trim().toUpperCase()
  const byPrint: LabFlag = p === 'H' || p === 'HIGH' ? 'high' : p === 'L' || p === 'LOW' ? 'low' : 'none'
  if (value === undefined || (low === undefined && high === undefined)) return byPrint
  if (high !== undefined && value > high) return 'high'
  if (low !== undefined && value < low) return 'low'
  return 'in'
}

// Six significant digits: drops float noise (0.1 + 0.2) and keeps a printed 0.198.
const num = (v: number) => String(Number(v.toPrecision(6)))

/** '133 to 146', 'Under 5', 'Over 60', or 'No range printed'. */
export function fmtRange(low?: number, high?: number): string {
  if (low !== undefined && high !== undefined) return `${num(low)} to ${num(high)}`
  if (high !== undefined) return `Under ${num(high)}`
  if (low !== undefined) return `Over ${num(low)}`
  return 'No range printed'
}

// Reasons and next steps, one table. The reason is the row's sub line, the
// next step its note.
const NEXT = {
  hctAct: 'People usually give blood or ask their doctor about a phlebotomy, then retest in 2 to 4 weeks.',
  hctWatch: 'Retest at trough and well hydrated before changing anything. A dry draw day reads high.',
  psa: 'Retest after 48 hours with no cycling or ejaculation. If it holds, this is one for a doctor.',
  enzymeWatch: 'Hard training in the 2 days before a draw raises it. Retest after 48 hours of rest.',
  enzymeAct: 'At this level people see a doctor rather than wait.',
  lipids: 'Lipids follow the dose within weeks. Cardio, fiber and omega-3 are the usual first steps; a doctor can prescribe if it stays high.',
  e2High: 'People act on symptoms, not the number. Splitting the weekly dose is the usual first step.',
  e2Low: 'Often an aromatase inhibitor dose that is too strong. People ease it and retest.',
  egfr: 'Creatine, muscle and dehydration lower eGFR. Retest hydrated and off creatine for a week, and ask for cystatin C.',
  hba1c: 'A reading in this range needs a doctor to confirm.',
  salts: 'Often a sample problem, but tell your doctor this week and retest.',
  other: "Outside this lab's range. Retest, and mention it to your doctor if it holds.",
}

const EXPECTED_HIGH = new Set(['total_testosterone', 'free_testosterone', 'bioavailable_testosterone', 'fai'])
const EXPECTED_LOW = new Set(['lh', 'fsh', 'shbg'])

/** Above or below the lab range the way a protocol causes, whatever the personal target. */
export const expectedOnProtocol = (key: string, flag: LabFlag, onProtocol: boolean) =>
  onProtocol && ((flag === 'high' && EXPECTED_HIGH.has(key)) || (flag === 'low' && EXPECTED_LOW.has(key)))

function rangeReason(flag: LabFlag, low?: number, high?: number): string {
  const dir = flag === 'high' ? 'Above' : 'Below'
  if (low !== undefined && high !== undefined) return `${dir} the lab range of ${fmtRange(low, high)}`
  if (low === undefined && high === undefined) return `Flagged ${flag} by the lab`
  return `${dir} the lab limit of ${num((flag === 'high' ? high : low) ?? 0)}`
}

// A blank unit (manual entry, an unparsed PDF row) would skip every act line
// below. These markers have one plausible unit at a given size.
function guessUnit(key: string, v: number): string {
  if (key === 'hematocrit') return v < 1 ? 'L/L' : '%'
  if (key === 'hemoglobin') return v < 30 ? 'g/dL' : 'g/L'
  if (key === 'hba1c') return v < 20 ? '%' : 'mmol/mol'
  return key === 'psa' ? 'µg/L' : ''
}

const act = (reason: string, next: string): MarkerRead => ({ read: 'act', reason, next, retestWeeks: 4 })
const watch = (reason: string, next?: string): MarkerRead => ({ read: 'watch', reason, next, retestWeeks: 8 })

/**
 * Magno's read of one result. Steps run in order and the first match wins:
 * act lines, a personal target, expected-on-protocol, watch lines, then the
 * lab range. `prevWithin12mo` is the lowest value in the 12 months before this
 * draw, in this reading's unit.
 */
export function readMarker(
  m: { key: string; value?: number; unit: string; low?: number; high?: number; prevWithin12mo?: number; printed?: string },
  ctx: { onProtocol: boolean; target?: MarkerTarget },
): MarkerRead {
  const { key, value, low, high } = m
  if (value === undefined) return { read: 'none', reason: '' }
  const unit = m.unit.trim() || guessUnit(key, value)
  const inUnit = (to: string) => toUnit(key, value, unit, to)

  // 2. Act lines, each in the unit its threshold is written in.
  if (key === 'hematocrit' && (inUnit('%') ?? -1) >= 52) return act('52% or more', NEXT.hctAct)
  if (key === 'hemoglobin' && (inUnit('g/L') ?? -1) >= 185) return act('185 g/L or more', NEXT.hctAct)
  const rise = m.prevWithin12mo !== undefined ? value - m.prevWithin12mo : undefined
  if (key === 'psa') {
    const v = inUnit('µg/L')
    const r = rise !== undefined ? toUnit('psa', rise, unit, 'µg/L') : undefined
    if (v !== undefined && v >= 4) return act('4 or more', NEXT.psa)
    if (r !== undefined && r >= 1.4) return act('Up 1.4 or more within a year', NEXT.psa)
  }
  if ((key === 'alt' || key === 'ast') && value >= 3 * (high ?? 40)) return act("3 times the lab's upper limit or more", NEXT.enzymeAct)
  if (key === 'egfr' && value < 60) return act('Under 60', NEXT.egfr)
  if (key === 'hba1c') {
    const v = inUnit('mmol/mol')
    if (v !== undefined && Math.round(v) >= 48) return act('48 mmol/mol or more', NEXT.hba1c)
  }
  if (key === 'potassium' && value > 6.0) return act(`${num(value)} ${unit}`.trim(), NEXT.salts)
  if (key === 'sodium' && value < 130) return act(`${num(value)} ${unit}`.trim(), NEXT.salts)

  // 3. A personal target, only when it converts into this reading's unit.
  const t = ctx.target
  if (t && t.unit && (t.low !== undefined || t.high !== undefined)) {
    const tl = t.low !== undefined ? toUnit(key, t.low, t.unit, unit) : undefined
    const th = t.high !== undefined ? toUnit(key, t.high, t.unit, unit) : undefined
    if ((t.low === undefined || tl !== undefined) && (t.high === undefined || th !== undefined)) {
      const r = fmtRange(tl, th)
      const label = tl !== undefined && th !== undefined ? r : `(${r.toLowerCase()})`
      if ((tl !== undefined && value < tl) || (th !== undefined && value > th)) return watch(`Outside your target ${label}`)
      return { read: 'fine', reason: `Inside your target ${label}` }
    }
  }

  const flag = labFlag(value, low, high, m.printed)

  // 4. What a protocol does on purpose.
  if (expectedOnProtocol(key, flag, ctx.onProtocol)) {
    return { read: 'expected', reason: flag === 'high' ? 'Above the lab range. Expected on your protocol.' : 'Below the lab range. Expected while you take testosterone.' }
  }

  // 5. Watch lines inside the lab range.
  if (key === 'hematocrit' && (inUnit('%') ?? -1) >= 50) {
    return watch(flag === 'high' ? rangeReason(flag, low, high) : 'In the lab range, over the 50% line people on a protocol watch', NEXT.hctWatch)
  }
  if (key === 'psa' && rise !== undefined && (toUnit('psa', rise, unit, 'µg/L') ?? -1) >= 0.75) return watch('Up 0.75 or more within a year', NEXT.psa)

  // 6. The lab range.
  if (flag === 'high' || flag === 'low') {
    const next =
      key === 'alt' || key === 'ast' ? NEXT.enzymeWatch
        : (key === 'ldl' && flag === 'high') || (key === 'hdl' && flag === 'low') ? NEXT.lipids
          : key === 'estradiol' ? (flag === 'high' ? NEXT.e2High : NEXT.e2Low)
            : key === 'hematocrit' ? NEXT.hctWatch
              : NEXT.other
    return watch(rangeReason(flag, low, high), next)
  }
  if (flag === 'in') return { read: 'fine', reason: 'In the lab range' }
  return { read: 'none', reason: '' }
}

// R6: below these a move is noise. Absolute thresholds are in the unit named.
const ABS: Record<string, [number, string]> = {
  hematocrit: [2, '%'], hemoglobin: [8, 'g/L'], psa: [0.4, 'µg/L'], hba1c: [3, 'mmol/mol'],
}
const PCT20 = new Set(['total_testosterone', 'free_testosterone', 'estradiol', 'triglycerides', 'alt', 'ast', 'ggt', 'ferritin'])

/** The move from `was` to `now` (both in `unit`): "▲ 12%", "▼ 1.9 pts" or "≈ same". */
export function changeOf(key: string, now: number, was: number, unit: string): { text: string; meaningful: boolean; dir: 'up' | 'down' | 'same' } {
  let meaningful: boolean
  const abs = ABS[key]
  if (abs) {
    const a = toUnit(key, now, unit, abs[1]), b = toUnit(key, was, unit, abs[1])
    meaningful = a !== undefined && b !== undefined && Math.abs(a - b) >= abs[0] - 1e-9
  } else {
    meaningful = was === 0 ? now !== 0 : Math.abs((now - was) / was) >= (PCT20.has(key) ? 0.2 : 0.1) - 1e-9
  }
  if (!meaningful || now === was) return { text: '≈ same', meaningful: false, dir: 'same' }
  const dir = now > was ? 'up' : 'down'
  const arrow = dir === 'up' ? '▲' : '▼'
  if (isPointsMarker(key, unit)) {
    // Hematocrit printed as L/L still moves in points of a percent.
    const scale = key === 'hematocrit' ? (toUnit(key, 1, unit, '%') ?? 1) : 1
    return { text: `${arrow} ${num(Math.abs(now - was) * scale)} pts`, meaningful, dir }
  }
  if (was === 0) return { text: `${arrow} ${num(Math.abs(now))} ${unit}`.trim(), meaningful, dir }
  return { text: `${arrow} ${Math.round(Math.abs((now - was) / was) * 100)}%`, meaningful, dir }
}

/** The date to retest by (yyyy-mm-dd): 4 weeks after the draw for act, 8 for watch. */
export function retestBy(drawIso: string, weeks: 4 | 8): string {
  return addDays(drawIso, weeks * 7)
}

/** "Retest by Aug 23, 2026", or "Retest was due …" (warn) once the date has passed and no newer test has the marker. */
export function retestLine(by: string, newerHasMarker: boolean, now: Date = new Date()): { text: string; overdue: boolean } | undefined {
  if (newerHasMarker) return undefined
  const overdue = by < now.toISOString().slice(0, 10)
  return { text: overdue ? `Retest was due ${fmtDay(by)}` : `Retest by ${fmtDay(by)}`, overdue }
}
