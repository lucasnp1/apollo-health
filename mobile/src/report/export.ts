// The doctor export: one blood test or the log for a range, as a PDF (expo-print) or one CSV, shared with the system
// share sheet. Reads Dexie directly, without caps, the way the web's ExportSheet does.
import { format } from 'date-fns'
import { File, Paths } from 'expo-file-system'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { db, type Compound, type InjectionLog } from '@shared/lib/db'
import { dayOf } from '@shared/lib/dates'
import { fmtRange } from '@shared/lib/labRules'
import { buildTests, printedValue, type LabTest } from '@shared/lib/labTests'
import { ALL_SYMPTOMS, customDefs, ratingOf } from '@shared/lib/symptoms'
import { dedupeInjections } from '@/data/useLog'
import { DAY, doseText } from '@/log'
import { isAncillary } from '@/timeline'
import { logReportHtml, testReportHtml, type BpRow, type DoseRow, type WeightRow } from './html'

export type Include = { injections: boolean; ancillaries: boolean; weight: boolean; bp: boolean; checkins: boolean; bloods: boolean }
/** `compoundIds`: only shots of these compounds (the Timeline's compound filter); ancillaries are not narrowed by it. */
export type LogOpts = { from: Date; to: Date; include: Include; name?: string; compoundIds?: number[] }

const live = (r: { archivedAt?: number; deletedAtSync?: number }) => !r.archivedAt && !r.deletedAtSync
/** Display only (the web's unitLabel lives in dose.ts, which the iOS app must not ship). */

// ── Patient name: on this phone only (db.meta never syncs), shared with the web report's key ─────────────────────

const PATIENT_KEY = 'report.patient'
export async function getPatientName(): Promise<string> {
  const row = await db.meta.get(PATIENT_KEY)
  try { return (row ? (JSON.parse(row.value) as { name?: string }).name : '') ?? '' } catch { return '' }
}
export async function setPatientName(name: string): Promise<void> {
  const row = await db.meta.get(PATIENT_KEY)
  let was: Record<string, unknown> = {}
  try { was = row ? JSON.parse(row.value) : {} } catch { /* a broken row is replaced */ }
  const next: Record<string, unknown> = { ...was, name: name.trim() || undefined }
  await (next.name || next.dob ? db.meta.put({ key: PATIENT_KEY, value: JSON.stringify(next) }) : db.meta.delete(PATIENT_KEY))
}

// ── Reading ────────────────────────────────────────────────────────────────

/** Every blood test, newest first: the same inputs as labs/useTests.ts, read once. */
async function loadTests(): Promise<LabTest[]> {
  const [exams, results, files, targets, compounds, injections] = await Promise.all([
    db.exams.toArray(),
    db.results.toArray(),
    db.files.toArray(),
    db.markerTargets.toArray(),
    db.compounds.toArray().then((rows) => rows.filter((c) => !c.deletedAtSync)),
    db.injections.toArray().then((rows) => rows.filter((i) => !i.deletedAtSync && !i.archivedAt)),
  ])
  return buildTests({ exams, results, files, targets, compounds, injections: dedupeInjections(injections) })
}

const doseRows = (shots: InjectionLog[], compounds: Compound[]): DoseRow[] => {
  const names = new Map(compounds.map((c) => [c.id, c.name]))
  return dedupeInjections(shots).map((i) => ({
    at: i.takenAt,
    compound: names.get(i.compoundId) ?? 'Unknown compound',
    dose: doseText(i),
    route: i.route ?? '',
    site: i.site ?? '',
    notes: i.notes,
  }))
}

/** Newest first, inside [from, to]. */
const within = <T>(rows: T[], at: (r: T) => string, from: Date, to: Date) =>
  rows.filter((r) => { const t = Date.parse(at(r)); return t >= from.getTime() && t <= to.getTime() }).sort((a, b) => at(b).localeCompare(at(a)))

async function loadLog({ from, to, include, compoundIds }: LogOpts) {
  const [compounds, injections, vitals, bodyMetrics, symptoms, tests] = await Promise.all([
    db.compounds.toArray(), // archived compounds keep their names
    include.injections || include.ancillaries
      ? db.injections
          .filter((i) => live(i) && (isAncillary(i) ? include.ancillaries : include.injections && (!compoundIds || compoundIds.includes(i.compoundId))))
          .toArray()
      : [],
    include.bp ? db.vitals.toArray().then((rows) => rows.filter(live)) : [],
    include.weight ? db.bodyMetrics.toArray().then((rows) => rows.filter(live)) : [],
    include.checkins ? db.symptoms.toArray().then((rows) => rows.filter(live)) : [],
    include.bloods ? loadTests() : [],
  ])
  // Lab dates are calendar days: compare days, never instants.
  const fromDay = format(from, 'yyyy-MM-dd'), toDay = format(to, 'yyyy-MM-dd')
  return {
    injections: include.injections || include.ancillaries ? doseRows(within(injections, (i) => i.takenAt, from, to), compounds) : undefined,
    weight: include.weight
      ? within(bodyMetrics.filter((b) => b.weightKg !== undefined), (b) => b.measuredAt, from, to).map((b): WeightRow => ({ at: b.measuredAt, kg: b.weightKg!, notes: b.notes }))
      : undefined,
    bp: include.bp ? within(vitals, (v) => v.measuredAt, from, to).map((v): BpRow => ({ at: v.measuredAt, sys: v.systolic, dia: v.diastolic, pulse: v.pulse, notes: v.notes })) : undefined,
    checkins: include.checkins ? within(symptoms, (s) => s.recordedAt, from, to) : undefined,
    bloods: include.bloods ? tests.filter((t) => { const d = dayOf(t.date); return d !== '' && d >= fromDay && d <= toDay }) : undefined,
  }
}

