// "What needs a look" on Home: one ranked list across bloods, blood pressure,
// weight, dose, blood-letting and check-ins. Each row is a fact from the
// user's own numbers plus what it lines up with, so a high blood pressure
// reading is checked against weight, hematocrit, estradiol and the dose
// instead of shown alone. Rules, not a model: every sentence traces to a number.
// Pure (siblings imported with .ts) so scripts/home-insights.test.mjs runs it.

import type { LucideIcon } from 'lucide-react'
import type { Compound, InjectionLog, Phlebotomy } from './db'
import type { Finding } from './labFindings'
import type { WellbeingSummary } from './wellbeingSummary'
import { addDays, daysBetween, fmtDay } from './dates.ts'
import { isAndrogen } from './protocolAtDraw.ts'
import { liveBleeds, phlebotomyTitle, RETEST_DAYS, type BleedNudge } from './phlebotomy.ts'
import { times } from './wellbeingSummary.ts'

const DAY = 86_400_000

export type Tone = 'bad' | 'warn' | 'neutral'
export type Fact = { text: string; tone?: 'bad' | 'warn' | 'good' }
export type HomeInsight = {
  id: string
  kind: 'bloods' | 'bp' | 'bleed' | 'symptoms' | 'stale'
  tone: Tone
  title: string
  sub: string
  chip: string
  facts: Fact[]
  /** What it lines up with, one sentence each. */
  why: string[]
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
const sign = (v: number, unit: string) => `${v > 0 ? '+' : ''}${r1(v)} ${unit}`

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

  const why: string[] = []
  const practices = ['Check the readings first: seated for five minutes, arm at heart height, two readings a minute apart, morning and evening for a week.']
  const facts: Fact[] = [{ text: `${sys}/${dia} average`, tone: sys >= 145 || dia >= 95 ? 'bad' : high ? 'warn' : undefined }]
  if (base) facts.push({ text: `was ${base.sys}/${base.dia}` })

  const w = windows(input.weights, (x) => x.at, now)
  if (w.recent.length && w.base.length) {
    const was = avg(w.base.map((x) => x.kg)), is = avg(w.recent.map((x) => x.kg))
    const d = is - was
    if (d >= 1) {
      why.push(`Weight is up ${r1(d)} kg over the same weeks (${r1(was)} to ${r1(is)} kg). More body mass is more blood for the heart to push, and pressure usually follows weight.`)
      practices.push('If it rose with your weight, the weight is the lever: a few kilos down usually takes a few points off.')
      facts.push({ text: `Weight ${sign(d, 'kg')}`, tone: 'warn' })
    } else if (d <= -1) {
      why.push(`Weight is down ${r1(-d)} kg over the same weeks, so weight is not what pushed it up.`)
      facts.push({ text: `Weight ${sign(d, 'kg')}`, tone: 'good' })
    } else {
      why.push(`Weight is steady around ${r1(is)} kg, so it is not weight.`)
    }
  } else {
    why.push('Log your weight now and then, so a rise in pressure can be checked against it.')
  }
  const fresh = (date: string) => now - Date.parse(date) <= 180 * DAY
  if (input.hct && input.hct.pct >= 50 && fresh(input.hct.date)) {
    why.push(`Hematocrit was ${r1(input.hct.pct)}% on ${fmtDay(input.hct.date)}. Thicker blood takes more pressure to move.`)
    practices.push('Bringing hematocrit down with a blood-letting often takes pressure down with it.')
    facts.push({ text: `HCT ${r1(input.hct.pct)}%`, tone: input.hct.pct >= 52 ? 'bad' : 'warn' })
  }
  if (input.e2 && input.e2.pgml > 40 && fresh(input.e2.date)) {
    why.push(`Estradiol was ${Math.round(input.e2.pgml)} pg/mL on ${fmtDay(input.e2.date)}, on the high side. It holds water, and water raises pressure.`)
    facts.push({ text: `E2 ${Math.round(input.e2.pgml)} pg/mL`, tone: 'warn' })
  }
  if (input.dose && input.dose.before > 0) {
    const pct = Math.round(((input.dose.recent - input.dose.before) / input.dose.before) * 100)
    if (pct >= 15) {
      why.push(`You injected ${pct}% more testosterone in the last three weeks than the three before (${r1(input.dose.recent)} vs ${r1(input.dose.before)} mg). A bigger dose raises hematocrit, water and pressure.`)
      facts.push({ text: `Dose +${pct}%`, tone: 'warn' })
    }
  }
  practices.push('Less salt and alcohol and more cardio are what people on a protocol try first.', 'Home readings that stay at 140/90 or over are when people see their doctor about it.')

  return {
    id: 'bp',
    kind: 'bp',
    tone: sys >= 145 || dia >= 95 ? 'bad' : 'warn',
    title: base && rise >= 6 ? `Blood pressure up ${rise} points to ${sys}/${dia}` : `Blood pressure averaging ${sys}/${dia}`,
    sub: `Last 14 days · ${bp.recent.length} readings`,
    chip: sys >= 145 || dia >= 95 ? 'High' : 'Watch',
    facts,
    why,
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
  const facts: Fact[] = f.markers.filter((m) => m.status === 'bad' || m.status === 'warn').map((m) => ({ text: `${m.label} ${m.display}`, tone: m.status as 'bad' | 'warn' }))
  const out: HomeInsight = {
    id: `lab-${f.id}`,
    kind: 'bloods',
    tone: f.status === 'bad' ? 'bad' : 'warn',
    title: f.headline,
    sub: `${f.label} · your ${fmtDay(test.date)} test`,
    chip: f.status === 'bad' ? 'Act' : 'Watch',
    facts,
    why: [f.story],
    causes: f.causes,
    practices: f.practices,
    icon: f.icon,
    testId: test.id,
  }
  if (f.id === 'blood') {
    const since = liveBleeds(bleeds).find((b) => b.performedAt > test.date)
    if (since) {
      const due = addDays(since.performedAt, RETEST_DAYS)
      out.facts.push({ text: `${phlebotomyTitle(since)} on ${fmtDay(since.performedAt)}`, tone: 'good' })
      out.why.push(daysBetween(today, due) > 0
        ? `You logged a ${phlebotomyTitle(since).toLowerCase()} on ${fmtDay(since.performedAt)}. A retest around ${fmtDay(due)} shows what it did.`
        : `You logged a ${phlebotomyTitle(since).toLowerCase()} on ${fmtDay(since.performedAt)}. It is time to retest and see what it did.`)
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
  return { id: 'bleed', kind: 'bleed', tone: n.tone, title: n.title, sub: n.sub, chip: n.tone === 'warn' ? 'High' : 'Retest', facts: [], why: [], logBleed: n.tone === 'warn' }
}

/** The newest test is too old to say much about now. */
export function staleInsight(test: { id: number; date: string }, today: string): HomeInsight | undefined {
  const days = daysBetween(test.date, today)
  if (days <= 180) return undefined
  const months = Math.round(days / 30)
  return {
    id: 'stale', kind: 'stale', tone: 'warn', chip: 'Due',
    title: `Your last blood test was ${months} months ago`,
    sub: `${fmtDay(test.date)} · on a protocol people test every 3 to 6 months`,
    facts: [], why: [], testId: test.id,
  }
}

// ── Check-ins: always one row ─────────────────────────────────────────────

export function symptomInsight(s: WellbeingSummary): HomeInsight | undefined {
  if (s.insights.length === 0) return undefined
  const names = s.insights.flatMap((i) => i.title.split(/, | and /)).map((n, i) => (i === 0 ? n : n.charAt(0).toLowerCase() + n.slice(1)))
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]
  const mild = s.insights.every((i) => i.mild)
  const severe = s.insights.some((i) => i.tone === 'bad')
  return {
    id: 'symptoms',
    kind: 'symptoms',
    tone: severe ? 'bad' : mild ? 'neutral' : 'warn',
    title: shown,
    sub: `${mild ? 'All mild' : 'Some strong'} · last 30 days · ${s.checkIns} check-in${s.checkIns === 1 ? '' : 's'}`,
    chip: severe ? 'Strong' : mild ? 'Mild' : 'Pattern',
    facts: [],
    why: s.insights.map((i) => `${i.title}: ${i.week > 0 ? `${times(i.week)} this week, ` : ''}${times(i.month)} this month${i.mild ? ', mild' : ''}. ${i.causes[0]?.line ?? ''}`.trim()),
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
