// Bloods' model: one test is one LabExam, one blood draw. Every number on a
// Bloods screen belongs to exactly one test; anything older shows only as
// labelled, dated context. Old data is interpreted here at read time and never
// rewritten. Pure (no React, siblings imported with .ts) so node can load it.

import type { Compound, ExamMeta, HealthFile, InjectionLog, LabExam, LabResult, MarkerTarget } from './db'
import { canonicalize, metaForKey, type LabSection } from './markers.ts'
import { CORE_KEYS, changeOf, expectedOnProtocol, labFlag, readMarker, retestBy, type LabFlag, type Read } from './labRules.ts'
import { homaIr, toUnit } from './labUnits.ts'
import { beforeProtocol, onProtocol, protocolAtDraw, type DoseTiming } from './protocolAtDraw.ts'
import { CALENDAR_DAY, dateFromFileName, dayOf, daysBetween, fmtDay } from './dates.ts'

export type DateSource = NonNullable<ExamMeta['dateSource']>

export type TestMarker = {
  resultId: number
  key: string
  label: string
  section: LabSection
  printedName: string
  value?: number
  rawValue: string
  unit: string
  low?: number
  high?: number
  labFlag: LabFlag
  /** Above/below the lab range in the way a protocol causes, whatever the personal target. */
  expected: boolean
  read: Read
  reason: string
  next?: string
  /** yyyy-mm-dd, for act and watch reads. */
  retestBy?: string
  /** The value is converted into this marker's unit. */
  prev?: { examId: number; date: string; value: number; unit: string; gapDays: number; sameTiming: boolean }
  change?: { text: string; meaningful: boolean; dir: 'up' | 'down' | 'same'; better?: boolean }
}

export type LabTest = {
  id: number
  exam: LabExam
  date: string
  title: string
  provider?: string
  dateSource: DateSource | 'legacy'
  needsCheck: string[]
  markers: TestMarker[]
  timing: DoseTiming[]
  onProtocol: boolean
  baseline: boolean
  counts: { total: number; act: number; watch: number; expected: number; fine: number; outOfLabRange: number }
}

// ── Names and providers ─────────────────────────────────────────────────────

