// The "what stood out" summary on the Wellbeing card, built on the device from
// the user's own data: which symptoms came up how often this week and this
// month, what they are often linked to, and the user's own evidence for it
// (latest lab result, blood pressure, a compound injected lately).
// Deliberately rules, not a language model: no per-user API cost, no health
// data leaving the phone, and every sentence traceable to a number.
// Pure (symptoms.ts and date-fns only), so scripts/wellbeing.test.mjs
// can run it directly.

import type { Symptom } from './db'
import { format, parseISO } from 'date-fns'
// .ts extension so node can run scripts/wellbeing.test.mjs against it.
import { ratingOf, type SymptomDef } from './symptoms.ts'

const DAY = 86_400_000

export type LabPoint = { label: string; value: number; raw?: string; unit?: string; low?: number; high?: number; at: string }

export type SummaryContext = {
  /** Latest result per canonical marker key (snake_case, as in markers.ts). */
  labs: Record<string, LabPoint>
  /** Average of recent home readings, if any. */
  bp?: { sys: number; dia: number; n: number }
  /** Names of compounds injected in the last 3 weeks. */
  recentCompounds: string[]
}

type Direction = 'high' | 'low' | 'either'

export type CauseRule = {
  line: string
  /** Canonical marker keys, most relevant first. */
  markers: string[]
  /** Per marker: which side of the range supports the link. */
  markerDirection: Direction[]
  useBp?: boolean
  compounds?: Array<{ match: RegExp; line: string }>
  /** /guides/<slug> */
  guide?: string
}

export type Cause = { symptom: string; line: string; evidence: string[]; guide?: string }

export type Insight = {
  keys: string[]
  /** "Nipple sensitivity and water retention" */
  title: string
  week: number
  month: number
  tone: 'bad' | 'warn'
  /** Every time was a side effect at 1 or 2 out of 5. */
  mild: boolean
  causes: Cause[]
}

export type WellbeingSummary = { checkIns: number; insights: Insight[] }

// Check-ins before this used a 1-5 scale where 1 was "none" and 3 was
// "normal" (many old rows hold a default 3). From here on 0 is none and any
// side effect at 1 or more was actually felt.
export const ZERO_BASED_SINCE = Date.parse('2026-09-26T12:07:49Z')

const oldScale = (s: Pick<Symptom, 'recordedAt'>) => Date.parse(s.recordedAt) < ZERO_BASED_SINCE

/** Was this symptom actually felt (a side effect) or poor (a good thing) in this check-in? */
export function felt(s: Symptom, def: SymptomDef): boolean {
  const v = ratingOf(s, def)
  if (v === undefined) return false
  if (def.direction === 'positive') return v <= 2
  return oldScale(s) ? v >= 4 : v >= 1
}

/** Felt and more than mild: worth naming on its own line. */
export function notable(s: Symptom, def: SymptomDef): boolean {
  const v = ratingOf(s, def)
  if (v === undefined || !felt(s, def)) return false
  return def.direction === 'positive' || v >= (oldScale(s) ? 4 : 3)
}

