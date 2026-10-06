// Date helpers shared by the PDF reader and the Bloods libraries. Pure (no
// React, siblings imported with .ts) so `node scripts/labs.test.mjs` loads it.

import { format, parseISO } from 'date-fns'
import { isTableText, parseLabTable } from './labTable.ts'

/** A printed lab date ("23/06/2026", "2026-06-23", "28 May 2026", "4-JUN-2026", "May 28, 2026") as yyyy-mm-dd. */
export function parseLabDate(raw: string): string | undefined {
  const s = raw.trim()
  // "31/06/2026" and Feb 29 in a non-leap year match the patterns but are not days.
  const ok = (iso: string) => (dayOf(iso) === iso ? iso : undefined)
  let m = s.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return ok(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`)
  // d/m/yyyy is the default (UK, EU, Brazil). Only a first number above 12
  // could disambiguate, and it also means day-first.
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/)
  if (m) {
    const a = parseInt(m[1], 10)
    const b = parseInt(m[2], 10)
    // m/d/yyyy only when the second number cannot be a month.
    const [day, month] = b > 12 && a <= 12 ? [b, a] : [a, b]
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
    return ok(`${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
  }
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  // "28 May 2026" and "4-JUN-2026".
  m = s.match(/(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s-]+(20\d{2})/)
  if (m) {
    const mi = months.indexOf(m[2].slice(0, 3).toLowerCase())
    if (mi >= 0) return ok(`${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`)
  }
  m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})/)
  if (m) {
    const mi = months.indexOf(m[1].slice(0, 3).toLowerCase())
    if (mi >= 0) return ok(`${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`)
  }
  return undefined
}

/** The date inside a lab's file name: "…23-06-2026" and "…_28-May-2026-0413" both work. */
export function dateFromFileName(name: string): string | undefined {
  return parseLabDate(name) ?? parseLabDate(name.replace(/[_-]+/g, ' '))
}

/** 'Jun 28, 2026'. Everything in Bloods spans years, so the year is always shown. */
export function fmtDay(iso: string): string {
  const day = dayOf(iso)
  return day ? format(parseISO(day), 'MMM d, yyyy') : ''
}

/** A calendar-day stamp: a bare date, or midnight (legacy manual) or noon UTC. */
export const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}(T(00|12):00:00(\.000)?Z)?$/

/** The calendar day of a lab date or the local day of a real timestamp, as yyyy-mm-dd; '' when invalid. */
export function dayOf(iso: string): string {
  // Lab dates are calendar days stored as midnight or noon UTC; reading those
  // in local time moves them a day west of UTC or at UTC+12.
  if (CALENDAR_DAY.test(iso)) {
    const day = iso.slice(0, 10)
    return Number.isNaN(parseISO(day).getTime()) ? '' : day
  }
  const d = parseISO(iso)
  return Number.isNaN(d.getTime()) ? '' : format(d, 'yyyy-MM-dd')
}

/** Whole calendar days from day a to day b (b later = positive). */
export function daysBetween(a: string, b: string): number {
  const utc = (s: string) => {
    const [y, m, d] = dayOf(s).split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((utc(b) - utc(a)) / 86_400_000)
}

/** yyyy-mm-dd, n days after a day. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = dayOf(iso).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// ── The draw date inside a report ─────────────────────────────────────────

const COLLECTION_LABELS = [
  /\b(?:collection|specimen|sample)\s*(?:date|collected|taken|received)\b/i,
  /\bdate\s+(?:of\s+)?(?:collect(?:ed|ion)|sample|draw)\b/i,
  /\bcollected\s*(?:on|at)?\b/i,
  // Medichecks / Inuvi print the draw as "Observation Date : 4-JUN-2026".
  /\bobservation\s+date\b/i,
  /\bspecimen\s+received\b/i,
  /\bsample\s+(?:date|received|taken)\b/i,
  /\b(?:drawn|draw date)\b/i,
  /\b(?:data\s+d[ae]\s+coleta|coleta|colhido\s+em)\b/i,
]
const REPORT_LABELS = [/\b(?:reported|report)\s*(?:date)?\b/i]

/**
 * The draw date printed in a report: the earliest date next to a collection
 * label ('report'), else the earliest next to a report label ('report-date',
 * usually a day or two after the draw). Birth dates, future dates and dates
 * over 15 years old are never taken.
 */
export function extractCollectionDate(text: string, now: Date = new Date()): { date: string; source: 'report' | 'report-date' } | undefined {
  // A spreadsheet has a date column; the sheet's own date is the draw date.
  if (isTableText(text)) {
    const date = parseLabTable(text).date
    return date ? { date, source: 'report' } : undefined
  }
  const today = dayOf(now.toISOString())
  const oldest = `${Number(today.slice(0, 4)) - 15}${today.slice(4)}`
  const earliest = (labels: RegExp[]) => {
    const found: string[] = []
    for (const label of labels) {
      for (const m of text.matchAll(new RegExp(label.source + '.{0,60}', label.flags + 'g'))) {
        // "Collected 23/06/2026 DOB 01/02/1980": keep what comes before the birth date.
        const cut = m[0].search(/birth|\bd\.?o\.?b\b/i)
        const iso = parseLabDate(cut >= 0 ? m[0].slice(0, cut) : m[0])
        if (iso && iso <= today && iso >= oldest) found.push(iso)
      }
    }
    return found.sort()[0]
  }
  const drawn = earliest(COLLECTION_LABELS)
  if (drawn) return { date: drawn, source: 'report' }
  const reported = earliest(REPORT_LABELS)
  return reported ? { date: reported, source: 'report-date' } : undefined
}