const PROVIDERS: Array<[string, RegExp]> = [
  ['Medichecks', /medichecks/i],
  ['Thriva', /thriva/i],
  ['Forth', /forth\s?with\s?life|forth\s?edge/i],
  ['e-Val', /\be-?val\b/i],
  ['Bluecrest', /blue\s?crest/i],
  ['Randox', /randox/i],
  ['London Medical Laboratory', /london medical lab/i],
  // Case-sensitive, and not the "NHS No" field private labs print too.
  ['NHS', /\bNHS\b(?!\s*(?:[Nn][Oo]\b|[Nn][Uu][Mm]|#))/],
]

export function detectProvider(text: string, fileName?: string): string | undefined {
  for (const s of [fileName ?? '', text]) {
    const hit = PROVIDERS.find(([, re]) => re.test(s))
    if (hit) return hit[0]
  }
  return undefined
}

export function defaultTestName(provider?: string): string {
  return provider ? `${provider} blood test` : 'Blood test'
}

/** A name that came from a file (and may carry the patient's name), not from a person. */
export function looksLikeFileName(s: string): boolean {
  return /\d{5,}|_|labreport|results?\s+for|^sct\d|\.(pdf|jpe?g|png)$/i.test(s)
}

const stripExt = (s: string) => s.replace(/\.(pdf|jpe?g|png|webp|heic|gif|bmp|tiff?)$/i, '')
// The old manual-entry default, not a name anyone chose; "panel" is gone from Bloods.
const LEGACY_DEFAULT = /^(blood|lab) panel$/i

/** The name a person gave the test, or "{Provider} blood test". Never a file name. */
export function testTitle(exam: Pick<LabExam, 'name'> & Partial<LabExam>, file?: HealthFile): string {
  const name = exam.name?.trim() ?? ''
  // Before meta existed, every PDF or photo import (including /read) was named after its file.
  const legacyImport = !exam.meta && /^(PDF|Photo) import$/.test(exam.labName ?? '')
  const fromFile = legacyImport || (!!file && (name === file.name || name === stripExt(file.name)))
  if (name && !looksLikeFileName(name) && !fromFile && !LEGACY_DEFAULT.test(name)) return name
  return defaultTestName(exam.company || detectProvider(`${name} ${file?.extractedText ?? ''}`, file?.name))
}

// ── Keys ───────────────────────────────────────────────────────────────────

/**
 * The Bloods key for a stored row. `row` carries its range and value for the
 * CRP rule; `examHasTcUnit` says the same test also has a total cholesterol
 * in a real unit (see tcUnitExams).
 */
export function canonicalKey(
  marker: string,
  unit?: string,
  row?: { high?: number; value?: number },
  examHasTcUnit = false,
): { key: string; label: string; section: LabSection } {
  const canon = canonicalize(marker)
  // Older imports folded "Total Cholesterol:HDL Ratio" onto total cholesterol.
  // The fold shows as a second, unitless (or "ratio") TC row next to a real one
  // in the same test; a lone unitless TC is still cholesterol.
  if (canon?.key === 'total_cholesterol' && (/ratio/i.test(unit ?? '') || (!unit?.trim() && examHasTcUnit))) {
    const r = metaForKey('tc_hdl_ratio')!
    return { key: r.key, label: r.label, section: r.section }
  }
  // A percentage printed under a non-percent marker ("HDL % of total cholesterol",
  // which the parser files as Total Cholesterol) is a different quantity.
  if (canon && unit?.trim() === '%' && canon.unit !== '%') {
    return { key: `${canon.key}_pct`, label: `${canon.label} (%)`, section: 'Other' }
  }
  // Before the CRP split every CRP was saved under the one label "hs-CRP", so
  // that exact string is ambiguous. A plain-CRP range (under 5 or wider) or a
  // value only plain CRP reaches means the lab ran plain CRP.
  // ponytail: range heuristic; UK labs that print hs-CRP as "<5" land on crp (read on the lab range). Use the source file's text if that matters.
  if (canon?.key === 'hs_crp' && marker.trim() === 'hs-CRP' &&
      ((row?.high !== undefined && row.high >= 5) || (row?.high === undefined && (row?.value ?? 0) >= 10))) {
    const c = metaForKey('crp')!
    return { key: c.key, label: c.label, section: c.section }
  }
  if (canon) return { key: canon.key, label: canon.label, section: canon.section }
  return { key: marker.toLowerCase().trim(), label: marker.trim(), section: 'Other' }
}

/** Tests that hold a total cholesterol in a real unit, so a unitless TC beside it is a folded ratio. */
export function tcUnitExams(results: Array<Pick<LabResult, 'examId' | 'marker' | 'unit' | 'archivedAt' | 'deletedAtSync'>>): Set<number> {
  const out = new Set<number>()
  for (const r of results) {
    if (live(r) && canonicalize(r.marker)?.key === 'total_cholesterol' && toUnit('total_cholesterol', 1, r.unit, 'mmol/L') !== undefined) out.add(r.examId)
  }
  return out
}

// ── Building tests ─────────────────────────────────────────────────────────

const live = (r: { archivedAt?: number; deletedAtSync?: number }) => !r.archivedAt && !r.deletedAtSync
const TIMING_KEYS = new Set(['hematocrit', 'hemoglobin'])
// Moving away from these lines is better even inside the lab range.
const UP_IS_WORSE = new Set(['hematocrit', 'hemoglobin', 'psa', 'hba1c', 'alt', 'ast'])

// The draw instant: the logged draw time, else 9 am on the draw day.
function drawInstant(exam: LabExam): { at: Date; timeKnown: boolean } {
  const day = dayOf(exam.collectedAt)
  const time = exam.meta?.drawTime && /^\d{1,2}:\d{2}$/.test(exam.meta.drawTime) ? exam.meta.drawTime : undefined
  const [y, m, d] = day.split('-').map(Number)
  const [hh, mm] = (time ?? '09:00').split(':').map(Number)
  return { at: new Date(y, m - 1, d, hh, mm), timeKnown: !!time }
}

// Trough and missed read low; near peak reads high. Mid-interval, and a dose
// on the draw day with no draw time (the draw may have come before the shot),
// are unknown and never count as a different timing.
function timingBucket(t: LabTest | undefined): 'low' | 'high' | undefined {
  const p = t?.timing.find((d) => d.androgen)?.phase
  return p === 'trough' || p === 'missed' ? 'low' : p === 'near-peak' ? 'high' : undefined
}

function needsCheckOf(exam: LabExam, file: HealthFile | undefined, sameDay: LabTest | undefined, title: (t: LabTest) => string): string[] {
  const out: string[] = []
  const src = exam.meta?.dateSource
  const importStamp = !exam.meta && !CALENDAR_DAY.test(exam.collectedAt)
  // Only legacy tests: every dateSource names where its date came from.
  const nameDates = src ? [] : [exam.name, file?.name].map((n) => (n ? dateFromFileName(n) : undefined))
  const nameOff = nameDates.some((d) => d && Math.abs(daysBetween(d, exam.collectedAt)) > 1)
  if (src === 'import-time' || importStamp || nameOff) out.push('Draw date not confirmed')
  if (sameDay) out.push(`Same day as ${title(sameDay)}`)
  return out
}

function distanceOut(v: number, low?: number, high?: number): number {
  if (high !== undefined && v > high) return v - high
  if (low !== undefined && v < low) return low - v
  return 0
}

type Input = { exams: LabExam[]; results: LabResult[]; files: HealthFile[]; targets: MarkerTarget[]; compounds: Compound[]; injections: InjectionLog[] }

/** Every live test, newest first, each with its own markers, reads and changes. */
export function buildTests(i: Input): LabTest[] {
  const exams = i.exams.filter((e) => e.id !== undefined && live(e))
  const examIds = new Set(exams.map((e) => e.id!))
  const files = new Map(i.files.map((f) => [f.id, f]))
  const targets = new Map(i.targets.map((t) => [t.marker, t]))
  const tcUnit = tcUnitExams(i.results)

  // One row per key per test: duplicate imports stacked the same marker up to
  // four times. The row with a value wins, then the oldest.
  const byExam = new Map<number, Map<string, LabResult>>()
  for (const r of [...i.results].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
    if (!live(r) || r.id === undefined || !examIds.has(r.examId)) continue
    const key = canonicalKey(r.marker, r.unit, r, tcUnit.has(r.examId)).key
    const rows = byExam.get(r.examId) ?? new Map<string, LabResult>()
    const had = rows.get(key)
    if (!had || (had.value === undefined && r.value !== undefined)) rows.set(key, r)
    byExam.set(r.examId, rows)
  }

  // R1: newest draw first; ties go to the test with more results, then the higher id.
  exams.sort((a, b) => b.collectedAt.localeCompare(a.collectedAt) || (byExam.get(b.id!)?.size ?? 0) - (byExam.get(a.id!)?.size ?? 0) || b.id! - a.id!)

  // Pass 1: the test shells, so pass 2 can look back at earlier tests.
  const tests: LabTest[] = exams.map((exam) => {
    const file = exam.sourceFileId !== undefined ? files.get(exam.sourceFileId) : undefined
    const { at, timeKnown } = drawInstant(exam)
    // An impossible stored date ("2026-06-31"): no timing, and R10 flags it.
    const bad = Number.isNaN(at.getTime())
    return {
      id: exam.id!,
      exam,
      date: exam.collectedAt,
      title: testTitle(exam, file),
      provider: exam.company || detectProvider(`${exam.name} ${file?.extractedText ?? ''}`, file?.name),
      dateSource: exam.meta?.dateSource ?? 'legacy',
      needsCheck: [],
      markers: [],
      timing: bad ? [] : protocolAtDraw(at, timeKnown, i.compounds, i.injections),
      onProtocol: !bad && onProtocol(at, i.compounds, i.injections),
      baseline: !bad && beforeProtocol(at, i.compounds, i.injections),
      counts: { total: 0, act: 0, watch: 0, expected: 0, fine: 0, outOfLabRange: 0 },
    }
  })

  for (const t of tests) {
    const day = dayOf(t.date)
    const file = t.exam.sourceFileId !== undefined ? files.get(t.exam.sourceFileId) : undefined
    t.needsCheck = needsCheckOf(t.exam, file, day ? tests.find((o) => o !== t && dayOf(o.date) === day) : undefined, (o) => o.title)
    // Tests are newest first, so later entries are older; R4 needs a strictly earlier day.
    const earlier = day ? tests.filter((o) => { const d = dayOf(o.date); return d !== '' && d < day }) : []

    for (const [key, r] of byExam.get(t.id) ?? []) {
      const { label, section } = canonicalKey(r.marker, r.unit, r, tcUnit.has(r.examId))
      const unit = r.unit ?? ''
      let prev: TestMarker['prev']
      if (r.value !== undefined) {
        for (const o of earlier) {
          const p = byExam.get(o.id)?.get(key)
          const v = p?.value !== undefined ? toUnit(key, p.value, p.unit, unit) : undefined
          if (v === undefined) continue
          const a = timingBucket(t), b = timingBucket(o)
          const timed = section === 'Hormones' || TIMING_KEYS.has(key)
          prev = { examId: o.id, date: o.date, value: v, unit, gapDays: daysBetween(o.date, t.date), sameTiming: !(timed && a && b && a !== b) }
          break
        }
      }
      // PSA's "rise within 12 months" counts from the lowest reading in that window,
      // so stepwise rises add up.
      let low12: number | undefined
      if (r.value !== undefined) {
        for (const o of earlier) {
          if (daysBetween(o.date, t.date) > 365) break
          const p = byExam.get(o.id)?.get(key)
          const v = p?.value !== undefined ? toUnit(key, p.value, p.unit, unit) : undefined
          if (v !== undefined && (low12 === undefined || v < low12)) low12 = v
        }
      }

      const rd = readMarker(
        { key, value: r.value, unit, low: r.low, high: r.high, printed: r.status, prevWithin12mo: low12 },
        // hs-CRP was split off crp; a target saved before the split still applies.
        { onProtocol: t.onProtocol, target: targets.get(key) ?? (key === 'hs_crp' ? targets.get('crp') : undefined) },
      )

      let change: TestMarker['change']
      if (prev && r.value !== undefined) {
        const c = changeOf(key, r.value, prev.value, unit)
        // R5: a move across these gaps is shown muted, never counted.
        const guard = prev.gapDays < 14 ? ` · ${prev.gapDays} day${prev.gapDays === 1 ? '' : 's'} apart`
          : prev.gapDays > 548 ? ' · over a year apart'
            : !prev.sameTiming ? ' · different draw timing' : ''
        let better: boolean | undefined
        if (c.meaningful) {
          const dNow = distanceOut(r.value, r.low, r.high), dWas = distanceOut(prev.value, r.low, r.high)
          if (dNow !== dWas) better = dNow < dWas
          else if (UP_IS_WORSE.has(key)) better = c.dir === 'down'
          else if (key === 'egfr') better = c.dir === 'up'
        }
        change = { text: `${c.text} vs ${fmtDay(prev.date)}${guard}`, meaningful: c.meaningful && !guard, dir: c.dir, better }
      }

      const flag = labFlag(r.value, r.low, r.high, r.status)
      t.markers.push({
        resultId: r.id!,
        key, label, section,
        printedName: r.marker,
        value: r.value,
        rawValue: r.rawValue,
        unit,
        low: r.low,
        high: r.high,
        labFlag: flag,
        expected: expectedOnProtocol(key, flag, t.onProtocol),
        read: rd.read,
        reason: rd.reason,
        next: rd.next,
        retestBy: rd.retestWeeks && day ? retestBy(t.date, rd.retestWeeks) : undefined,
        prev,
        change,
      })
    }

    const c = t.counts
    c.total = t.markers.length
    for (const m of t.markers) {
      if (m.read === 'act' || m.read === 'watch' || m.read === 'expected' || m.read === 'fine') c[m.read]++
      if (m.labFlag === 'high' || m.labFlag === 'low') c.outOfLabRange++
    }
  }
  return tests
}

// ── Views over tests ───────────────────────────────────────────────────────

/** R3: core markers measured before but missing from this test, with their last value. */
export function notInTest(tests: LabTest[], test: LabTest, now: Date = new Date()): Array<{ key: string; label: string; value: number; unit: string; date: string; examId: number; ageMonths: number }> {
  const has = new Set(test.markers.filter((m) => m.value !== undefined).map((m) => m.key))
  const out: ReturnType<typeof notInTest> = []
  for (const key of CORE_KEYS) {
    if (has.has(key)) continue
    for (const o of tests) {
      if (o.date >= test.date) continue
      const m = o.markers.find((x) => x.key === key && x.value !== undefined)
      if (!m) continue
      const ageMonths = Math.floor((now.getTime() - Date.parse(o.date)) / (30.44 * 86_400_000))
      out.push({ key, label: m.label, value: m.value!, unit: m.unit, date: o.date, examId: o.id, ageMonths })
      break
    }
  }
  return out
}

/** One marker across every test, oldest first, converted into the newest reading's unit. */
export function markerSeries(tests: LabTest[], key: string): {
  unit: string
  points: Array<{ examId: number; t: number; date: string; value?: number; raw: string; unit: string; low?: number; high?: number; labFlag: LabFlag; converted: boolean; provider?: string; phase?: string }>
  dropped: number
} {
  const hits = tests.flatMap((t) => {
    const m = t.markers.find((x) => x.key === key)
    return m ? [{ t, m }] : []
  })
  const unit = hits[0]?.m.unit ?? ''
  let dropped = 0
  const points = hits.map(({ t, m }) => {
    const conv = (v?: number) => (v === undefined ? undefined : toUnit(key, v, m.unit, unit))
    const value = conv(m.value)
    if (m.value !== undefined && value === undefined) dropped++
    return {
      examId: t.id,
      t: Date.parse(t.date),
      date: t.date,
      value,
      raw: m.rawValue,
      unit: m.unit,
      low: conv(m.low),
      high: conv(m.high),
      labFlag: m.labFlag,
      converted: value !== undefined && value !== m.value,
      provider: t.provider,
      phase: t.timing.find((d) => d.androgen)?.phase,
    }
  })
  return { unit, points: points.reverse(), dropped }
}

/** R7: values worked out from this test alone. The lab's own printed value wins. */
export function derivedFor(test: LabTest): Array<{ label: string; value: string }> {
  const get = (k: string) => test.markers.find((m) => m.key === k && m.value !== undefined)
  const fmt = (v: number, d = 1) => String(Number(v.toFixed(d)))
  const out: Array<{ label: string; value: string }> = []

  const ratio = get('tc_hdl_ratio'), tc = get('total_cholesterol'), hdl = get('hdl')
  // A unitless TC printed beside HDL is in the same lab's unit.
  const tcHdl = hdl && tc ? toUnit('hdl', hdl.value!, hdl.unit, tc.unit || hdl.unit) : undefined
  const r = ratio?.value ?? (tc && tcHdl ? tc.value! / tcHdl : undefined)
  if (r !== undefined) out.push({ label: 'Cholesterol ratio', value: `${fmt(r)} (total ÷ HDL)` })

  const printedHoma = get('homa_ir'), glu = get('glucose'), ins = get('insulin')
  const h = printedHoma?.value ?? (glu && ins ? homaIr(glu.value!, glu.unit, ins.value!, ins.unit) : undefined)
  if (h !== undefined) out.push({ label: 'Insulin resistance score', value: `${fmt(h)} (HOMA-IR)` })

  const tt = get('total_testosterone'), e2 = get('estradiol')
  const ttNg = tt ? toUnit('total_testosterone', tt.value!, tt.unit, 'ng/dL') : undefined
  const e2Pg = e2 ? toUnit('estradiol', e2.value!, e2.unit, 'pg/mL') : undefined
  if (ttNg !== undefined && e2Pg) out.push({ label: 'Testosterone to estradiol', value: String(Math.round(ttNg / e2Pg)) })
  return out
}

/** Meaningful changes in this test, worse first, then core markers. */
export function changesFor(test: LabTest): TestMarker[] {
  const rank = (m: TestMarker) => (m.change?.better === false ? 0 : 2) + (CORE_KEYS.includes(m.key) ? 0 : 1)
  return test.markers.filter((m) => m.change?.meaningful).sort((a, b) => rank(a) - rank(b))
}

/**
 * A draft that duplicates a test (±3 days, 80% of shared values equal within
 * 1%), or belongs to the same draw (±1 day, or the same provider within ±3).
 */
export function findSameDraw(
  draft: { date: string; provider?: string; rows: Array<{ marker: string; unit: string; value: number }> },
  tests: LabTest[],
): { duplicateOf?: number; sameDrawAs?: number; matched: number; overlap: number } {
  let dup: { id: number; matched: number; overlap: number } | undefined
  let same: { id: number; gap: number; matched: number; overlap: number } | undefined
  for (const t of tests) {
    const gap = Math.abs(daysBetween(draft.date, t.date))
    if (gap > 3) continue
    let overlap = 0, matched = 0
    for (const row of draft.rows) {
      const m = t.markers.find((x) => x.key === canonicalKey(row.marker, row.unit, row).key && x.value !== undefined)
      if (!m) continue
      overlap++
      const v = toUnit(m.key, row.value, row.unit, m.unit)
      if (v !== undefined && Math.abs(v - m.value!) <= Math.abs(m.value!) * 0.01) matched++
    }
    if (overlap > 0 && matched / overlap >= 0.8 && (!dup || matched > dup.matched)) dup = { id: t.id, matched, overlap }
    const sameProvider = !!draft.provider && draft.provider === t.provider
    if ((gap <= 1 || sameProvider) && (!same || gap < same.gap)) same = { id: t.id, gap, matched, overlap }
  }
  if (dup) return { duplicateOf: dup.id, sameDrawAs: same?.id, matched: dup.matched, overlap: dup.overlap }
  return { sameDrawAs: same?.id, matched: same?.matched ?? 0, overlap: same?.overlap ?? 0 }
}
