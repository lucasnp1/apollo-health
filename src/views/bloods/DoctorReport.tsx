// The doctor report (Pro): one test as a light, clinical document the user
// saves as a PDF (window.print, so it works from the installed iOS PWA with no
// popup) or shares as a CSV. Only what the lab printed and what the patient
// logged goes in: never Magno's reads, Watch or Expected, targets, practices,
// calculated ratios, file names or lab reference ids.

import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { FileDown, Share2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { SECTION_ORDER, type LabSection } from '../../lib/markers'
import { earlierTests, drawPhase, keyMarkerMatrix, prevText, printedValue, type LabTest, type TestMarker } from '../../lib/labTests'
import { fmtRange } from '../../lib/labRules'
import { dayOf, fmtDay } from '../../lib/dates'
import { dedupeInjections } from '../../lib/injections'
import { unitLabel } from '../../lib/dose'
import type { DoseTiming } from '../../lib/protocolAtDraw'
import { PanelCard } from '../../components/dashboard/PanelCard'
import { Segmented } from '@/components/ui/segmented'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { phaseLabel, plural } from './feed'

type Go = (hash: string, replace?: boolean) => void
type Earlier = 'none' | '3' | '5'
type Patient = { name?: string; dob?: string }

/** Report dates read the clinical way: 28 Jun 2026. */
const day = (iso: string) => {
  const d = dayOf(iso)
  return d ? format(parseISO(d), 'd MMM yyyy') : ''
}
const flagOf = (m: Pick<TestMarker, 'labFlag'>) => (m.labFlag === 'high' ? 'H' : m.labFlag === 'low' ? 'L' : '')

// The report's clinical section names.
const CLINICAL: Record<LabSection, string> = {
  Hormones: 'Hormones',
  Prostate: 'PSA',
  'Full blood count': 'Full blood count (FBC)',
  Lipids: 'Lipid profile',
  Liver: 'Liver function (LFT)',
  Kidney: 'Urea & electrolytes (U&E)',
  'Blood sugar': 'Glucose & HbA1c',
  Thyroid: 'Thyroid function (TFT)',
  'Iron & vitamins': 'Iron studies & vitamins',
  Inflammation: 'Inflammation',
  'Other hormones': 'Adrenal & growth',
  Other: 'Other',
}

// R10 folds import times, legacy import stamps and file-name mismatches into this one string.
const unconfirmed = (t: LabTest) => t.needsCheck.includes('Draw date not confirmed')
const DAGGER_NOTE = '† Draw date not confirmed; it may be the day the report was added.'
/** The lab's previous value with its < or >, and its date; † when that date is not confirmed. */
const previousText = (m: TestMarker, unsure: Set<number>) =>
  (m.prev ? `${prevText(m.prev)} (${day(m.prev.date)}${unsure.has(m.prev.examId) ? ' †' : ''})` : '')
/** The R6 change alone, without the date and guard the app shows. */
const changeText = (m: TestMarker) => {
  if (!m.change) return ''
  const amount = m.change.text.split(' vs ')[0]
  return amount === '≈ same' ? 'same' : amount
}

const sinceDose = (d: DoseTiming) => {
  if (d.phase === 'same-day') return 'Same day'
  if (d.daysBefore < 1) return plural(Math.max(1, Math.round(d.daysBefore * 24)), 'hour')
  return plural(d.daysBefore, 'day')
}

/** Column heads for page 2: "28 Jun 2026 · Medichecks · trough". No phase for an unconfirmed date: it was worked out for that date. */
const columnHead = (t: LabTest) =>
  [day(t.date) + (unconfirmed(t) ? ' †' : ''), t.provider, unconfirmed(t) ? undefined : t.baseline ? 'before protocol' : phaseLabel(drawPhase(t))?.toLowerCase()].filter(Boolean).join(' · ')

/** Who and which test, so a loose page still belongs to someone. */
const idLine = (t: LabTest, patient: Patient) =>
  [patient.name, patient.dob && `born ${day(patient.dob)}`, `test of ${day(t.date)}`].filter(Boolean).join(' · ')
const footerLine = (t: LabTest, patient: Patient) => `${idLine(t, patient)} · Magno · magno.fit · Self-reported by the patient. Not a diagnosis.`

/** The draw instant, or the end of the draw day when no time was logged. */
function drawEnd(t: LabTest): Date {
  const d = dayOf(t.date)
  const time = t.exam.meta?.drawTime && /^\d{1,2}:\d{2}$/.test(t.exam.meta.drawTime) ? t.exam.meta.drawTime.padStart(5, '0') : '23:59'
  return new Date(`${d}T${time}`)
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
const csvRow = (cells: string[]) => cells.map(csvCell).join(',')

function buildCsv(t: LabTest, patient: Patient, compared: boolean, cols: LabTest[], tests: LabTest[]): string {
  const unsure = new Set(tests.filter(unconfirmed).map((x) => x.id))
  const lines: string[] = [csvRow(['Blood test report'])]
  if (patient.name || patient.dob) lines.push(csvRow(['Patient', patient.name ?? '', patient.dob ? `Born ${day(patient.dob)}` : '']))
  lines.push(csvRow(['Test', t.title, day(t.date), t.provider ?? '']), '')
  lines.push(csvRow(['Section', 'Marker', 'Result', 'Unit', 'Range', 'Flag', ...(compared ? ['Previous', 'Change'] : [])]))
  for (const s of SECTION_ORDER) {
    for (const m of t.markers.filter((x) => x.section === s)) {
      lines.push(csvRow([CLINICAL[s], m.printedName, printedValue(m), m.unit, fmtRange(m.low, m.high), flagOf(m), ...(compared ? [previousText(m, unsure), changeText(m)] : [])]))
    }
  }
  if (compared && cols.length > 1) {
    const mx = keyMarkerMatrix(cols)
    lines.push('', csvRow(['Key markers across tests']), csvRow(['Marker', 'Unit', ...cols.map(columnHead)]))
    for (const r of mx.rows) lines.push(csvRow([r.label, r.unit, ...r.cells.map((c) => (c ? `${c.text}${c.converted ? '*' : ''}${flagOf(c) ? ` ${flagOf(c)}` : ''}` : ''))]))
    if (mx.conversions.length) lines.push(csvRow([`* Converted: ${mx.conversions.join('; ')}`]))
  }
  const dagger = compared && ((cols.length > 1 && cols.some(unconfirmed)) || t.markers.some((m) => m.prev && unsure.has(m.prev.examId)))
  if (dagger) lines.push('', csvRow([DAGGER_NOTE]))
  lines.push('', csvRow([footerLine(t, patient)]))
  return lines.join('\n') + '\n'
}

async function shareCsv(csv: string, name: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }) // BOM for Excel
  const file = new File([blob], name, { type: 'text/csv' })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

// ── The printed document ───────────────────────────────────────────────────

function Footer({ line }: { line: string }) {
  return <p className="dr-footer">{line}</p>
}

function Flag({ m }: { m: Pick<TestMarker, 'labFlag'> }) {
  const f = flagOf(m)
  return f ? <b className="dr-flag">{f}</b> : null
}

function Paper({ t, tests, patient, compared, cols, doses }: {
  t: LabTest
  tests: LabTest[]
  patient: Patient
  compared: boolean
  cols: LabTest[]
  doses?: Array<{ at: string; compound: string; dose: string; route: string; site: string }>
}) {
  const meta = t.exam.meta
  const outside = t.markers.filter((m) => m.labFlag === 'high' || m.labFlag === 'low')
  const sections = SECTION_ORDER.map((s) => ({ s, ms: t.markers.filter((m) => m.section === s) })).filter((x) => x.ms.length > 0)
  const matrix = compared && cols.length > 1 ? keyMarkerMatrix(cols) : undefined
  const dateNote = unconfirmed(t) ? 'Draw date not confirmed; it may be the day the report was added'
    : t.dateSource === 'report' ? undefined
      : t.dateSource === 'report-date' ? 'Report date as printed; the draw may be a day earlier'
        : t.dateSource === 'filename' ? 'Date taken from the file name'
          : 'Draw date as recorded by the patient'
  const unsure = new Set(tests.filter(unconfirmed).map((x) => x.id))
  const prevDagger = compared && t.markers.some((m) => m.prev && unsure.has(m.prev.examId))
  const line = footerLine(t, patient)

  return (
    <article className="doctor-report" aria-label="Doctor report preview">
      <section className="dr-page">
        <header className="dr-head">
          <h1>Blood test report</h1>
          {(patient.name || patient.dob) && (
            <p className="dr-patient">{[patient.name, patient.dob ? `Born ${day(patient.dob)}` : undefined].filter(Boolean).join(' · ')}</p>
          )}
          <p className="dr-muted">
            Prepared {format(new Date(), 'd MMM yyyy')} with Magno from the patient's lab reports. Values, units and ranges as printed by the lab.
          </p>
        </header>

        <h2>This test</h2>
        <table className="dr-facts">
          <tbody>
            <tr><th>Test</th><td>{t.title}</td></tr>
            <tr><th>Lab</th><td>{t.provider ?? 'Not recorded'}</td></tr>
            <tr>
              <th>Drawn</th>
              <td>
                {day(t.date)}{meta?.drawTime ? `, ${meta.drawTime}` : ', time not recorded'}
                {dateNote && <span className="dr-muted"> · {dateNote}</span>}
              </td>
            </tr>
            <tr><th>Fasted</th><td>{meta?.fasted === true ? 'Yes' : meta?.fasted === false ? 'No' : 'Not recorded'}</td></tr>
            <tr><th>Conditions</th><td>{meta?.conditions?.length ? meta.conditions.join(', ') : 'None recorded'}</td></tr>
          </tbody>
        </table>

        <h2>Protocol at the time of the draw <span className="dr-muted">(logged by the patient)</span></h2>
        {t.timing.length === 0 ? (
          <p>{t.baseline ? "Drawn before the patient's first logged dose." : 'No doses logged in the 6 weeks before this test.'}</p>
        ) : (
          <div className="dr-scroll">
            <table className="dr-table">
              <thead>
                <tr><th>Compound</th><th>Dose and frequency</th><th>Per week</th><th>Route</th><th>Since</th><th>Last dose before draw</th><th>Timing</th></tr>
              </thead>
              <tbody>
                {t.timing.map((d) => {
                  const unit = unitLabel(d.unit)
                  return (
                    <tr key={d.group}>
                      <td>{d.name}</td>
                      <td>{[d.dose !== undefined ? `${d.dose} ${unit}` : undefined, d.everyDays ? `every ${d.everyDays} days` : undefined].filter(Boolean).join(' ')}</td>
                      <td>{d.weekly !== undefined ? `${d.weekly} ${unit}` : ''}</td>
                      <td>{d.route ?? ''}</td>
                      <td>{day(d.since)}</td>
                      <td>{sinceDose(d)}</td>
                      <td>{d.phase === 'same-day' ? 'Same day, time not recorded' : phaseLabel(d.phase) ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!meta?.drawTime && t.timing.some((d) => d.phase !== 'same-day') && (
          <p className="dr-muted">Draw time not recorded. Last dose and timing assume a 9 am draw.</p>
        )}

        <h2>Results outside the lab range</h2>
        {outside.length === 0 ? (
          <p>None. Every result with a printed range is inside it.</p>
        ) : (
          <div className="dr-scroll">
            <table className="dr-table">
              <thead><tr><th>Marker</th><th>Result</th><th>Range</th><th>Flag</th>{compared && <th>Previous</th>}</tr></thead>
              <tbody>
                {outside.map((m) => (
                  <tr key={m.resultId}>
                    <td>{m.printedName}</td>
                    <td className="dr-num">{printedValue(m)} {m.unit}</td>
                    <td>{fmtRange(m.low, m.high)}</td>
                    <td><Flag m={m} /></td>
                    {compared && <td>{previousText(m, unsure)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2>All results</h2>
        {sections.map(({ s, ms }) => (
          <div key={s} className="dr-section">
            <h3>{CLINICAL[s]}</h3>
            <div className="dr-scroll">
              <table className="dr-table">
                <thead>
                  <tr><th>Marker</th><th>Result</th><th>Unit</th><th>Range</th><th>Flag</th>{compared && <><th>Previous</th><th>Change</th></>}</tr>
                </thead>
                <tbody>
                  {ms.map((m) => (
                    <tr key={m.resultId}>
                      <td>{m.printedName}</td>
                      <td className="dr-num">{printedValue(m)}</td>
                      <td>{m.unit}</td>
                      <td>{fmtRange(m.low, m.high)}</td>
                      <td><Flag m={m} /></td>
                      {compared && <><td>{previousText(m, unsure)}</td><td>{changeText(m)}</td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <p className="dr-muted">Flag is the lab's H or L against its own printed range. Previous is the most recent earlier result for that marker, in this test's unit.</p>
        {prevDagger && <p className="dr-muted">{DAGGER_NOTE}</p>}
        <Footer line={line} />
      </section>

      {matrix && matrix.rows.length > 0 && (
        <section className="dr-page">
          <p className="dr-id">{idLine(t, patient)}</p>
          <h2>Key markers across tests</h2>
          <div className="dr-scroll">
            <table className="dr-table">
              <thead><tr><th>Marker</th><th>Unit</th>{cols.map((c) => <th key={c.id}>{columnHead(c)}</th>)}</tr></thead>
              <tbody>
                {matrix.rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    <td>{r.unit}</td>
                    {r.cells.map((c, i) => (
                      <td key={i} className="dr-num">
                        {c && <>{c.text}{c.converted && '*'}{flagOf(c) && <> <Flag m={c} /></>}</>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dr-muted">Newest on the left. H and L are each test's own lab flags.</p>
          {matrix.conversions.length > 0 && (
            <p className="dr-muted">* Converted to the unit in the Unit column: {matrix.conversions.join('; ')}.</p>
          )}
          {cols.some(unconfirmed) && <p className="dr-muted">{DAGGER_NOTE}</p>}
          <Footer line={line} />
        </section>
      )}

      {doses && (
        <section className="dr-page">
          <p className="dr-id">{idLine(t, patient)}</p>
          <h2>Dose log, 6 weeks before the draw <span className="dr-muted">(logged by the patient)</span></h2>
          {doses.length === 0 ? <p>No doses logged in the 6 weeks before this test.</p> : (
            <div className="dr-scroll">
              <table className="dr-table">
                <thead><tr><th>Date and time</th><th>Compound</th><th>Dose</th><th>Route</th><th>Site</th></tr></thead>
                <tbody>
                  {doses.map((d, i) => (
                    <tr key={i}><td>{d.at}</td><td>{d.compound}</td><td>{d.dose}</td><td>{d.route}</td><td>{d.site}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Footer line={line} />
        </section>
      )}
    </article>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────

const PATIENT_KEY = 'report.patient'

export function DoctorReport({ tests, examId, go }: { tests: LabTest[]; examId: number; go: Go }) {
  const t = tests.find((x) => x.id === examId)
  const [earlier, setEarlier] = useState<Earlier>('3')
  const [withDoses, setWithDoses] = useState(false)
  // Name and date of birth live in db.meta, which never syncs: on this device only.
  const saved = useLiveQuery(async () => {
    const row = await db.meta.get(PATIENT_KEY)
    try { return (row ? JSON.parse(row.value) : {}) as Patient } catch { return {} as Patient }
  }, [])
  const [draft, setDraft] = useState<Patient>()
  const patient = draft ?? saved ?? {}

  const doses = useLiveQuery(async () => {
    if (!withDoses || !t) return undefined
    const end = drawEnd(t)
    // An impossible stored date: no window to query, and toISOString would throw.
    if (Number.isNaN(end.getTime())) return []
    const start = new Date(end.getTime() - 42 * 86_400_000)
    start.setHours(0, 0, 0, 0)
    // Straight from Dexie: no cap, and archived compounds keep their names.
    const [shots, compounds] = await Promise.all([
      db.injections.where('takenAt').between(start.toISOString(), end.toISOString(), true, true).filter((i) => !i.deletedAtSync && !i.archivedAt).toArray(),
      db.compounds.toArray(),
    ])
    const names = new Map(compounds.map((c) => [c.id, c.name]))
    return dedupeInjections(shots)
      .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
      .map((i) => ({
        at: format(parseISO(i.takenAt), 'd MMM yyyy, HH:mm'),
        compound: names.get(i.compoundId) ?? 'Unknown compound',
        dose: i.rawDose ?? (i.dose !== undefined ? `${i.dose} ${unitLabel(i.unit)}` : ''),
        route: i.route ?? '',
        site: i.site ?? '',
      }))
  }, [withDoses, t?.id, t?.date, t?.exam.meta?.drawTime])

  // Chrome prints this line in every page's margin (print.css @page); WebKit ignores it.
  const running = t ? footerLine(t, patient) : ''
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--dr-id', `"${running.replace(/["\\]/g, '\\$&')}"`)
    return () => { root.removeProperty('--dr-id') }
  }, [running])

  // The PDF's file name is the document title while this screen is open.
  const fileBase = t && dayOf(t.date) ? `magno-bloods-${dayOf(t.date)}` : 'magno-bloods'
  useEffect(() => {
    const was = document.title
    document.title = fileBase
    document.documentElement.classList.add('bloods-report-page')
    return () => {
      document.title = was
      document.documentElement.classList.remove('bloods-report-page')
    }
  }, [fileBase])

  if (!t) return <PanelCard><p className="feed-note text-muted-foreground">This test is not on file. It may have been archived.</p></PanelCard>

  const compared = earlier !== 'none'
  const cols = [t, ...earlierTests(tests, t).slice(0, compared ? Number(earlier) : 0)]

  const savePatient = (next: Patient) => {
    setDraft(next)
    const clean = { name: next.name?.trim() || undefined, dob: next.dob || undefined }
    void (clean.name || clean.dob ? db.meta.put({ key: PATIENT_KEY, value: JSON.stringify(clean) }) : db.meta.delete(PATIENT_KEY))
  }

  return (
    <div className="flex flex-col gap-4">
      <PanelCard className="p-4 print:hidden sm:p-6">
        <p className="eyebrow">For your doctor</p>
        <h2 className="mt-1.5 font-display text-xl font-semibold leading-tight">Doctor report</h2>
        <p className="feed-note mt-1 text-muted-foreground">
          One test as the lab printed it, with your earlier results beside it and what you were taking. Magno's reads stay out.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Test</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={t.id}
              onChange={(e) => go(`#report/${e.target.value}`, true)}
            >
              {tests.map((o) => <option key={o.id} value={o.id}>{[fmtDay(o.date), o.provider, plural(o.counts.total, 'marker')].filter(Boolean).join(' · ')}</option>)}
            </select>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="eyebrow" id="dr-earlier">Earlier tests to include</span>
            <Segmented
              value={earlier}
              onChange={setEarlier}
              ariaLabel="Earlier tests to include"
              className="w-full [&>button]:min-h-10"
              options={[{ value: 'none', label: 'None' }, { value: '3', label: '3' }, { value: '5', label: '5' }]}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dr-name" className="text-xs">Your name <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="dr-name" className="h-10" autoComplete="name" value={patient.name ?? ''} onChange={(e) => savePatient({ ...patient, name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dr-dob" className="text-xs">Date of birth <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="dr-dob" type="date" className="h-10" value={patient.dob ?? ''} onChange={(e) => savePatient({ ...patient, dob: e.target.value })} />
            </div>
          </div>
          <p className="feed-facts -mt-2 text-muted-foreground">Name and date of birth stay on this device. They are never synced.</p>

          <label className="flex min-h-10 cursor-pointer items-center gap-3">
            <input type="checkbox" className="size-5 shrink-0 accent-foreground" checked={withDoses} onChange={(e) => setWithDoses(e.target.checked)} />
            <span className="text-sm">Dose log from the 6 weeks before the draw</span>
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button className="h-10" onClick={() => window.print()}>
              <FileDown className="size-4" /> Save as PDF
            </Button>
            <Button variant="outline" className="h-10" onClick={() => void shareCsv(buildCsv(t, patient, compared, cols, tests), `${fileBase}.csv`)}>
              <Share2 className="size-4" /> Share as CSV
            </Button>
          </div>
        </div>
      </PanelCard>

      <p className="eyebrow px-1 print:hidden">Preview</p>
      <Paper t={t} tests={tests} patient={patient} compared={compared} cols={cols} doses={withDoses ? doses ?? [] : undefined} />
    </div>
  )
}
