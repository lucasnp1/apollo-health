// The Timeline's rows, built from the logged data. Mirrors the web's views/Timeline.tsx "All" feed (titles, subs,
// statuses), minus labs and files until those land in the app.
import { differenceInCalendarDays, format, isToday, isYesterday, parseISO } from 'date-fns'
import type { BodyMetric, Compound, InjectionLog, Symptom, VitalLog } from '@shared/lib/db'
import type { LabTest } from '@shared/lib/labTests'
import { compoundGroups, groupByCompoundId } from '@shared/lib/compounds'
import { ALL_SYMPTOMS, chipTone, ratingOf } from '@shared/lib/symptoms'
import type { ArchivableTable } from '@shared/lib/archive'
import { doseText } from '@/log'
import type { Tone } from '@/theme'

export type Kind = 'injection' | 'ancillary' | 'weight' | 'bp' | 'symptom' | 'lab'

export type Event = {
  id: string
  kind: Kind
  table: ArchivableTable | 'test'
  rowId: number
  date: Date
  title: string
  sub?: string
  status: { label: string; tone: Tone }
  note?: string
  /** The compound's colour, for injections */
  dot?: string
  /** The compound group key (compoundGroups), for injections */
  group?: string
  /** A blood test carries its draw day, not a time */
  dateOnly?: boolean
}

export const KIND_LABEL: Record<Kind, string> = { injection: 'Injections', ancillary: 'Ancillaries', weight: 'Weight', bp: 'Blood pressure', symptom: 'Check-ins', lab: 'Labs' }

/** Taken by mouth or another way (a cream, a spray): logged from the Ancillary sheet, not a shot. */
export const isAncillary = (i: Pick<InjectionLog, 'route'>) => i.route === 'Oral' || i.route === 'Other'

const LOGGED = { label: 'Logged', tone: 'neutral' } as const

/** Same thresholds as the web's Timeline bpStatus (views/Timeline.tsx). */
export function bpStatus(sys: number, dia: number): { label: string; tone: Tone } {
  if (sys >= 160 || dia >= 105) return { label: 'Action', tone: 'bad' }
  if (sys >= 145 || dia >= 95) return { label: 'High', tone: 'bad' }
  if (sys >= 135 || dia >= 88) return { label: 'Monitor', tone: 'warn' }
  if (sys >= 125 || dia >= 82) return { label: 'Good', tone: 'good' }
  return { label: 'Optimal', tone: 'good' }
}

const arrow = (v: number) => `${v > 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)} kg`
const facts = (...xs: Array<string | undefined | false>) => xs.filter((x): x is string => !!x).join(' · ') || undefined

export function buildEvents(d: { compounds: Compound[]; injections: InjectionLog[]; vitals: VitalLog[]; bodyMetrics: BodyMetric[]; symptoms: Symptom[]; tests?: LabTest[] }): Event[] {
  const byId = groupByCompoundId(compoundGroups(d.compounds, d.injections))
  const weights = d.bodyMetrics.filter((b) => b.weightKg !== undefined).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  const now = Date.now()
  return [
    ...d.injections.map((i): Event => {
      const c = byId.get(i.compoundId)
      const dose = doseText(i) || undefined
      const anc = isAncillary(i)
      const name = c?.name ?? (anc ? 'Ancillary' : 'Injection')
      return {
        id: `i-${i.id}`, kind: anc ? 'ancillary' : 'injection', table: 'injections', rowId: i.id!, date: parseISO(i.takenAt),
        title: dose ? `${name} · ${dose}` : name,
        sub: anc ? facts(i.route === 'Oral' ? 'by mouth' : 'other') : facts(i.site, i.route, i.vialAmount && `drew ${i.vialAmount}`, i.needle),
        status: LOGGED, note: i.notes, dot: c?.color, group: c?.key,
      }
    }),
    ...weights.map((w, n): Event => {
      const delta = n > 0 ? w.weightKg! - weights[n - 1].weightKg! : undefined
      return {
        id: `w-${w.id}`, kind: 'weight', table: 'bodyMetrics', rowId: w.id!, date: parseISO(w.measuredAt),
        title: `Weight ${w.weightKg} kg`,
        sub: facts(
          delta === undefined ? 'first entry' : Math.abs(delta) >= 0.05 ? `${arrow(delta)} vs last` : 'no change vs last',
          w.source === 'apple_health' && 'Apple Health',
        ),
        status: LOGGED, note: w.notes,
      }
    }),
    ...d.vitals.map((v): Event => {
      const st = bpStatus(v.systolic, v.diastolic)
      return {
        id: `v-${v.id}`, kind: 'bp', table: 'vitals', rowId: v.id!, date: parseISO(v.measuredAt),
        title: `Blood pressure ${v.systolic}/${v.diastolic}`,
        sub: facts(v.pulse ? `pulse ${v.pulse}` : undefined, st.label.toLowerCase()),
        status: st.tone === 'good' ? { label: 'In range', tone: 'good' } : st.tone === 'warn' ? { label: 'Monitor', tone: 'warn' } : st,
        note: v.notes,
      }
    }),
    ...d.symptoms.map((s): Event => {
      const first: string[] = []
      const watch: string[] = []
      let good = 0
      for (const def of ALL_SYMPTOMS) {
        const v = ratingOf(s, def)
        if (typeof v !== 'number') continue
        if (first.length < 3) first.push(`${def.label} ${v}`)
        const t = chipTone(v, def.direction)
        if (t === 'good') good += 1
        else if (t !== 'neutral') watch.push(def.label)
      }
      return {
        id: `s-${s.id}`, kind: 'symptom', table: 'symptoms', rowId: s.id!, date: parseISO(s.recordedAt),
        title: 'Check-in', sub: first.join(' · ') || undefined,
        status: watch.length ? { label: `${watch.length} to watch`, tone: 'warn' } : good ? { label: 'Feeling good', tone: 'good' } : LOGGED,
        note: s.notes,
      }
    }),
    ...(d.tests ?? []).map((t): Event => ({
      id: `e-${t.id}`, kind: 'lab', table: 'test', rowId: t.id, date: parseISO(t.date), dateOnly: true,
      title: t.title,
      sub: facts(t.provider, `${t.counts.total} result${t.counts.total === 1 ? '' : 's'}`),
      status: t.counts.outOfLabRange ? { label: `${t.counts.outOfLabRange} outside range`, tone: 'warn' } : LOGGED,
      note: t.exam.notes,
    })),
  ]
    .filter((e) => e.date.getTime() <= now)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
}

/** "Today", "Yesterday", "Thursday", then "12 Sept" (with the year when it isn't this one). */
export function dayTitle(d: Date, now = new Date()): string {
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  const days = differenceInCalendarDays(now, d)
  if (days > 0 && days < 7) return format(d, 'EEEE')
  return format(d, d.getFullYear() === now.getFullYear() ? 'EEE d MMM' : 'd MMM yyyy')
}

/** Newest day first, each day's rows newest first. */
export function byDay(events: Event[]): { title: string; data: Event[] }[] {
  const out: { key: string; title: string; data: Event[] }[] = []
  for (const e of events) {
    const key = format(e.date, 'yyyy-MM-dd')
    const last = out[out.length - 1]
    if (last?.key === key) last.data.push(e)
    else out.push({ key, title: dayTitle(e.date), data: [e] })
  }
  return out
}
