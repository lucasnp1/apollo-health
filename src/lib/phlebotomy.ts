// Blood-letting read against the tests: what hematocrit was before and after
// each bleed, and when Home should bring it up. Pure (siblings imported with
// .ts) so node can check it.

import type { Phlebotomy } from './db'
import type { LabTest } from './labTests'
import { addDays, daysBetween, fmtDay } from './dates.ts'

/** The markers a bleed moves; their marker screens list the bleeds. */
export const BLEED_MARKERS = new Set(['hematocrit', 'hemoglobin', 'rbc', 'ferritin'])
// Labs re-check hematocrit about four weeks after a venesection.
export const RETEST_DAYS = 28
// Home stops bringing up a bleed this long after it, test or not.
const NUDGE_DAYS = 90

export const KIND_LABEL: Record<Phlebotomy['kind'], string> = { therapeutic: 'Venesection', donation: 'Blood donation' }

export function phlebotomyTitle(p: Pick<Phlebotomy, 'kind' | 'volumeMl'>): string {
  return `${KIND_LABEL[p.kind] ?? 'Blood-letting'}${p.volumeMl ? ` · ${p.volumeMl} mL` : ''}`
}

/** Live bleeds, newest first. */
export const liveBleeds = (rows: Phlebotomy[]) => rows.filter((p) => !p.archivedAt).sort((a, b) => b.performedAt.localeCompare(a.performedAt))

type Hct = { date: string; pct: number; high?: number; flagged: boolean }

// Hematocrit as a percent whichever way the lab printed it (0.56 L/L or 56%).
const pct = (v: number) => (v < 1.5 ? v * 100 : v)
const round = (v: number) => Math.round(v * 10) / 10

/** Hematocrit per test, oldest first. */
export function hctSeries(tests: LabTest[]): Hct[] {
  const out: Hct[] = []
  for (const t of tests) {
    const m = t.markers.find((x) => x.key === 'hematocrit')
    if (m?.value === undefined) continue
    out.push({ date: t.date, pct: round(pct(m.value)), high: m.high === undefined ? undefined : round(pct(m.high)), flagged: m.labFlag === 'high' || m.read === 'act' })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** The last hematocrit on or before the bleed and the first one after it. */
export function bleedEffect(p: Phlebotomy, series: Hct[]): { before?: Hct; after?: Hct; text?: string } {
  const before = [...series].reverse().find((h) => h.date <= p.performedAt)
  const after = series.find((h) => h.date > p.performedAt)
  if (!before && !after) return {}
  const part = (h: Hct, word: string) => `${h.pct}% ${word} (${fmtDay(h.date)})`
  const text = before && after
    ? `Hematocrit ${before.pct}% → ${after.pct}% (${fmtDay(before.date)} to ${fmtDay(after.date)})`
    : `Hematocrit ${before ? part(before, 'before') : part(after!, 'after')}`
  return { before, after, text }
}

export type BleedNudge = { tone: 'warn' | 'neutral'; title: string; sub: string }

/**
 * What Home says, if anything:
 *  - the newest test has high hematocrit and no bleed since: offer to log one;
 *  - a bleed with no test after it yet: when to retest.
 * Nothing once a test after the bleed is in, or 90 days on.
 */
export function bleedNudge(series: Hct[], bleeds: Phlebotomy[], today: string): BleedNudge | undefined {
  const latest = series[series.length - 1]
  const last = liveBleeds(bleeds)[0]
  if (last && (!latest || latest.date <= last.performedAt)) {
    const ago = daysBetween(last.performedAt, today)
    if (ago < 0 || ago > NUDGE_DAYS) return undefined
    const due = addDays(last.performedAt, RETEST_DAYS)
    return {
      tone: 'neutral',
      title: `${phlebotomyTitle(last)} ${ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`}`,
      sub: daysBetween(today, due) > 0 ? `Retest hematocrit around ${fmtDay(due)} to see what it did` : 'Retest hematocrit now to see what it did',
    }
  }
  if (latest?.flagged && (!last || last.performedAt < latest.date)) {
    return {
      tone: 'warn',
      title: `Hematocrit ${latest.pct}% on ${fmtDay(latest.date)}${latest.high !== undefined ? `, over the ${latest.high}% limit` : ''}`,
      sub: 'Had blood taken off since? Log it to see what it does next test',
    }
  }
  return undefined
}
