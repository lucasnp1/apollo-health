// Date helpers shared by the PDF reader and the Bloods libraries. Pure (no
// React, siblings imported with .ts) so `node scripts/labs.test.mjs` loads it.

import { format, parseISO } from 'date-fns'

/** A printed lab date ("23/06/2026", "2026-06-23", "28 May 2026", "May 28, 2026") as yyyy-mm-dd. */
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
  m = s.match(/(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(20\d{2})/)
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
