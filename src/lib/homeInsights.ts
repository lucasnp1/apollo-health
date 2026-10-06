// "What needs a look" on Home: one ranked list across bloods, blood pressure,
// weight, dose, blood-letting and check-ins. Each row is a fact from the
// user's own numbers plus what it lines up with, so a high blood pressure
// reading is checked against weight, hematocrit, estradiol and the dose
// instead of shown alone. Rules, not a model: every sentence traces to a number.
// Pure (siblings imported with .ts) so scripts/home-insights.test.mjs runs it.
//
// A row is kept short (title + one sub line that says what it lines up
// with); the detail sheet carries the signals, causes and common practice.

import type { LucideIcon } from 'lucide-react'
import type { Compound, InjectionLog, Phlebotomy } from './db'
import type { Finding } from './labFindings'
import type { WellbeingSummary } from './wellbeingSummary'
import { addDays, daysBetween, fmtDay } from './dates.ts'
import { isAndrogen } from './protocolAtDraw.ts'
import { KIND_LABEL, liveBleeds, phlebotomyTitle, RETEST_DAYS, type BleedNudge } from './phlebotomy.ts'
import { times } from './wellbeingSummary.ts'

const DAY = 86_400_000

export type Tone = 'bad' | 'warn' | 'neutral'
/** One line in the detail sheet: a label, its number, and what it means here. */
export type Signal = { label: string; value?: string; tone?: 'bad' | 'warn' | 'good'; text?: string }
export type HomeInsight = {
  id: string
  kind: 'bloods' | 'bp' | 'bleed' | 'symptoms' | 'stale'
  tone: Tone
  /** What part of you it is about, shown above the title: "Blood pressure", "Blood health". */
  area: string
  title: string
  /** One plain line: what it lines up with, or where the number came from. */
  sub: string
  chip: string
  /** A short paragraph at the top of the detail sheet. */
  summary?: string
  signalsTitle?: string
  signals: Signal[]
  causes?: string[]
  /** Common practice on a protocol, not advice. */
  practices?: string[]
  icon?: LucideIcon
  /** Where a tap goes: a test report, Bloods, or the blood-letting dialog. */
  testId?: number
  logBleed?: boolean
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const r1 = (v: number) => Math.round(v * 10) / 10
const sign = (v: number, unit: string) => `${v > 0 ? '+' : '−'}${r1(Math.abs(v))} ${unit}`
// "Oct 6" this year, "Oct 6, 2025" before: row lines stay on two phone lines.
const day = (iso: string, today: string) => (iso.slice(0, 4) === today.slice(0, 4) ? fmtDay(iso).replace(/, \d{4}$/, '') : fmtDay(iso))
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '')

// ── Blood pressure, read against what moves it ────────────────────────────

export type BpInput = {
  vitals: Array<{ measuredAt: string; systolic: number; diastolic: number }>
  weights: Array<{ at: string; kg: number }>
  /** From the newest test, when there is one. */
  hct?: { pct: number; date: string }
  e2?: { pgml: number; date: string }
  dose?: { recent: number; before: number }
}

// Recent = the last 14 days; baseline = 15 to 90 days back.
function windows<T>(rows: T[], at: (r: T) => string, now: number) {
  const age = (r: T) => (now - Date.parse(at(r))) / DAY
  return { recent: rows.filter((r) => age(r) <= 14), base: rows.filter((r) => age(r) > 14 && age(r) <= 90) }
}

