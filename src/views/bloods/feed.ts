// Row builders shared by every Bloods list (and Timeline's test rows), so a
// test or a marker reads the same wherever it shows up.

import { createElement as h, type ReactNode } from 'react'
import {
  Activity, Atom, CircleCheck, CircleDashed, Clock, Droplet, Filter, FlaskConical, Flame, Heart, Pill,
  ShieldAlert, Sun, TriangleAlert, type LucideIcon,
} from 'lucide-react'
import type { FeedFact, FeedStatus, FeedTone } from '../../components/FeedList'
import { RangeBar } from '../../components/RangeBar'
import type { LabSection } from '../../lib/markers'
import type { LabTest, TestMarker } from '../../lib/labTests'
import { fmtRange, retestLine } from '../../lib/labRules'
import { daysBetween, fmtDay } from '../../lib/dates'

export const SECTION_ICON: Record<LabSection, LucideIcon> = {
  Hormones: Atom,
  Prostate: ShieldAlert,
  'Full blood count': Droplet,
  Lipids: Heart,
  Liver: Activity,
  Kidney: Filter,
  'Blood sugar': Flame,
  Thyroid: Pill,
  'Iron & vitamins': Sun,
  Inflammation: Flame,
  'Other hormones': Atom,
  Other: FlaskConical,
}

const num = (v: number) => String(Number(v.toPrecision(6)))

