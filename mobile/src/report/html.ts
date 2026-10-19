// The doctor export as printable HTML (A4, light, clinical), for expo-print. A port of the web's DoctorReport
// (src/views/bloods/DoctorReport.tsx) and ExportSheet (src/components/ExportSheet.tsx). Only what the patient logged
// and what the lab printed goes in: no reads, no targets, no dose maths, no estimated levels (docs/decisions.md).
// The web's "protocol at the time of the draw" table (per-week dose, trough/peak timing) is dose <-> draw maths, so the
// iOS report shows the dose log from the 6 weeks before the draw, as typed, in its place.
import { format, parseISO } from 'date-fns'
import type { Symptom } from '@shared/lib/db'
import { dayOf } from '@shared/lib/dates'
import { fmtRange } from '@shared/lib/labRules'
import { keyMarkerMatrix, prevText, printedValue, type LabTest, type TestMarker } from '@shared/lib/labTests'
import { SECTION_ORDER, type LabSection } from '@shared/lib/markers'
import { ALL_SYMPTOMS, customDefs, ratingOf } from '@shared/lib/symptoms'

export type DoseRow = { at: string; compound: string; dose: string; route: string; site: string; notes?: string }
/** A weight in the unit the person reads (`unit`: kg or lb). */
export type WeightRow = { at: string; value: number; unit: string; notes?: string }
export type BpRow = { at: string; sys: number; dia: number; pulse?: number; notes?: string }
export type LogReport = {
  from: Date
  to: Date
  name?: string
  injections?: DoseRow[]
  weight?: WeightRow[]
  bp?: BpRow[]
  checkins?: Symptom[]
  bloods?: LabTest[]
}

// ── Small helpers ──────────────────────────────────────────────────────────

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** 28 Jun 2026, for a lab day or a timestamp. */
export const day = (iso: string) => {
  const d = dayOf(iso)
  return d ? format(parseISO(d), 'd MMM yyyy') : ''
}
export const dayTime = (iso: string) => {
  const d = parseISO(iso)
  return Number.isNaN(d.getTime()) ? '' : format(d, 'd MMM yyyy, HH:mm')
}
const flagOf = (m: { labFlag: string }) => (m.labFlag === 'high' ? 'H' : m.labFlag === 'low' ? 'L' : '')
const flagCell = (m: { labFlag: string }) => (flagOf(m) ? `<b class="flag">${flagOf(m)}</b>` : '')
const table = (head: string[], rows: string[][], numCols: number[] = []) =>
  `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td${numCols.includes(i) ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`

// The report's clinical section names, as the web report.
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

const unconfirmed = (t: LabTest) => t.needsCheck.includes('Draw date not confirmed')
const DAGGER_NOTE = '† Draw date not confirmed; it may be the day the report was added.'
const previousText = (m: TestMarker, unsure: Set<number>) =>
  m.prev ? `${prevText(m.prev)} (${day(m.prev.date)}${unsure.has(m.prev.examId) ? ' †' : ''})` : ''
const changeText = (m: TestMarker) => {
  if (!m.change) return ''
  const amount = m.change.text.split(' vs ')[0]
  return amount === '≈ same' ? 'same' : amount
}
const columnHead = (t: LabTest) =>
  [day(t.date) + (unconfirmed(t) ? ' †' : ''), t.provider, t.baseline ? 'before first logged dose' : undefined].filter(Boolean).join(' · ')