export const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`)

// Lower-case a label for mid-sentence use, leaving acronyms ("PIP", "HRV") alone.
const midSentence = (s: string) => (/^[A-Z][A-Z0-9]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1))

/** "Nipple sensitivity", "Low libido": a good thing only shows up here when it was poor. */
export const feltLabel = (def: SymptomDef) => (def.direction === 'positive' ? `Low ${midSentence(def.label)}` : def.label)

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  const [first, ...rest] = names
  const lower = [first, ...rest.map(midSentence)]
  return `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`
}

const fmtNum = (v: number) => String(Number(v.toFixed(v < 10 ? 2 : 1)))
// "8 Sep", or "8 Sep 2024" when it is not this year: an old result must not pass for a recent one.
const shortDate = (iso: string, now: number) => {
  const d = parseISO(iso)
  return format(d, d.getFullYear() === new Date(now).getFullYear() ? 'd MMM' : 'd MMM yyyy')
}

function labLine(key: string, lab: LabPoint | undefined, now: number): string | undefined {
  if (!lab) return undefined
  // The lab's own text when it has one ("<0.5" keeps its sign), else the number.
  const shown = lab.raw?.replace(/\s*[[(][0-9].*$/, '').replace(/\s*;.*$/, '').trim() || fmtNum(lab.value)
  const side = lab.high !== undefined && lab.value > lab.high ? ', above range'
    : lab.low !== undefined && lab.value < lab.low ? ', below range'
      : lab.low !== undefined || lab.high !== undefined ? ', in range' : ''
  const unit = !lab.unit ? '' : lab.unit === '%' ? '%' : ` ${lab.unit}`
  return `Your last ${markerName(key, lab.label)} was ${shown}${unit}${side} (${shortDate(lab.at, now)}).`
}

const supports = (lab: LabPoint, dir: Direction) =>
  (dir !== 'low' && lab.high !== undefined && lab.value > lab.high) ||
  (dir !== 'high' && lab.low !== undefined && lab.value < lab.low)

function evidenceFor(rule: CauseRule, ctx: SummaryContext, now: number): string[] {
  const out: string[] = []
  for (const c of rule.compounds ?? []) {
    if (ctx.recentCompounds.some((n) => c.match.test(n))) { out.push(c.line); break }
  }
  if (rule.useBp && ctx.bp) {
    // Home readings: 135/85 is the line for high, 150/95 is clearly high. One
    // or two readings are not a pattern, so they only ask for more.
    const { sys, dia, n } = ctx.bp
    const level = sys >= 150 || dia >= 95 ? 'clear' : sys >= 135 || dia >= 85 ? 'above' : ''
    const note = !level ? ''
      : n < 3 ? ', high for a one-off, so take a few more to confirm'
        : level === 'clear' ? ', clearly high and worth raising with a doctor soon' : ', above the 135/85 home limit'
    out.push(`Your blood pressure lately: ${sys}/${dia}${n === 1 ? ' from 1 reading' : ` average of ${n} readings`}${note}.`)
  }
  // At most two lab lines: results that point the way the link says (e.g.
  // estradiol above range for sore nipples) first, then the rest in order.
  const labs = rule.markers
    .map((k, i) => ({ k, lab: ctx.labs[k], dir: rule.markerDirection[i] ?? 'either' }))
    .filter((x): x is { k: string; lab: LabPoint; dir: Direction } => !!x.lab)
    .map((x, i) => ({ ...x, rank: supports(x.lab, x.dir) ? i : 100 + i }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 2)
    .map((x) => labLine(x.k, x.lab, now)!)
  if (labs.length) out.push(...labs)
  else if (rule.markers.length) {
    // One nudge, for the most relevant marker only.
    out.push(`No ${markerName(rule.markers[0])} result yet. Worth adding to your next bloods.`)
  }
  return out
}

// Mid-sentence name for a marker: "estradiol", but "TSH" and "IGF-1" keep
// their capitals. Falls back to the catalog label, then the key.
const NAMES: Record<string, string> = {
  estradiol: 'estradiol', prolactin: 'prolactin', hematocrit: 'hematocrit', hemoglobin: 'hemoglobin',
  total_testosterone: 'testosterone', free_testosterone: 'free testosterone', ferritin: 'ferritin',
  vitamin_d: 'vitamin D', vitamin_b12: 'vitamin B12', cortisol: 'cortisol', glucose: 'fasting glucose',
}
const markerName = (key: string, label?: string) => NAMES[key] ?? label ?? key.replace(/_/g, ' ')

/**
 * Symptoms felt in the last 30 days, most frequent first. Symptoms with the
 * same week and month counts share one sentence, as a person would say it.
 */
export function wellbeingSummary(
  symptoms: Symptom[],
  defs: SymptomDef[],
  rules: Record<string, CauseRule>,
  ctx: SummaryContext,
  now = Date.now(),
): WellbeingSummary {
  // No upper bound: a check-in saved after `now` was taken still counts.
  const month = symptoms.filter((s) => now - Date.parse(s.recordedAt) < 30 * DAY)
  const counts = defs
    .map((def) => {
      let m = 0, w = 0, strong = false, severe = false
      for (const s of month) {
        if (!felt(s, def)) continue
        m++
        if (now - Date.parse(s.recordedAt) < 7 * DAY) w++
        if (notable(s, def)) strong = true
        const v = ratingOf(s, def)!
        if (def.direction === 'negative' ? v >= 4 : v <= 1) severe = true
      }
      return { def, week: w, month: m, strong, severe }
    })
    .filter((c) => c.month > 0)
    .sort((a, b) => b.month - a.month || b.week - a.week)

  const groups = new Map<string, typeof counts>()
  for (const c of counts) {
    const k = `${c.week}|${c.month}`
    groups.set(k, [...(groups.get(k) ?? []), c])
  }

  const insights: Insight[] = []
  for (const list of groups.values()) {
    const { week, month: m } = list[0]
    const causes: Cause[] = []
    const seen = new Set<string>()
    for (const { def } of list) {
      const rule = rules[`${def.key}:${def.direction === 'positive' ? 'low' : 'high'}`]
      if (!rule) continue
      // Evidence shared by several symptoms (the same estradiol result) is shown once.
      const evidence = evidenceFor(rule, ctx, now).filter((e) => !seen.has(e))
      evidence.forEach((e) => seen.add(e))
      causes.push({ symptom: feltLabel(def), line: rule.line, evidence, guide: rule.guide })
    }
    insights.push({
      keys: list.map((c) => c.def.key),
      title: joinNames(list.map((c) => feltLabel(c.def))),
      week,
      month: m,
      tone: list.some((c) => c.severe) ? 'bad' : 'warn',
      mild: !list.some((c) => c.strong),
      causes,
    })
  }
  return { checkIns: month.length, insights }
}
