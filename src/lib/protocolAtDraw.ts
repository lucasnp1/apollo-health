// What was being taken when a test was drawn, and where in the injection
// cycle the draw fell. Only doses logged BEFORE the draw count, so a compound
// first taken after a test can never show up on it. Pure, so node can load it.

import { format } from 'date-fns'
import type { Compound, InjectionLog } from './db'
import { compoundGroups } from './compounds.ts'
import { dayOf } from './dates.ts'

export type DoseTiming = {
  group: string
  name: string
  androgen: boolean
  dose?: number
  unit: string
  everyDays?: number
  weekly?: number
  route?: string
  /** First logged dose of this compound (ISO). */
  since: string
  daysBefore: number
  timeKnown: boolean
  phase?: 'trough' | 'mid' | 'near-peak' | 'same-day' | 'missed'
}

const DAY = 86_400_000
const ANDROGEN = /testosterone|sustanon|nandrolone|deca|trenbolone|masteron|drostanolone|boldenone|primobolan|methenolone|anavar|oxandrolone|winstrol|stanozolol|dianabol|anadrol/i

export function isAndrogen(c: Compound): boolean {
  return c.category === 'TRT' || ANDROGEN.test(c.name)
}

// Doses that count as "before the draw". Without a draw time, anything on the
// draw day counts too; it reads as "same day" rather than a guessed phase.
function beforeDraw(i: InjectionLog, drawAt: Date, timeKnown: boolean): boolean {
  const t = Date.parse(i.takenAt)
  if (!Number.isFinite(t)) return false
  if (t <= drawAt.getTime()) return true
  return !timeKnown && dayOf(i.takenAt) === format(drawAt, 'yyyy-MM-dd')
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * One entry per compound with a dose in the 45 days before the draw, androgens
 * first. `drawAt` should carry the draw time, or 9 am when it is not known.
 */
export function protocolAtDraw(drawAt: Date, timeKnown: boolean, compounds: Compound[], injections: InjectionLog[]): DoseTiming[] {
  const byId = new Map(compounds.map((c) => [c.id, c]))
  const out: DoseTiming[] = []
  for (const g of compoundGroups(compounds, injections)) {
    const doses = injections
      .filter((i) => g.ids.includes(i.compoundId) && beforeDraw(i, drawAt, timeKnown))
      .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
    const last = doses[doses.length - 1]
    if (!last) continue
    const daysBefore = (drawAt.getTime() - Date.parse(last.takenAt)) / DAY
    if (daysBefore > 45) continue

    const recent = doses.slice(-6)
    const gaps = recent.slice(1).map((d, i) => (Date.parse(d.takenAt) - Date.parse(recent[i].takenAt)) / DAY)
    const everyDays = recent.length >= 3 ? Math.round(median(gaps) * 10) / 10 : undefined

    let phase: DoseTiming['phase']
    if (!timeKnown && dayOf(last.takenAt) === format(drawAt, 'yyyy-MM-dd')) phase = 'same-day'
    else if (everyDays) {
      const f = Math.max(0, daysBefore) / everyDays
      phase = f > 1.5 ? 'missed' : f >= 0.75 ? 'trough' : f < 0.35 ? 'near-peak' : 'mid'
    }

    const canonical = byId.get(last.compoundId) ?? g.canonical
    out.push({
      group: g.key,
      name: g.name,
      androgen: g.ids.some((id) => { const c = byId.get(id); return !!c && isAndrogen(c) }),
      dose: last.dose,
      unit: last.unit ?? canonical.unit,
      everyDays,
      weekly: last.dose !== undefined && everyDays ? Math.round((last.dose * 7 * 100) / everyDays) / 100 : undefined,
      route: last.route,
      since: doses[0].takenAt,
      daysBefore: Math.round(Math.max(0, daysBefore) * 10) / 10,
      timeKnown,
      phase,
    })
  }
  return out.sort((a, b) => Number(b.androgen) - Number(a.androgen) || a.daysBefore - b.daysBefore)
}

function androgenShots(compounds: Compound[], injections: InjectionLog[]): number[] {
  const ids = new Set(compounds.filter(isAndrogen).map((c) => c.id))
  return injections.filter((i) => ids.has(i.compoundId)).map((i) => Date.parse(i.takenAt)).filter(Number.isFinite)
}

/** An androgen dose was logged in the 60 days before the draw. */
export function onProtocol(drawAt: Date, compounds: Compound[], injections: InjectionLog[]): boolean {
  const t = drawAt.getTime()
  return androgenShots(compounds, injections).some((s) => s <= t && s >= t - 60 * DAY)
}

/** The draw came before the first androgen dose ever logged: a baseline. */
export function beforeProtocol(drawAt: Date, compounds: Compound[], injections: InjectionLog[]): boolean {
  const shots = androgenShots(compounds, injections)
  return shots.length > 0 && shots.reduce((a, b) => Math.min(a, b)) > drawAt.getTime()
}