const CSS = `
  @page { size: A4; margin: 14mm 12mm; }
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { background: #fff; color: #111; margin: 0; }
  body { font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif; font-size: 9.5pt; line-height: 1.45; }
  .mark { font-weight: 800; letter-spacing: 0.18em; font-size: 9pt; text-transform: uppercase; color: #111; margin: 0 0 8pt; }
  h1 { margin: 0; font-size: 17pt; font-weight: 700; letter-spacing: -0.01em; }
  h2 { margin: 16pt 0 5pt; font-size: 11pt; font-weight: 700; border-bottom: 1.5px solid #111; padding-bottom: 2pt; break-after: avoid; }
  h3 { margin: 10pt 0 3pt; font-size: 10pt; font-weight: 700; break-after: avoid; }
  p { margin: 3pt 0; }
  .head { border-bottom: 2px solid #111; padding-bottom: 8pt; }
  .patient { font-size: 11pt; font-weight: 600; margin-top: 4pt; }
  .muted { color: #555; font-weight: 400; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { text-align: left; font-weight: 600; font-size: 8.5pt; color: #555; padding: 3pt 5pt; border-bottom: 1px solid #111; vertical-align: bottom; }
  td { padding: 3pt 5pt; border-bottom: 1px solid #d4d4d4; vertical-align: top; }
  tr { break-inside: avoid; }
  .facts th { color: #111; width: 80pt; border: 0; padding: 2pt 8pt 2pt 0; font-size: 9pt; vertical-align: top; }
  .facts td { border: 0; padding: 2pt 0; }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .flag { color: #b91c1c; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .section { break-inside: avoid; }
  .page + .page { break-before: page; }
  .id { margin: 0 0 6pt; color: #555; }
  .footer { margin-top: 14pt; padding-top: 5pt; border-top: 1px solid #d4d4d4; color: #555; font-size: 8pt; }
  svg { display: block; width: 100%; height: auto; margin: 4pt 0 6pt; }
  .legend span { display: inline-block; margin-right: 12pt; }
  .legend i { display: inline-block; width: 10pt; height: 2pt; vertical-align: middle; margin-right: 4pt; }
`