/** The lab's printed value, without the range or notes some PDFs glue on. */
export function printedValue(m: Pick<TestMarker, 'rawValue' | 'value'>): string {
  const raw = m.rawValue?.replace(/\s*[[(][0-9].*$/, '').replace(/\s*;.*$/, '').trim()
  return raw || (m.value !== undefined ? num(m.value) : '')
}

/** "Hematocrit 51.2 % H": label, the value in mono, then the lab's H or L. */
export function valueTitle(label: string, value: string, unit: string, flag?: TestMarker['labFlag'], mutedTag = false): ReactNode {
  const tag = flag === 'high' ? 'H' : flag === 'low' ? 'L' : undefined
  return h('span', null,
    label, ' ',
    value && h('span', { className: 'font-mono font-medium tabular-nums' }, value, unit ? ` ${unit}` : ''),
    tag && h('span', { className: `ml-1 font-mono text-xs font-bold ${mutedTag ? 'text-muted-foreground' : 'text-destructive'}`, 'aria-label': tag === 'H' ? 'high' : 'low' }, tag),
  )
}

/** Magno's read (Pro). */
export function readChip(m: TestMarker): FeedStatus | undefined {
  switch (m.read) {
    case 'act': return { label: 'Act', tone: 'bad', icon: TriangleAlert }
    case 'watch': return { label: 'Watch', tone: 'warn', icon: Clock }
    case 'expected': return { label: 'Expected', tone: 'neutral' }
    case 'fine': return { label: 'Fine', tone: 'good', icon: CircleCheck }
    default: return flagChip(m)
  }
}

/** The lab's own flag, with the "expected on your protocol" relabel (Free). */
export function flagChip(m: Pick<TestMarker, 'labFlag' | 'expected'>): FeedStatus {
  if (m.labFlag === 'high' || m.labFlag === 'low') {
    const word = m.labFlag === 'high' ? 'High' : 'Low'
    return m.expected ? { label: `${word} · expected`, tone: 'neutral' } : { label: word, tone: 'bad', icon: TriangleAlert }
  }
  if (m.labFlag === 'in') return { label: 'In range', tone: 'good', icon: CircleCheck }
  return { label: 'No range', tone: 'neutral', icon: CircleDashed }
}

export const markerChip = (m: TestMarker, isPro: boolean) => (isPro ? readChip(m) : flagChip(m))

function iconToneOf(chip?: FeedStatus): FeedTone {
  return chip?.tone === 'bad' ? 'bad' : chip?.tone === 'warn' ? 'warn' : 'neutral'
}

/** "Lab range 40 to 50", "Under 5", "Over 133" or "No range printed". */
export function rangeSub(low?: number, high?: number): string {
  return low !== undefined && high !== undefined ? `Lab range ${fmtRange(low, high)}` : fmtRange(low, high)
}

/** The R4 to R6 change fact: toned when it counts, muted (with its reason) when it does not. */
export function changeFact(m: TestMarker): FeedFact | undefined {
  if (!m.change) return undefined
  if (!m.change.meaningful) return m.change.text
  return { text: m.change.text, tone: m.change.better === true ? 'good' : m.change.better === false ? 'bad' : undefined }
}

/**
 * One marker of one test. `printed` uses the lab's own name (test report);
 * otherwise the catalog label. `attention` swaps the range sub for the read's
 * reason and adds the next step and the retest date (Pro).
 */
export function markerRowProps(m: TestMarker, isPro: boolean, opts: { printed?: boolean; attention?: boolean; newerHasMarker?: boolean } = {}) {
  const status = markerChip(m, isPro)
  const title = valueTitle(opts.printed ? m.printedName : m.label, printedValue(m), m.unit, m.labFlag, m.expected)
  const facts: FeedFact[] = []
  if (isPro) {
    const c = changeFact(m)
    if (c) facts.push(c)
  }
  if (opts.attention && isPro) {
    const r = m.retestBy ? retestLine(m.retestBy, !!opts.newerHasMarker) : undefined
    if (r) facts.push(r.overdue ? { text: r.text, tone: 'warn' } : r.text)
    return { icon: SECTION_ICON[m.section], iconTone: iconToneOf(status), title, sub: m.reason, status, note: m.next, facts }
  }
  const bar = m.value !== undefined && (m.low !== undefined || m.high !== undefined)
    ? h(RangeBar, { value: m.value, low: m.low, high: m.high, previous: isPro ? m.prev?.value : undefined, className: 'mt-1.5 max-w-xs' })
    : undefined
  return { icon: SECTION_ICON[m.section], iconTone: iconToneOf(status), title, sub: rangeSub(m.low, m.high), status, note: opts.attention ? undefined : bar, facts }
}

/** "3 to act on" / "2 to watch" / "All fine" (Pro), or "3 outside range" (Free). */
export function testChip(t: LabTest, isPro: boolean): FeedStatus | undefined {
  const c = t.counts
  if (isPro) {
    if (c.act) return { label: `${c.act} to act on`, tone: 'bad', icon: TriangleAlert }
    if (c.watch) return { label: `${c.watch} to watch`, tone: 'warn', icon: Clock }
    if (c.fine) return { label: 'All fine', tone: 'good', icon: CircleCheck }
    return c.expected ? { label: 'Expected', tone: 'neutral' } : undefined
  }
  if (c.outOfLabRange) {
    const unexpected = t.markers.some((m) => (m.labFlag === 'high' || m.labFlag === 'low') && !m.expected)
    return { label: `${c.outOfLabRange} outside range`, tone: unexpected ? 'bad' : 'neutral', icon: unexpected ? TriangleAlert : undefined }
  }
  return t.markers.some((m) => m.labFlag === 'in') ? { label: 'In range', tone: 'good', icon: CircleCheck } : undefined
}

const PHASE_LABEL: Record<NonNullable<LabTest['timing'][number]['phase']>, string> = {
  trough: 'Trough', mid: 'Mid-interval', 'near-peak': 'Near peak', 'same-day': 'Dosed same day', missed: 'Missed dose',
}
export const phaseLabel = (p?: keyof typeof PHASE_LABEL) => (p ? PHASE_LABEL[p] : undefined)

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** One test as a feed row: title, date, provider, marker count, its chip and any warnings. */
export function testRowProps(t: LabTest, isPro: boolean, tests: LabTest[] = []) {
  const status = testChip(t, isPro)
  const facts: FeedFact[] = []
  // The provider sits in facts, so the phone sub keeps room for the marker count.
  if (t.provider && !t.title.toLowerCase().includes(t.provider.toLowerCase())) facts.push(t.provider)
  facts.push(...t.needsCheck.map((text) => ({ text, tone: 'warn' as const })))
  // Legacy single-marker tests sitting next to a real one were usually meant to be part of it.
  if (t.counts.total === 1 && tests.some((o) => o !== t && Math.abs(daysBetween(o.date, t.date)) <= 14)) facts.push('Only 1 marker')
  const phase = phaseLabel(t.timing.find((d) => d.androgen)?.phase)
  if (t.baseline) facts.push('Before protocol')
  else if (phase) facts.push(phase)
  return {
    icon: FlaskConical,
    iconTone: iconToneOf(status),
    title: t.title,
    when: fmtDay(t.date),
    sub: plural(t.counts.total, 'marker'),
    status,
    facts,
  }
}

/**
 * The one-line verdict on a test. Pro: "1 to act on, 2 to watch, 14 fine. 2
 * are expected on your protocol." Free: "3 of 19 markers are outside the lab
 * range, 2 of them expected on your protocol."
 */
export function verdictLine(t: LabTest, isPro: boolean): string {
  const c = t.counts
  if (isPro) {
    const exp = c.expected ? `${c.expected} ${c.expected === 1 ? 'is' : 'are'} expected on your protocol.` : ''
    if (!c.act && !c.watch) {
      const rest = [c.fine && `${c.fine} fine`, c.expected && `${c.expected} expected on your protocol`].filter(Boolean).join(', ')
      return `Nothing to act on.${rest ? ` ${rest}.` : ''}`
    }
    const parts = [c.act && `${c.act} to act on`, c.watch && `${c.watch} to watch`, c.fine && `${c.fine} fine`].filter(Boolean).join(', ')
    return `${parts}.${exp ? ` ${exp}` : ''}`.replace(/^./, (s) => s.toUpperCase())
  }
  const out = c.outOfLabRange
  if (!out) {
    // Only markers with a range were compared at all.
    const ranged = t.markers.filter((m) => m.labFlag !== 'none').length
    if (!ranged) return c.total === 1 ? 'No lab range printed for this marker.' : 'No lab range printed for these markers.'
    return ranged === 1 ? 'The 1 marker with a lab range is inside it.' : `All ${ranged} markers with a lab range are inside it.`
  }
  const expected = t.markers.filter((m) => (m.labFlag === 'high' || m.labFlag === 'low') && m.expected).length
  const tail = !expected ? '' : out === 1 ? ', expected on your protocol' : `, ${expected} of them expected on your protocol`
  return `${out} of ${plural(c.total, 'marker')} ${out === 1 ? 'is' : 'are'} outside the lab range${tail}.`
}
