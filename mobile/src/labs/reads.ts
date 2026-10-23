// How a test and a marker read, in words and a tone: the web's Bloods row builders (src/views/bloods/feed.ts:
// readChip, flagChip, testChip, verdictLine), minus the web's icons and DOM. Pro gets Magno's read of each marker
// (act / watch / expected / fine, with a reason; the app leaves out what people usually do); free gets the lab's own flag.
import { daysBetween } from '@shared/lib/dates'
import type { LabTest, TestMarker } from '@shared/lib/labTests'
import type { Tone } from '@/theme'

export type Chip = { label: string; tone: Tone }

export function readChip(m: TestMarker): Chip {
  switch (m.read) {
    case 'act': return { label: 'Outside range', tone: 'bad' }
    case 'watch': return { label: 'Watch', tone: 'warn' }
    case 'expected': return { label: 'Expected', tone: 'neutral' }
    case 'fine': return { label: 'Fine', tone: 'good' }
    default: return flagChip(m)
  }
}

export function flagChip(m: Pick<TestMarker, 'labFlag' | 'expected'>): Chip {
  if (m.labFlag === 'high' || m.labFlag === 'low') {
    const word = m.labFlag === 'high' ? 'High' : 'Low'
    return m.expected ? { label: `${word} · expected`, tone: 'neutral' } : { label: word, tone: 'bad' }
  }
  if (m.labFlag === 'in') return { label: 'In range', tone: 'good' }
  return { label: 'No range', tone: 'neutral' }
}

export const markerChip = (m: TestMarker, pro: boolean) => (pro ? readChip(m) : flagChip(m))

export function testChip(t: LabTest, pro: boolean): Chip | undefined {
  const c = t.counts
  if (pro) {
    if (c.act) return { label: `${c.act} to act on`, tone: 'bad' }
    if (c.watch) return { label: `${c.watch} to watch`, tone: 'warn' }
    if (c.fine) return { label: 'All fine', tone: 'good' }
    return c.expected ? { label: 'Expected', tone: 'neutral' } : undefined
  }
  if (c.outOfLabRange) {
    const unexpected = t.markers.some((m) => (m.labFlag === 'high' || m.labFlag === 'low') && !m.expected)
    return { label: `${c.outOfLabRange} outside range`, tone: unexpected ? 'bad' : 'neutral' }
  }
  return t.markers.some((m) => m.labFlag === 'in') ? { label: 'In range', tone: 'good' } : undefined
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "1 to act on, 2 to watch, 14 fine." (Pro) or "3 of 19 markers are outside the lab range." (free) */
export function verdictLine(t: LabTest, pro: boolean): string {
  const c = t.counts
  if (pro) {
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
    const ranged = t.markers.filter((m) => m.labFlag !== 'none').length
    if (!ranged) return 'No lab range printed for these markers.'
    return ranged === 1 ? 'The 1 marker with a lab range is inside it.' : `All ${ranged} markers with a lab range are inside it.`
  }
  const expected = t.markers.filter((m) => (m.labFlag === 'high' || m.labFlag === 'low') && m.expected).length
  const tail = !expected ? '' : out === 1 ? ', expected on your protocol' : `, ${expected} of them expected on your protocol`
  return `${out} of ${plural(c.total, 'marker')} ${out === 1 ? 'is' : 'are'} outside the lab range${tail}.`
}

const PHASE: Record<string, string> = { trough: 'Trough', mid: 'Mid-interval', 'near-peak': 'Near peak', 'same-day': 'Dosed same day', missed: 'Missed dose' }
/** Where in the dosing cycle the blood was drawn, from the shots logged before it. */
export const phaseLabel = (t: LabTest) => {
  if (t.baseline) return 'Before protocol'
  const p = t.timing.find((d) => d.androgen)?.phase
  return p ? PHASE[p] : undefined
}

/** Tests close enough to be the same draw: within 14 days, nearest first. */
export function mergeCandidates(t: LabTest, tests: LabTest[]): LabTest[] {
  const gap = (o: LabTest) => Math.abs(daysBetween(o.date, t.date))
  return tests.filter((o) => o.id !== t.id && gap(o) <= 14).sort((a, b) => gap(a) - gap(b))
}