const doc = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light">
<title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`

const header = (title: string, name: string | undefined, lines: string[]) => `
  <header class="head">
    <p class="mark">Magno</p>
    <h1>${esc(title)}</h1>
    ${name?.trim() ? `<p class="patient">${esc(name.trim())}</p>` : ''}
    ${lines.map((l) => `<p class="muted">${esc(l)}</p>`).join('')}
  </header>`

const footer = (line: string) => `<p class="footer">${esc(line)}</p>`

// ── One blood test ─────────────────────────────────────────────────────────

/** One test as the lab printed it, with up to 3 earlier tests beside it and the doses logged in the 6 weeks before. */
export function testReportHtml(test: LabTest, tests: LabTest[], opts: { name?: string; doses?: DoseRow[] } = {}): string {
  const t = test
  const meta = t.exam.meta
  const unsure = new Set(tests.filter(unconfirmed).map((x) => x.id))
  const outside = t.markers.filter((m) => m.labFlag === 'high' || m.labFlag === 'low')
  const sections = SECTION_ORDER.map((s) => ({ s, ms: t.markers.filter((m) => m.section === s) })).filter((x) => x.ms.length)
  const d = dayOf(t.date)
  const cols = [t, ...(d ? tests.filter((o) => { const od = dayOf(o.date); return od !== '' && od < d }) : []).slice(0, 3)]
  const matrix = cols.length > 1 ? keyMarkerMatrix(cols) : undefined
  const dateNote = unconfirmed(t) ? 'Draw date not confirmed; it may be the day the report was added'
    : t.dateSource === 'report' ? undefined
      : t.dateSource === 'report-date' ? 'Report date as printed; the draw may be a day earlier'
        : t.dateSource === 'filename' ? 'Date taken from the file name'
          : 'Draw date as recorded by the patient'
  const prevDagger = t.markers.some((m) => m.prev && unsure.has(m.prev.examId))
  const idLine = [opts.name?.trim(), `test of ${day(t.date)}`].filter(Boolean).join(' · ')
  const foot = footer(`${idLine} · Magno · magno.fit · Self-reported by the patient. Not a diagnosis.`)

  const page1 = `
  <section class="page">
    ${header('Blood test report', opts.name, [
      `Prepared ${format(new Date(), 'd MMM yyyy')} with Magno from the patient's lab reports. Values, units and ranges as printed by the lab.`,
    ])}
    <h2>This test</h2>
    <table class="facts"><tbody>
      <tr><th>Test</th><td>${esc(t.title)}</td></tr>
      <tr><th>Lab</th><td>${esc(t.provider ?? 'Not recorded')}</td></tr>
      <tr><th>Drawn</th><td>${esc(day(t.date))}${esc(meta?.drawTime ? `, ${meta.drawTime}` : ', time not recorded')}${dateNote ? ` <span class="muted">· ${esc(dateNote)}</span>` : ''}</td></tr>
      <tr><th>Fasted</th><td>${meta?.fasted === true ? 'Yes' : meta?.fasted === false ? 'No' : 'Not recorded'}</td></tr>
      <tr><th>Conditions</th><td>${esc(meta?.conditions?.length ? meta.conditions.join(', ') : 'None recorded')}</td></tr>
      ${t.exam.notes?.trim() ? `<tr><th>Notes</th><td>${esc(t.exam.notes.trim())}</td></tr>` : ''}
    </tbody></table>

    <h2>Results outside the lab range</h2>
    ${outside.length === 0
      ? '<p>None. Every result with a printed range is inside it.</p>'
      : table(['Marker', 'Result', 'Range', 'Flag', 'Previous'], outside.map((m) => [
        esc(m.printedName), `${esc(printedValue(m))} ${esc(m.unit)}`, esc(fmtRange(m.low, m.high)), flagCell(m), esc(previousText(m, unsure)),
      ]), [1])}

    <h2>All results</h2>
    ${sections.map(({ s, ms }) => `<div class="section"><h3>${esc(CLINICAL[s])}</h3>${table(
      ['Marker', 'Result', 'Unit', 'Range', 'Flag', 'Previous', 'Change'],
      ms.map((m) => [esc(m.printedName), esc(printedValue(m)), esc(m.unit), esc(fmtRange(m.low, m.high)), flagCell(m), esc(previousText(m, unsure)), esc(changeText(m))]),
      [1],
    )}</div>`).join('')}
    <p class="muted">Flag is the lab's H or L against its own printed range. Previous is the most recent earlier result for that marker, in this test's unit.</p>
    ${prevDagger ? `<p class="muted">${esc(DAGGER_NOTE)}</p>` : ''}
    ${foot}
  </section>`

  const page2 = matrix && matrix.rows.length ? `
  <section class="page">
    <p class="id">${esc(idLine)}</p>
    <h2>Key markers across tests</h2>
    ${table(['Marker', 'Unit', ...cols.map(columnHead)], matrix.rows.map((r) => [
      esc(r.label), esc(r.unit), ...r.cells.map((c) => (c ? `${esc(c.text)}${c.converted ? '*' : ''}${flagOf(c) ? ` ${flagCell(c)}` : ''}` : '')),
    ]), cols.map((_, i) => i + 2))}
    <p class="muted">Newest on the left. H and L are each test's own lab flags.</p>
    ${matrix.conversions.length ? `<p class="muted">* Converted to the unit in the Unit column: ${esc(matrix.conversions.join('; '))}.</p>` : ''}
    ${cols.some(unconfirmed) ? `<p class="muted">${esc(DAGGER_NOTE)}</p>` : ''}
    ${foot}
  </section>` : ''

  const page3 = opts.doses ? `
  <section class="page">
    <p class="id">${esc(idLine)}</p>
    <h2>Dose log, 6 weeks before the draw <span class="muted">(logged by the patient)</span></h2>
    ${opts.doses.length === 0
      ? `<p>${t.baseline ? "Drawn before the patient's first logged dose." : 'No doses logged in the 6 weeks before this test.'}</p>`
      : table(['Date and time', 'Compound', 'Dose', 'Route', 'Site'], opts.doses.map((r) => [esc(dayTime(r.at)), esc(r.compound), esc(r.dose), esc(r.route), esc(r.site)]))}
    <p class="muted">Doses as the patient typed them.</p>
    ${foot}
  </section>` : ''

  return doc(d ? `magno-bloods-${d}` : 'magno-bloods', page1 + page2 + page3)
}

// ── The log, for a range ───────────────────────────────────────────────────

/** A plain line chart: one or more series over time, the y range from the data. */
function lineChart(series: Array<{ label: string; color: string; points: Array<{ t: number; v: number }> }>, unit: string): string {
  const all = series.flatMap((s) => s.points)
  if (all.length < 2) return ''
  const W = 680, H = 170, L = 44, R = 10, T = 10, B = 24
  const t0 = Math.min(...all.map((p) => p.t)), t1 = Math.max(...all.map((p) => p.t))
  let v0 = Math.min(...all.map((p) => p.v)), v1 = Math.max(...all.map((p) => p.v))
  const pad = (v1 - v0) * 0.1 || 1
  v0 -= pad
  v1 += pad
  const x = (t: number) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R)
  const y = (v: number) => T + (1 - (v - v0) / (v1 - v0)) * (H - T - B)
  const n = (v: number) => String(Number(v.toPrecision(4)))
  const grid = [v0 + pad, (v0 + v1) / 2, v1 - pad].map((v) =>
    `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e5e5"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end" font-size="9" fill="#555">${esc(n(v))}</text>`).join('')
  const lines = series.map((s) => {
    const pts = [...s.points].sort((a, b) => a.t - b.t)
    const dots = pts.length <= 40 ? pts.map((p) => `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="2" fill="${s.color}"/>`).join('') : ''
    return `<polyline fill="none" stroke="${s.color}" stroke-width="1.5" points="${pts.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')}"/>${dots}`
  }).join('')
  const dates = `<text x="${L}" y="${H - 6}" font-size="9" fill="#555">${esc(format(t0, 'd MMM yyyy'))}</text><text x="${W - R}" y="${H - 6}" font-size="9" fill="#555" text-anchor="end">${esc(format(t1, 'd MMM yyyy'))}</text>`
  const legend = series.length > 1 ? `<p class="legend muted">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')} ${esc(unit)}</p>` : `<p class="muted">${esc(unit)}</p>`
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, Helvetica, Arial, sans-serif">${grid}${lines}${dates}</svg>${legend}`
}