// ── Sharing ────────────────────────────────────────────────────────────────

async function sharePdf(html: string, name: string) {
  // A4 in points; margins here because WebKit's print ignores most of @page.
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842, margins: { top: 36, bottom: 36, left: 34, right: 34 } })
  const file = new File(Paths.cache, `${name}.pdf`)
  new File(uri).moveSync(file, { overwrite: true })
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share with your doctor' })
}

/** The doctor report for one blood test, as a PDF. */
export async function exportTestPdf(testId: number): Promise<void> {
  const [tests, compounds, name] = await Promise.all([loadTests(), db.compounds.toArray(), getPatientName()])
  const t = tests.find((x) => x.id === testId)
  if (!t) throw new Error('This test is not on file. It may have been archived.')
  // The draw instant, or the end of the draw day when no time was logged; then the 6 weeks before it.
  const time = t.exam.meta?.drawTime && /^\d{1,2}:\d{2}$/.test(t.exam.meta.drawTime) ? t.exam.meta.drawTime.padStart(5, '0') : '23:59'
  const end = new Date(`${dayOf(t.date)}T${time}`)
  let doses: DoseRow[] = []
  if (!Number.isNaN(end.getTime())) {
    const start = new Date(end.getTime() - 42 * DAY)
    start.setHours(0, 0, 0, 0)
    const shots = await db.injections.where('takenAt').between(start.toISOString(), end.toISOString(), true, true).filter(live).toArray()
    doses = doseRows(shots, compounds).reverse() // oldest first, as the web report
  }
  const d = dayOf(t.date)
  await sharePdf(testReportHtml(t, tests, { name, doses }), d ? `magno-bloods-${d}` : 'magno-bloods')
}

/** The log for a range, as a PDF. */
export async function exportLogPdf(opts: LogOpts): Promise<void> {
  const data = await loadLog(opts)
  await sharePdf(logReportHtml({ from: opts.from, to: opts.to, name: opts.name, ...data }), `magno-log-${format(opts.to, 'yyyy-MM-dd')}`)
}

// ── CSV: one file, one row per value, with a Type column (opens straight into a sheet and filters by type) ──────

const cell = (s: unknown) => { const v = String(s ?? ''); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }
const ymd = (iso: string) => { const t = Date.parse(iso); return Number.isNaN(t) ? '' : format(t, 'yyyy-MM-dd') }
const hm = (iso: string) => { const t = Date.parse(iso); return Number.isNaN(t) ? '' : format(t, 'HH:mm') }

export async function exportCsv(opts: LogOpts): Promise<void> {
  const r = await loadLog(opts)
  const rows: unknown[][] = [['Type', 'Date', 'Time', 'Item', 'Value', 'Unit', 'Lab range', 'Flag', 'Route', 'Site', 'Notes']]
  for (const i of r.injections ?? []) rows.push(['Injection', ymd(i.at), hm(i.at), i.compound, i.dose, '', '', '', i.route, i.site, i.notes])
  for (const w of r.weight ?? []) rows.push(['Weight', ymd(w.at), hm(w.at), 'Weight', w.kg, 'kg', '', '', '', '', w.notes])
  for (const b of r.bp ?? []) {
    rows.push(['Blood pressure', ymd(b.at), hm(b.at), 'Systolic/diastolic', `${b.sys}/${b.dia}`, 'mmHg', '', '', '', '', b.notes])
    if (b.pulse) rows.push(['Blood pressure', ymd(b.at), hm(b.at), 'Pulse', b.pulse, 'bpm', '', '', '', '', ''])
  }
  const checkins = r.checkins ?? []
  const defs = [...ALL_SYMPTOMS, ...customDefs(checkins)]
  for (const s of checkins) {
    for (const def of defs) {
      const v = ratingOf(s, def)
      if (v !== undefined) rows.push(['Check-in', ymd(s.recordedAt), hm(s.recordedAt), def.label, v, '0-5', '', '', '', '', ''])
    }
    if (s.notes?.trim()) rows.push(['Check-in', ymd(s.recordedAt), hm(s.recordedAt), 'Note', '', '', '', '', '', '', s.notes])
  }
  for (const t of r.bloods ?? []) {
    for (const m of t.markers) {
      rows.push(['Blood test', dayOf(t.date), t.exam.meta?.drawTime ?? '', m.printedName, printedValue(m), m.unit, fmtRange(m.low, m.high),
        m.labFlag === 'high' ? 'H' : m.labFlag === 'low' ? 'L' : '', '', '', [t.title, t.provider].filter(Boolean).join(' · ')])
    }
  }
  const file = new File(Paths.cache, `magno-export-${format(new Date(), 'yyyy-MM-dd')}.csv`)
  if (file.exists) file.delete()
  file.create()
  file.write('﻿' + rows.map((row) => row.map(cell).join(',')).join('\n') + '\n') // BOM so Excel reads UTF-8
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Share the spreadsheet' })
}
