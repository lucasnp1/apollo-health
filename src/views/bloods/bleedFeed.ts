// Blood-letting rows and data, shared by the Bloods card, marker screens and Home.

import { Droplets } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Phlebotomy } from '../../lib/db'
import { dayOf, daysBetween, fmtDay } from '../../lib/dates'
import { bleedEffect, hctSeries, liveBleeds, phlebotomyTitle } from '../../lib/phlebotomy'
import type { LabTest } from '../../lib/labTests'

const today = () => dayOf(new Date().toISOString())

export function useBleeds(): Phlebotomy[] | undefined {
  return useLiveQuery(async () => liveBleeds(await db.phlebotomies.filter((p) => !p.deletedAtSync).toArray()), [])
}

const ago = (day: string) => {
  const n = daysBetween(day, today())
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 60 ? `${n} days ago` : `${Math.round(n / 30)} months ago`
}

/** One bleed as a feed row, with hematocrit before and after when the tests have it. */
export function bleedRowProps(p: Phlebotomy, tests: LabTest[]) {
  const effect = bleedEffect(p, hctSeries(tests))
  const fell = effect.before && effect.after ? effect.after.pct < effect.before.pct : undefined
  return {
    icon: Droplets,
    iconTone: 'accent' as const,
    title: phlebotomyTitle(p),
    sub: [fmtDay(p.performedAt), ago(p.performedAt), p.place].filter(Boolean).join(' · '),
    facts: effect.text ? [{ text: effect.text, tone: fell === true ? 'good' as const : fell === false ? 'warn' as const : undefined }] : undefined,
    note: p.notes,
  }
}