const ms = (iso: string) => Date.parse(iso)
const empty = '<p class="muted">Nothing logged in this range.</p>'

/** The log for a chosen range: doses as typed, weight, blood pressure, check-ins and blood tests, each as logged. */
export function logReportHtml(r: LogReport): string {
  const all = r.from.getTime() <= 0
  const period = all ? `All records up to ${format(r.to, 'd MMM yyyy')}` : `${format(r.from, 'd MMM yyyy')} to ${format(r.to, 'd MMM yyyy')}`
  const parts: string[] = []

  if (r.injections) {
    parts.push(`<h2>Injections <span class="muted">(${r.injections.length}, logged by the patient)</span></h2>${r.injections.length
      ? table(['Date and time', 'Compound', 'Dose', 'Route', 'Site', 'Notes'], r.injections.map((i) => [esc(dayTime(i.at)), esc(i.compound), esc(i.dose), esc(i.route), esc(i.site), esc(i.notes)]))
      : empty}<p class="muted">Doses as the patient typed them.</p>`)
  }

  if (r.weight) {
    parts.push(`<h2>Weight <span class="muted">(${r.weight.length} entries)</span></h2>${r.weight.length
      ? lineChart([{ label: 'Weight', color: '#111', points: r.weight.map((w) => ({ t: ms(w.at), v: w.value })) }], r.weight[0].unit) +
        table(['Date and time', `Weight (${r.weight[0].unit})`, 'Notes'], r.weight.map((w) => [esc(dayTime(w.at)), esc(w.value), esc(w.notes)]), [1])
      : empty}`)
  }

  if (r.bp) {
    parts.push(`<h2>Blood pressure <span class="muted">(${r.bp.length} readings)</span></h2>${r.bp.length
      ? lineChart([
        { label: 'Systolic', color: '#b91c1c', points: r.bp.map((b) => ({ t: ms(b.at), v: b.sys })) },
        { label: 'Diastolic', color: '#1d4ed8', points: r.bp.map((b) => ({ t: ms(b.at), v: b.dia })) },
      ], 'mmHg') +
        table(['Date and time', 'Systolic', 'Diastolic', 'Pulse', 'Notes'], r.bp.map((b) => [esc(dayTime(b.at)), esc(b.sys), esc(b.dia), esc(b.pulse ?? ''), esc(b.notes)]), [1, 2, 3])
      : empty}`)
  }

  if (r.checkins) {
    const rows = r.checkins
    const defs = [...ALL_SYMPTOMS, ...customDefs(rows)].filter((def) => rows.some((s) => ratingOf(s, def) !== undefined))
    const summary = defs.map((def) => {
      const vs = rows.map((s) => ratingOf(s, def)).filter((v): v is number => v !== undefined)
      return [esc(def.label), esc(vs.length), esc((vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(1)), esc(Math.min(...vs)), esc(Math.max(...vs)), esc(vs[0])]
    })
    parts.push(`<h2>Check-ins <span class="muted">(${rows.length}, rated 0 to 5 by the patient)</span></h2>${rows.length
      ? table(['Symptom', 'Ratings', 'Average', 'Lowest', 'Highest', 'Latest'], summary, [1, 2, 3, 4, 5]) +
        `<h3>Every check-in</h3>` +
        table(['Date', ...defs.map((d) => d.label), 'Notes'], rows.map((s) => [esc(day(s.recordedAt)), ...defs.map((d) => esc(ratingOf(s, d) ?? '')), esc(s.notes)]))
      : empty}`)
  }

  if (r.bloods) {
    const tests = r.bloods
    const cols = tests.slice(0, 6) // ponytail: newest 6 fit an A4 row; older ones are still in the list above
    const mx = cols.length ? keyMarkerMatrix(cols) : undefined
    parts.push(`<h2>Blood tests <span class="muted">(${tests.length})</span></h2>${tests.length
      ? table(['Drawn', 'Test', 'Lab', 'Results', 'Outside lab range'], tests.map((t) => [
        esc(day(t.date) + (unconfirmed(t) ? ' †' : '')), esc(t.title), esc(t.provider ?? ''), esc(t.markers.length),
        esc(t.markers.filter((m) => m.labFlag === 'high' || m.labFlag === 'low').map((m) => `${m.printedName} ${flagOf(m)}`).join(', ') || 'None'),
      ]), [3]) +
        (mx && mx.rows.length ? `<h3>Key markers over time</h3>${table(['Marker', 'Unit', ...cols.map(columnHead)], mx.rows.map((row) => [
          esc(row.label), esc(row.unit), ...row.cells.map((c) => (c ? `${esc(c.text)}${c.converted ? '*' : ''}${flagOf(c) ? ` ${flagCell(c)}` : ''}` : '')),
        ]), cols.map((_, i) => i + 2))}<p class="muted">Newest on the left. H and L are each test's own lab flags, against the lab's own range.</p>${mx.conversions.length ? `<p class="muted">* Converted to the unit in the Unit column: ${esc(mx.conversions.join('; '))}.</p>` : ''}` : '') +
        (tests.some(unconfirmed) ? `<p class="muted">${esc(DAGGER_NOTE)}</p>` : '')
      : empty}`)
  }

  const body = `<section class="page">
    ${header('Health log', r.name, [period, `Prepared ${format(new Date(), 'd MMM yyyy')} with Magno from what the patient logged. Lab values, units and ranges as printed by the lab.`])}
    ${parts.join('')}
    ${footer(`${[r.name?.trim(), period].filter(Boolean).join(' · ')} · Magno · magno.fit · Self-reported by the patient. Not a diagnosis.`)}
  </section>`
  return doc(`magno-log-${format(r.to, 'yyyy-MM-dd')}`, body)
}