export function bpInsight(input: BpInput, now: number): HomeInsight | undefined {
  const bp = windows(input.vitals, (v) => v.measuredAt, now)
  if (bp.recent.length < 2) return undefined
  const sys = Math.round(avg(bp.recent.map((v) => v.systolic)))
  const dia = Math.round(avg(bp.recent.map((v) => v.diastolic)))
  const base = bp.base.length >= 2 ? { sys: Math.round(avg(bp.base.map((v) => v.systolic))), dia: Math.round(avg(bp.base.map((v) => v.diastolic))) } : undefined
  const rise = base ? sys - base.sys : 0
  const high = sys >= 135 || dia >= 88
  if (!high && rise < 6) return undefined
  const veryHigh = sys >= 145 || dia >= 95

  const signals: Signal[] = [{
    label: 'Your average',
    value: `${sys}/${dia}`,
    tone: veryHigh ? 'bad' : high ? 'warn' : undefined,
    text: base ? `${bp.recent.length} readings in the last 14 days, against ${base.sys}/${base.dia} in the weeks before.` : `${bp.recent.length} readings in the last 14 days.`,
  }]
  const lines: string[] = []
  let notWeight = false
  const practices = ['Check the readings first: seated for five minutes, arm at heart height, two readings a minute apart, morning and evening for a week.']

  const w = windows(input.weights, (x) => x.at, now)
  if (w.recent.length && w.base.length) {
    const was = avg(w.base.map((x) => x.kg)), is = avg(w.recent.map((x) => x.kg))
    const d = is - was
    if (d >= 1) {
      lines.push('weight')
      signals.push({ label: 'Weight', value: sign(d, 'kg'), tone: 'warn', text: `Up from ${r1(was)} to ${r1(is)} kg over the same weeks. More body mass is more blood for the heart to push, and pressure usually follows weight.` })
      practices.push('If it rose with your weight, the weight is the lever: a few kilos down usually takes a few points off.')
    } else {
      notWeight = true
      signals.push(d <= -1
        ? { label: 'Weight', value: sign(d, 'kg'), tone: 'good', text: `Down from ${r1(was)} to ${r1(is)} kg over the same weeks, so weight is not what pushed it up.` }
        : { label: 'Weight', value: `${r1(is)} kg`, text: 'Steady over the same weeks, so it is not weight.' })
    }
  } else {
    signals.push({ label: 'Weight', value: 'not logged', text: 'Log your weight now and then, so a rise in pressure can be checked against it.' })
  }
  const fresh = (date: string) => now - Date.parse(date) <= 180 * DAY
  if (input.hct && input.hct.pct >= 50 && fresh(input.hct.date)) {
    lines.push('hematocrit')
    signals.push({ label: 'Hematocrit', value: `${r1(input.hct.pct)}%`, tone: input.hct.pct >= 52 ? 'bad' : 'warn', text: `From your ${fmtDay(input.hct.date)} test. Thicker blood takes more pressure to move.` })
    practices.push('Bringing hematocrit down with a blood-letting often takes pressure down with it.')
  }
  if (input.e2 && input.e2.pgml > 40 && fresh(input.e2.date)) {
    lines.push('estradiol')
    signals.push({ label: 'Estradiol', value: `${Math.round(input.e2.pgml)} pg/mL`, tone: 'warn', text: `From your ${fmtDay(input.e2.date)} test, on the high side. It holds water, and water raises pressure.` })
  }
  if (input.dose && input.dose.before > 0) {
    const pct = Math.round(((input.dose.recent - input.dose.before) / input.dose.before) * 100)
    if (pct >= 15) {
      lines.push('dose')
      signals.push({ label: 'Testosterone dose', value: `+${pct}%`, tone: 'warn', text: `${r1(input.dose.recent)} mg in the last three weeks against ${r1(input.dose.before)} mg the three before. A bigger dose raises hematocrit, water and pressure.` })
    }
  }
  practices.push('Less salt and alcohol and more cardio are what people on a protocol try first.', 'Home readings that stay at 140/90 or over are when people see their doctor about it.')

  // Kept to two phone lines; "not weight" is spelled out in the sheet.
  const sub = lines.length ? `Lines up with ${list(lines)}` : notWeight ? 'Not weight, and nothing else in your logs yet' : 'Nothing in your logs lines up with it yet'
  return {
    id: 'bp',
    kind: 'bp',
    tone: veryHigh ? 'bad' : 'warn',
    area: 'Blood pressure',
    // The area line above says "Blood pressure", so the title starts with the number.
    title: base && rise >= 6 ? `Up ${rise} points to ${sys}/${dia}` : `Averaging ${sys}/${dia}`,
    sub,
    chip: veryHigh ? 'High' : 'Watch',
    signalsTitle: 'What lines up',
    signals,
    practices,
  }
}

/** Testosterone mg injected in the last 21 days and the 21 before. */
export function doseChange(compounds: Compound[], injections: InjectionLog[], now: number): BpInput['dose'] {
  const ids = new Set(compounds.filter(isAndrogen).map((c) => c.id))
  let recent = 0, before = 0
  for (const i of injections) {
    if (!ids.has(i.compoundId) || i.unit !== 'mg' || !i.dose) continue
    const age = (now - Date.parse(i.takenAt)) / DAY
    if (age >= 0 && age <= 21) recent += i.dose
    else if (age > 21 && age <= 42) before += i.dose
  }
  return recent && before ? { recent, before } : undefined
}

// ── Bloods ────────────────────────────────────────────────────────────────

/** A section of the newest test that is worth a look, with blood-letting attached to blood health. */
export function labInsight(f: Finding, test: { id: number; date: string }, bleeds: Phlebotomy[], today: string): HomeInsight {
  const off = f.markers.filter((m) => m.status === 'bad' || m.status === 'warn')
  const tone = (s: string) => (s === 'bad' ? 'bad' as const : s === 'warn' ? 'warn' as const : s === 'good' ? 'good' as const : undefined)
  const out: HomeInsight = {
    id: `lab-${f.id}`,
    kind: 'bloods',
    tone: f.status === 'bad' ? 'bad' : 'warn',
    area: f.label,
    title: f.headline,
    sub: `${off.slice(0, 2).map((m) => `${m.label} ${m.display}`).join(', ')} · ${day(test.date, today)} test`,
    chip: f.status === 'bad' ? 'Act' : 'Watch',
    summary: f.story,
    signalsTitle: `${f.label}, ${fmtDay(test.date)}`,
    signals: f.markers.map((m) => ({ label: m.label, value: m.display, tone: tone(m.status) })),
    causes: f.causes,
    practices: f.practices,
    icon: f.icon,
    testId: test.id,
  }
  if (f.id === 'blood') {
    const since = liveBleeds(bleeds).find((b) => b.performedAt > test.date)
    if (since) {
      const due = addDays(since.performedAt, RETEST_DAYS)
      const retest = daysBetween(today, due) > 0 ? `retest around ${day(due, today)}` : 'time to retest'
      out.signals.push({ label: phlebotomyTitle(since), value: day(since.performedAt, today), tone: 'good', text: `Logged after this test. A ${retest.replace(/^time to retest$/, 'retest now')} shows what it did.` })
      out.sub = `${KIND_LABEL[since.kind]} ${day(since.performedAt, today)} · ${retest}`
      out.tone = 'neutral'
      out.chip = 'Retest'
    } else if (f.status === 'bad') {
      out.logBleed = true
    }
  }
  return out
}

/** A bleed waiting on its retest, or high hematocrit with none logged (when no bloods row says it). */
export function bleedInsight(n: BleedNudge | undefined): HomeInsight | undefined {
  if (!n) return undefined
  return { id: 'bleed', kind: 'bleed', tone: n.tone, area: 'Blood-letting', title: n.title, sub: n.sub, chip: n.tone === 'warn' ? 'High' : 'Retest', signals: [], logBleed: n.tone === 'warn' }
}

/** The newest test is too old to say much about now. */
export function staleInsight(test: { id: number; date: string }, today: string): HomeInsight | undefined {
  const days = daysBetween(test.date, today)
  if (days <= 180) return undefined
  const months = Math.round(days / 30)
  return {
    id: 'stale', kind: 'stale', tone: 'warn', area: 'Bloods', chip: 'Due',
    title: `Your last blood test was ${months} months ago`,
    sub: `${fmtDay(test.date)} · on a protocol people test every 3 to 6 months`,
    signals: [], testId: test.id,
  }
}

// ── Check-ins: always one row ─────────────────────────────────────────────

export function symptomInsight(s: WellbeingSummary): HomeInsight | undefined {
  if (s.insights.length === 0) return undefined
  const names = s.insights.flatMap((i) => i.title.split(/, | and /)).map((n, i) => (i === 0 ? n : n.charAt(0).toLowerCase() + n.slice(1)))
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : list(names)
  const mild = s.insights.every((i) => i.mild)
  const severe = s.insights.some((i) => i.tone === 'bad')
  return {
    id: 'symptoms',
    kind: 'symptoms',
    tone: severe ? 'bad' : mild ? 'neutral' : 'warn',
    area: 'Check-ins',
    title: shown,
    sub: `${mild ? 'All mild' : 'Some strong'} · ${s.checkIns} check-in${s.checkIns === 1 ? '' : 's'} in 30 days`,
    chip: severe ? 'Strong' : mild ? 'Mild' : 'Pattern',
    signalsTitle: 'Last 30 days',
    signals: s.insights.map((i) => ({
      label: i.title,
      value: i.week === 0 ? times(i.month) : i.week === i.month ? `${times(i.week)} this week` : `${times(i.month)}, ${times(i.week)} this week`,
      tone: i.tone === 'bad' ? 'bad' : i.mild ? undefined : 'warn',
      text: i.causes[0]?.line,
    })),
  }
}

// ── Order ─────────────────────────────────────────────────────────────────

const RANK: Record<Tone, number> = { bad: 0, warn: 1, neutral: 2 }
// A live trend outranks a point-in-time lab watch at the same level.
const KIND: Record<HomeInsight['kind'], number> = { bp: 0, bloods: 1, bleed: 2, stale: 3, symptoms: 4 }

/** Serious first. Check-ins rank a level below their tone, so a strong one sits with the watches and a mild one comes last. */
export function rankInsights(list: HomeInsight[]): HomeInsight[] {
  const score = (i: HomeInsight) => RANK[i.tone] + (i.kind === 'symptoms' ? 1 : 0)
  return [...list].sort((a, b) => score(a) - score(b) || KIND[a.kind] - KIND[b.kind])
}

/** "1 to act on, 2 to watch" for the card header. Check-ins and retests are not counted as findings. */
export function countLine(list: HomeInsight[]): string {
  const found = list.filter((i) => i.kind !== 'symptoms')
  const act = found.filter((i) => i.tone === 'bad').length
  const watch = found.filter((i) => i.tone === 'warn').length
  return [act && `${act} to act on`, watch && `${watch} to watch`].filter(Boolean).join(', ') || 'Nothing to act on'
}
