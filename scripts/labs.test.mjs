// Bloods model self-check. Run: node scripts/labs.test.mjs
import assert from 'node:assert/strict'
import { dateFromFileName, dayOf, extractCollectionDate, fmtDay, parseLabDate } from '../src/lib/dates.ts'
import { homaIr, toUnit } from '../src/lib/labUnits.ts'
import { canonicalize } from '../src/lib/markers.ts'
import { changeOf, fmtRange, labFlag, readMarker } from '../src/lib/labRules.ts'
import { protocolAtDraw } from '../src/lib/protocolAtDraw.ts'
import { compareHash, markerHash, parseBloodsHash } from '../src/views/bloods/route.ts'
import { buildTests, canonicalKey, changesFor, compareTests, defaultOlder, derivedFor, earlierTests, keyMarkerMatrix, prevText, previousTest, detectProvider, fillEmpty, findSameDraw, markerSeries, notInTest, parseEntry, parseRange, planMerge, splitNewRows, testTitle } from '../src/lib/labTests.ts'

let n = 0
const check = (name, fn) => { fn(); n++; console.log('  ok', name) }
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} is not about ${b}`)

// ── Step 1: units, names, dates ─────────────────────────────────────────────

check('HOMA-IR converts pmol/L insulin before multiplying', () => {
  near(homaIr(4.83, 'mmol/L', 50.3, 'pmol/L'), 1.80)
  near(homaIr(87, 'mg/dL', 8.38, 'µIU/mL'), 1.80)
  assert.equal(homaIr(4.83, '', 50.3, 'pmol/L'), undefined)
})

check('ratios and percentages never fold onto the plain marker', () => {
  assert.equal(canonicalize('Total Cholesterol:HDL Ratio').key, 'tc_hdl_ratio')
  assert.equal(canonicalize('HDL % of total cholesterol'), undefined)
  assert.equal(canonicalize('Albumin/Creatinine ratio'), undefined)
  assert.equal(canonicalize('HbA1c mmol/mol').key, 'hba1c')
  assert.equal(canonicalize('Haematocrit %').key, 'hematocrit')
  assert.equal(canonicalize('Urea / BUN').key, 'urea')
  // "ratio" is a word, and unit tokens in a name are not a ratio.
  assert.equal(canonicalize('Estimated Glomerular Filtration Rate (eGFR)').key, 'egfr')
  assert.equal(canonicalize('TSH, 3rd generation').key, 'tsh')
  assert.equal(canonicalize('Transferrin saturation %').key, 'transferrin_sat')
  assert.equal(canonicalize('Mean corpuscular haemoglobin concentration').key, 'mchc')
  assert.equal(canonicalize('Platelets 10^9/L').key, 'platelets')
  assert.equal(canonicalize('eGFR mL/min/1.73m²').key, 'egfr')
  assert.equal(canonicalize('Cholesterol : HDL ratio').key, 'tc_hdl_ratio')
  assert.equal(canonicalize('Albumin : Globulin ratio').key, 'ag_ratio')
})

check('CRP and hs-CRP are two markers', () => {
  assert.equal(canonicalize('CRP').key, 'crp')
  assert.equal(canonicalize('C-Reactive Protein').key, 'crp')
  assert.equal(canonicalize('hs-CRP').key, 'hs_crp')
  assert.equal(canonicalize('High Sensitivity CRP').key, 'hs_crp')
})

check('catalog sections follow the clinical grouping', () => {
  assert.equal(canonicalize('PSA').section, 'Prostate')
  assert.equal(canonicalize('Ferritin').section, 'Iron & vitamins')
  assert.equal(canonicalize('HbA1c').section, 'Blood sugar')
  assert.equal(canonicalize('Cortisol').section, 'Other hormones')
  assert.equal(canonicalize('Creatine Kinase').label, 'Creatine kinase (muscle)')
  assert.equal(canonicalize('Creatine Kinase').section, 'Other')
})

check('unit conversions', () => {
  assert.equal(toUnit('hematocrit', 0.512, 'L/L', '%'), 51.2)
  near(toUnit('total_testosterone', 35, 'nmol/L', 'ng/dL'), 1009.4)
  near(toUnit('hba1c', 48, 'mmol/mol', '%'), 6.54)
  assert.equal(toUnit('psa', 1.2, 'ng/mL', 'µg/L'), 1.2)
  assert.equal(toUnit('ferritin', 90, 'ug/L', 'ng/mL'), 90)
  assert.equal(toUnit('hemoglobin', 9.5, 'mmol/L', 'g/L'), undefined)
  assert.equal(toUnit('ldl', 3, 'mmol/L', ''), undefined)
  // mEq/L equals mmol/L only for one-charge ions.
  assert.equal(toUnit('calcium', 4.8, 'mEq/L', 'mmol/L'), 2.4)
  assert.equal(toUnit('magnesium', 1.8, 'mEq/L', 'mmol/L'), 0.9)
  assert.equal(toUnit('sodium', 140, 'mEq/L', 'mmol/L'), 140)
  assert.equal(toUnit('glucose', 5, 'mEq/L', 'mmol/L'), undefined)
})

check('dates in lab file names', () => {
  assert.equal(dateFromFileName('SCT001-01187340_LabReport_28-May-2026-0413'), '2026-05-28')
  assert.equal(dateFromFileName('Results For Alex Morgan-LRIN45183-1-23-06-2026'), '2026-06-23')
  assert.equal(dateFromFileName('bloods.pdf'), undefined)
  assert.equal(fmtDay('2026-06-28T12:00:00Z'), 'Jun 28, 2026')
  assert.equal(parseLabDate('31/06/2026'), undefined)
  assert.equal(parseLabDate('29/02/2026'), undefined)
  // Midnight-UTC legacy stamps are calendar days in every time zone.
  assert.equal(dayOf('2026-06-28T00:00:00.000Z'), '2026-06-28')
  assert.equal(fmtDay('2026-06-28T00:00:00.000Z'), 'Jun 28, 2026')
  assert.equal(dayOf('2026-06-31'), '')
})

// ── Step 2: rules ───────────────────────────────────────────────────────────

check('one range language', () => {
  assert.equal(labFlag(35, 8.6, 29), 'high')
  assert.equal(labFlag(undefined, undefined, undefined, 'H'), 'high')
  assert.equal(labFlag(3, 1, 5, 'H'), 'in') // the range wins over a stray print
  assert.equal(fmtRange(133, 146), '133 to 146')
  assert.equal(fmtRange(undefined, 5), 'Under 5')
  assert.equal(fmtRange(60), 'Over 60')
  assert.equal(fmtRange(0.198, 0.619), '0.198 to 0.619')
  assert.equal(fmtRange(0.005, 0.045), '0.005 to 0.045')
})

check('readMarker cases', () => {
  const tt = { key: 'total_testosterone', value: 35, unit: 'nmol/L', low: 8.6, high: 29 }
  assert.equal(readMarker(tt, { onProtocol: true }).read, 'expected')
  assert.equal(readMarker(tt, { onProtocol: false }).read, 'watch')
  assert.equal(readMarker({ key: 'alt', value: 44, unit: 'U/L', low: 10, high: 50 }, { onProtocol: true }).read, 'fine')
  const alt = readMarker({ key: 'alt', value: 44, unit: 'U/L', low: 10, high: 40 }, { onProtocol: true })
  assert.equal(alt.read, 'watch')
  assert.match(alt.next, /Hard training/)
  assert.equal(readMarker({ key: 'alt', value: 160, unit: 'U/L', high: 50 }, { onProtocol: true }).read, 'act')
  const hct = readMarker({ key: 'hematocrit', value: 0.512, unit: 'L/L', low: 0.4, high: 0.52 }, { onProtocol: true })
  assert.equal(hct.read, 'watch')
  assert.match(hct.reason, /^In the lab range, over the 50% line/)
  assert.equal(hct.retestWeeks, 8)
  assert.equal(readMarker({ key: 'hematocrit', value: 52.4, unit: '%', low: 40, high: 54 }, { onProtocol: true }).read, 'act')
  assert.equal(readMarker({ key: 'psa', value: 2.1, unit: 'µg/L', high: 4, prevWithin12mo: 0.6 }, { onProtocol: true }).read, 'act')
  assert.equal(readMarker({ key: 'psa', value: 1.5, unit: 'µg/L', high: 4, prevWithin12mo: 0.7 }, { onProtocol: true }).read, 'watch')
  assert.equal(readMarker({ key: 'hba1c', value: 6.5, unit: '%', high: 6 }, { onProtocol: false }).read, 'act')
  assert.equal(readMarker({ key: 'lh', value: 0.1, unit: 'IU/L', low: 1.7, high: 8.6 }, { onProtocol: true }).read, 'expected')
  // A personal target converts into the reading's unit, and is ignored when it cannot.
  const target = { marker: 'total_testosterone', low: 700, high: 1000, unit: 'ng/dL' }
  assert.equal(readMarker(tt, { onProtocol: true, target }).read, 'watch')
  assert.match(readMarker(tt, { onProtocol: true, target }).reason, /^Outside your target/)
  assert.equal(readMarker(tt, { onProtocol: true, target: { ...target, unit: undefined } }).read, 'expected')
  assert.equal(readMarker({ key: 'ldl', unit: 'mmol/L' }, { onProtocol: true }).read, 'none')
  // A blank unit still reaches the act lines.
  assert.equal(readMarker({ key: 'hematocrit', value: 53, unit: '' }, { onProtocol: true }).read, 'act')
  assert.equal(readMarker({ key: 'psa', value: 5, unit: '', high: 4 }, { onProtocol: true }).read, 'act')
})

check('changes use R6 thresholds and points', () => {
  assert.deepEqual(changeOf('hematocrit', 0.512, 0.493, 'L/L'), { text: '≈ same', meaningful: false, dir: 'same' }) // 1.9 pts < 2
  assert.equal(changeOf('hematocrit', 0.512, 0.49, 'L/L').text, '▲ 2.2 pts')
  assert.equal(changeOf('hdl', 0.97, 0.88, 'mmol/L').text, '▲ 10%')
  assert.equal(changeOf('alt', 44, 38, 'U/L').meaningful, false) // 16% is under the 20% bar
  assert.equal(changeOf('psa', 1.3, 1.0, 'µg/L').meaningful, false)
})

// ── Step 2: a synthetic 10-test history ─────────────────────────────────────

const R = (id, examId, marker, value, unit, low, high, status) => ({ id, examId, marker, value, rawValue: String(value), unit, low, high, status })
const exams = [
  { id: 1, name: 'Well Man', company: 'Medichecks', collectedAt: '2023-05-10T12:00:00Z', meta: { dateSource: 'report' } },
  { id: 2, name: 'Blood panel', collectedAt: '2023-11-02T12:00:00.000Z', labName: 'Manual entry' },
  { id: 4, name: 'Baseline', company: 'Medichecks', collectedAt: '2025-01-20T12:00:00Z', meta: { dateSource: 'report' } },
  { id: 5, name: 'Thriva check', company: 'Thriva', collectedAt: '2025-06-01T12:00:00Z', meta: { dateSource: 'report' } },
  // Import time, not a draw date.
  { id: 6, name: 'Blood panel', collectedAt: '2025-11-15T18:43:12.345Z', labName: 'PDF import' },
  // One marker typed in by hand.
  { id: 7, name: 'Blood panel', collectedAt: '2026-02-23T12:00:00Z', labName: 'Manual entry' },
  // File names, one with the patient's name in it.
  { id: 8, name: 'SCT001-01187340_LabReport_28-May-2026-0413', collectedAt: '2026-05-11T12:00:00Z', labName: 'PDF import', sourceFileId: 80 },
  { id: 9, name: 'Results For Alex Morgan-LRIN45183-1-23-06-2026', collectedAt: '2026-06-18T12:00:00Z', labName: 'PDF import', sourceFileId: 90 },
  // A second report from the same day.
  { id: 10, name: 'Prostate check', company: 'Randox', collectedAt: '2026-06-18T12:00:00Z', meta: { dateSource: 'report' } },
  { id: 11, name: 'Well Man', company: 'Medichecks', collectedAt: '2026-06-28T12:00:00Z', meta: { dateSource: 'report', drawTime: '08:40' } },
  // Archived: never a test.
  { id: 12, name: 'Old', collectedAt: '2026-07-10T12:00:00Z', archivedAt: 1 },
]
const files = [
  { id: 80, name: 'SCT001-01187340_LabReport_28-May-2026-0413.pdf', type: 'application/pdf', size: 1, addedAt: '', status: 'Reviewed', extractedText: 'Patient: Alex Morgan' },
  { id: 90, name: 'Results For Alex Morgan-LRIN45183-1-23-06-2026.pdf', type: 'application/pdf', size: 1, addedAt: '', status: 'Reviewed', extractedText: 'Alex Morgan' },
]
const results = [
  R(101, 1, 'Testosterone', 14, 'nmol/L', 8.6, 29), R(102, 1, 'Haematocrit', 44, '%', 40, 50), R(103, 1, 'Glucose', 90, 'mg/dL', 70, 99),
  R(201, 2, 'Haemoglobin', 9.5, 'mmol/L', 8.5, 11), R(202, 2, 'LDL Cholesterol', 120, 'mg/dL', undefined, 130),
  R(401, 4, 'Testosterone', 12, 'nmol/L', 8.6, 29), R(402, 4, 'Haematocrit', 43, '%', 40, 50),
  R(501, 5, 'Testosterone', 25, 'nmol/L', 8.6, 29), R(502, 5, 'Cholesterol', 4.5, ''), R(503, 5, 'Total Cholesterol', 5.0, 'mmol/L'),
  R(601, 6, 'Testosterone', 28, 'nmol/L', 8.6, 29), R(602, 6, 'Haematocrit', 47, '%', 40, 50),
  R(701, 7, 'HDL Cholesterol', 0.88, 'mmol/L', 1),
  R(801, 8, 'PSA', 0.9, 'µg/L', undefined, 4), R(802, 8, 'Haematocrit', 0.47, 'L/L', 0.4, 0.5), R(803, 8, 'ALT', 38, 'U/L', 10, 50),
  R(901, 9, 'Haematocrit', 0.49, 'L/L', 0.4, 0.5), R(902, 9, 'Insulin', 50.3, 'pmol/L'), R(903, 9, 'PSA', 1.0, 'µg/L', undefined, 4),
  R(904, 9, 'Testosterone', 30, 'nmol/L', 8.6, 29), R(905, 9, 'Oestradiol', 150, 'pmol/L', 41, 159),
  R(1001, 10, 'PSA', 1.1, 'µg/L', undefined, 4),
  R(1101, 11, 'Testosterone', 35, 'nmol/L', 8.6, 29, 'H'), R(1102, 11, 'Free Testosterone', 0.9, 'nmol/L', 0.2, 0.62, 'H'),
  R(1103, 11, 'SHBG', 22, 'nmol/L', 18, 54), R(1104, 11, 'Oestradiol', 180, 'pmol/L', 41, 159, 'H'),
  R(1105, 11, 'LH', 0.1, 'IU/L', 1.7, 8.6, 'L'), R(1106, 11, 'FSH', 0.1, 'IU/L', 1.5, 12.4, 'L'),
  R(1107, 11, 'Haematocrit', 0.512, 'L/L', 0.4, 0.5, 'H'), R(1108, 11, 'Haemoglobin', 172, 'g/L', 130, 180),
  R(1109, 11, 'Platelets', 250, '10^9/L', 150, 410), R(1110, 11, 'Total Cholesterol', 5.2, 'mmol/L', undefined, 5),
  R(1111, 11, 'LDL Cholesterol', 3.4, 'mmol/L', undefined, 3), R(1112, 11, 'HDL Cholesterol', 0.97, 'mmol/L', 1),
  R(1113, 11, 'Triglycerides', 1.6, 'mmol/L', undefined, 1.7), R(1114, 11, 'ALT', 44, 'U/L', 10, 50),
  R(1115, 11, 'GGT', 30, 'U/L', undefined, 60), R(1116, 11, 'Creatinine', 105, 'µmol/L', 59, 104),
  R(1117, 11, 'HbA1c', 36, 'mmol/mol', 20, 42), R(1118, 11, 'Glucose', 4.83, 'mmol/L', 3.9, 5.8),
  R(1119, 11, 'Ferritin', 90, 'µg/L', 30, 400),
  // A duplicate import of the same row, and an orphan and an archived row.
  R(1120, 11, 'HDL Cholesterol', 0.97, 'mmol/L', 1),
  R(1301, 99, 'PSA', 9, 'µg/L'), { ...R(1302, 11, 'PSA', 9, 'µg/L'), archivedAt: 1 },
]
const compounds = [
  { id: 1, name: 'Testosterone Cypionate', category: 'TRT', defaultDose: 50, unit: 'mg', schedule: '', color: '#fff' },
  // First dosed three days after the latest test.
  { id: 2, name: 'Trenbolone Acetate', category: 'Other', defaultDose: 50, unit: 'mg', schedule: '', color: '#000', archived: true },
]
const injections = []
for (let t = Date.parse('2025-03-04T08:00:00Z'); t < Date.parse('2026-09-01'); t += 3.5 * 86_400_000) {
  injections.push({ compoundId: 1, takenAt: new Date(t).toISOString(), dose: 50, unit: 'mg', route: 'IM' })
}
injections.push({ compoundId: 2, takenAt: '2026-07-01T08:00:00Z', dose: 50, unit: 'mg', route: 'IM' })

const tests = buildTests({ exams, results, files, targets: [], compounds, injections })
const byId = (id) => tests.find((t) => t.id === id)
const latest = tests[0]

check('ten live tests, newest first, archived and orphans skipped', () => {
  assert.equal(tests.length, 10)
  assert.deepEqual(tests.map((t) => t.id), [11, 9, 10, 8, 7, 6, 5, 4, 2, 1])
})

check('latest is the newest test only, and every marker is from it', () => {
  assert.equal(latest.id, 11)
  assert.equal(latest.counts.total, 19)
  for (const m of latest.markers) assert.equal(results.find((r) => r.id === m.resultId).examId, 11)
  assert.equal(latest.markers.some((m) => m.key === 'psa'), false)
})

check('no previous value comes from the same day', () => {
  for (const t of tests) for (const m of t.markers) if (m.prev) assert.ok(m.prev.date.slice(0, 10) < t.date.slice(0, 10), `${t.id} ${m.key}`)
  const psa = byId(10).markers.find((m) => m.key === 'psa')
  assert.equal(psa.prev.examId, 8)
})

check('a gap under 14 days is never meaningful', () => {
  const hct = latest.markers.find((m) => m.key === 'hematocrit')
  assert.equal(hct.prev.examId, 9)
  assert.equal(hct.prev.gapDays, 10)
  assert.equal(hct.change.meaningful, false)
  assert.match(hct.change.text, /^▲ 2\.2 pts vs Jun 18, 2026 · 10 days apart$/)
})

check('What changed names its baseline and says better or worse', () => {
  const hdl = latest.markers.find((m) => m.key === 'hdl')
  assert.equal(hdl.prev.examId, 7)
  assert.equal(hdl.change.text, '▲ 10% vs Feb 23, 2026')
  assert.equal(hdl.change.better, true)
  assert.ok(changesFor(latest).some((m) => m.key === 'hdl'))
  assert.ok(!changesFor(latest).some((m) => m.key === 'hematocrit'))
})

check('reads inside a built test', () => {
  const read = (k) => latest.markers.find((m) => m.key === k)
  assert.equal(latest.onProtocol, true)
  assert.equal(read('total_testosterone').read, 'expected')
  assert.equal(read('lh').read, 'expected')
  assert.equal(read('alt').read, 'fine')
  assert.equal(read('hematocrit').read, 'watch')
  assert.equal(read('hematocrit').retestBy, '2026-08-23')
  assert.equal(read('hdl').labFlag, 'low')
  assert.equal(latest.counts.expected, 4) // TT, free T, LH, FSH
  assert.equal(byId(4).baseline, true)
  assert.equal(byId(1).onProtocol, false)
})

check('calculated values come from one test only', () => {
  const labels = derivedFor(latest).map((d) => d.label)
  assert.ok(labels.includes('Cholesterol ratio'))
  assert.ok(labels.includes('Testosterone to estradiol'))
  assert.ok(!labels.includes('Insulin resistance score')) // insulin is in the Jun 18 test
  assert.ok(!derivedFor(byId(9)).some((d) => d.label === 'Insulin resistance score'))
})

check('protocolAtDraw ignores compounds first dosed after the draw', () => {
  const groups = latest.timing.map((d) => d.group)
  assert.deepEqual(groups, ['testosterone cypionate'])
  assert.equal(latest.timing[0].everyDays, 3.5)
  assert.equal(latest.timing[0].weekly, 100)
  assert.equal(latest.timing[0].since, '2025-03-04T08:00:00.000Z')
  const after = protocolAtDraw(new Date('2026-07-03T09:00:00Z'), true, compounds, injections)
  assert.ok(after.some((d) => d.group === 'trenbolone acetate')) // archived, still listed once dosed
  assert.deepEqual(byId(4).timing, [])
})

check('titles never leak a patient name from a file name', () => {
  assert.ok(!testTitle({ name: 'Results For Alex Morgan-LRIN45183-1-23-06-2026' }).includes('Alex'))
  for (const t of tests) assert.ok(!t.title.includes('Alex'), t.title)
  assert.equal(byId(9).title, 'Blood test')
  assert.equal(byId(11).title, 'Well Man')
  assert.equal(testTitle({ name: 'x_y', company: 'Medichecks' }), 'Medichecks blood test')
  // The old "Blood panel" default is not a name.
  assert.equal(byId(2).title, 'Blood test')
  for (const t of tests) assert.doesNotMatch(t.title, /panel/i)
  // A legacy import was named after its file, even with no file row left.
  assert.equal(testTitle({ name: 'Alex Morgan bloods', labName: 'PDF import' }), 'Blood test')
  assert.ok(!testTitle({ name: 'Alex Morgan bloods', sourceFileId: 1 }, { name: 'Alex Morgan bloods.webp' }).includes('Alex'))
  assert.equal(testTitle({ name: 'Well Man', labName: 'PDF import', meta: { dateSource: 'user' } }), 'Well Man')
  // The "NHS No" field on a private report is not the provider.
  assert.equal(detectProvider('Medichecks report. NHS No: 123 456 7890'), 'Medichecks')
  assert.equal(detectProvider('NHS Number 123 456 7890, x@nhs.net'), undefined)
  assert.equal(detectProvider("Guy's and St Thomas' NHS Foundation Trust"), 'NHS')
})

check('tests needing a check', () => {
  assert.deepEqual(byId(6).needsCheck, ['Draw date not confirmed'])
  assert.ok(byId(8).needsCheck.includes('Draw date not confirmed')) // file name says May 28
  assert.ok(byId(9).needsCheck.includes('Same day as Prostate check'))
  assert.ok(byId(10).needsCheck.includes('Same day as Blood test'))
  assert.deepEqual(latest.needsCheck, [])
  assert.deepEqual(byId(7).needsCheck, [])
  assert.equal(byId(2).dateSource, 'legacy')
  const one = (exam, files = []) => buildTests({ exams: [exam], results: [], files, targets: [], compounds: [], injections: [] })[0].needsCheck
  // A bare report date from a /read import is not an import timestamp.
  assert.deepEqual(one({ id: 1, name: 'Blood test', collectedAt: '2026-06-23', labName: 'PDF import' }), [])
  // A date read from the collection label beats the report date in the file name.
  assert.deepEqual(one({ id: 1, name: 'Blood test', collectedAt: '2026-05-26T12:00:00Z', sourceFileId: 5, meta: { dateSource: 'report' } },
    [{ id: 5, name: 'SCT001-01187340_LabReport_28-May-2026-0413.pdf' }]), [])
})

check('legacy ratio rows are re-keyed by unit', () => {
  assert.equal(canonicalKey('Total Cholesterol', '', undefined, true).key, 'tc_hdl_ratio')
  assert.equal(canonicalKey('Total Cholesterol', 'ratio').key, 'tc_hdl_ratio')
  assert.equal(canonicalKey('Total Cholesterol', 'mmol/L').key, 'total_cholesterol')
  // The fold is a second, unitless TC next to a real one in the same test.
  assert.equal(byId(5).markers[1].key, 'tc_hdl_ratio')
  assert.equal(byId(5).markers[2].key, 'total_cholesterol')
  // A lone unitless TC is still cholesterol.
  const [lone] = buildTests({ exams: [{ id: 1, name: 'x', collectedAt: '2026-01-01T12:00:00Z' }], results: [R(1, 1, 'Total Cholesterol', 5.2, ''), R(2, 1, 'HDL Cholesterol', 1.3, 'mmol/L')], files: [], targets: [], compounds: [], injections: [] })
  assert.equal(lone.markers[0].key, 'total_cholesterol')
  assert.equal(derivedFor(lone).find((d) => d.label === 'Cholesterol ratio').value, '4 (total ÷ HDL)')
  // A percentage under a non-percent marker is a different quantity.
  assert.equal(canonicalKey('Total Cholesterol', '%').section, 'Other')
  assert.equal(canonicalKey('Hematocrit', '%').key, 'hematocrit')
})

check('legacy hs-CRP rows with a plain-CRP range are CRP', () => {
  assert.equal(canonicalKey('hs-CRP', 'mg/L', { high: 5 }).key, 'crp')
  assert.equal(canonicalKey('hs-CRP', 'mg/L', { high: 3 }).key, 'hs_crp')
  assert.equal(canonicalKey('High Sensitivity CRP', 'mg/L', { high: 5 }).key, 'hs_crp')
  const e = (id, day) => ({ id, name: 'x', collectedAt: `${day}T12:00:00Z` })
  const ts = buildTests({ exams: [e(1, '2025-06-01'), e(2, '2026-01-10')], results: [R(1, 1, 'hs-CRP', 2, 'mg/L', 0, 5), R(2, 2, 'CRP', 3, 'mg/L', 0, 5)], files: [], targets: [], compounds: [], injections: [] })
  const crp = ts[0].markers[0]
  assert.equal(crp.key, 'crp')
  assert.equal(crp.prev.examId, 1)
  // A target saved on crp before the split still applies to hs-CRP.
  const [hs] = buildTests({ exams: [e(1, '2026-01-10')], results: [R(1, 1, 'hs-CRP', 2.5, 'mg/L', 0, 3)], files: [], targets: [{ marker: 'crp', high: 1, unit: 'mg/L' }], compounds: [], injections: [] })
  assert.equal(hs.markers[0].key, 'hs_crp')
  assert.equal(hs.markers[0].read, 'watch')
})

check('not in this test lists missing core markers with their last value', () => {
  const missing = notInTest(tests, latest, new Date('2026-09-29'))
  const psa = missing.find((m) => m.key === 'psa')
  assert.equal(psa.examId, 9)
  assert.equal(psa.ageMonths, 3)
  assert.ok(!missing.some((m) => m.key === 'hematocrit'))
})

check('marker series converts into the newest unit and counts what it cannot', () => {
  const hct = markerSeries(tests, 'hematocrit')
  assert.equal(hct.unit, 'L/L')
  assert.equal(hct.points[0].examId, 1)
  assert.equal(hct.points[0].value, 0.44)
  assert.equal(hct.points[0].converted, true)
  assert.equal(markerSeries(tests, 'hemoglobin').dropped, 1)
})

check('same draw and duplicates', () => {
  const rows = latest.markers.map((m) => ({ marker: m.printedName, unit: m.unit, value: m.value }))
  assert.equal(findSameDraw({ date: '2026-06-29', provider: 'Medichecks', rows }, tests).duplicateOf, 11)
  const same = findSameDraw({ date: '2026-06-19', rows: [{ marker: 'Vitamin D', unit: 'nmol/L', value: 80 }] }, tests)
  assert.equal(same.duplicateOf, undefined)
  assert.ok([9, 10].includes(same.sameDrawAs))
  // One shared value is not a duplicate report, just the same draw.
  const [small] = buildTests({
    exams: [{ id: 1, name: 'x', collectedAt: '2026-06-10T12:00:00Z' }],
    results: [R(1, 1, 'Sodium', 140, 'mmol/L', 133, 146), R(2, 1, 'Potassium', 4.2, 'mmol/L', 3.5, 5.3), R(3, 1, 'Urea', 5.1, 'mmol/L', 2.5, 7.8)],
    files: [], targets: [], compounds: [], injections: [],
  })
  const one = findSameDraw({ date: '2026-06-11', rows: [{ marker: 'Sodium', unit: 'mmol/L', value: 140 }] }, [small])
  assert.equal(one.duplicateOf, undefined)
  assert.equal(one.sameDrawAs, 1)
})

check('an impossible stored date never crashes the page', () => {
  const inj = [{ compoundId: 1, takenAt: '2026-06-20T08:00:00Z', dose: 50, unit: 'mg' }]
  const [t] = buildTests({ exams: [{ id: 1, name: 'x', collectedAt: '2026-06-31' }], results: [R(1, 1, 'Haematocrit', 53, '%', 40, 50)], files: [], targets: [], compounds, injections: inj })
  assert.equal(t.markers[0].read, 'act')
  assert.equal(t.markers[0].retestBy, undefined)
  assert.deepEqual(t.timing, [])
})

check('PSA rises add up across the last 12 months', () => {
  const e = (id, day) => ({ id, name: 'x', collectedAt: `${day}T12:00:00Z` })
  const ts = buildTests({
    exams: [e(1, '2025-10-01'), e(2, '2026-02-01'), e(3, '2026-06-01')],
    results: [R(1, 1, 'PSA', 0.8, 'µg/L', undefined, 4), R(2, 2, 'PSA', 1.4, 'µg/L', undefined, 4), R(3, 3, 'PSA', 2.3, 'µg/L', undefined, 4)],
    files: [], targets: [], compounds: [], injections: [],
  })
  assert.equal(ts[0].markers[0].read, 'act')
  assert.equal(ts[0].markers[0].prev.value, 1.4)
})

check('a shot-day draw with no time is not a different timing', () => {
  const weekly = []
  for (let t = Date.parse('2026-01-01T08:00:00Z'); t < Date.parse('2026-04-01'); t += 7 * 86_400_000) weekly.push({ compoundId: 1, takenAt: new Date(t).toISOString(), dose: 100, unit: 'mg' })
  const ts = buildTests({
    exams: [
      { id: 1, name: 'x', collectedAt: '2026-02-05T12:00:00.000Z', labName: 'Manual entry' }, // a shot day
      { id: 2, name: 'y', collectedAt: '2026-03-11T12:00:00Z', meta: { dateSource: 'report', drawTime: '08:30' } }, // trough
    ],
    results: [R(1, 1, 'Haematocrit', 47, '%', 40, 54), R(2, 2, 'Haematocrit', 50, '%', 40, 54)],
    files: [], targets: [], compounds, injections: weekly,
  })
  assert.equal(ts[1].timing[0].phase, 'same-day')
  assert.equal(ts[0].timing[0].phase, 'trough')
  const hct = ts[0].markers[0]
  assert.equal(hct.change.meaningful, true)
  assert.doesNotMatch(hct.change.text, /different draw timing/)
})

check('a midnight manual entry and a noon import on one day are the same day', () => {
  const ts = buildTests({
    exams: [
      { id: 1, name: 'Blood panel', collectedAt: '2026-06-28T00:00:00.000Z', labName: 'Manual entry' },
      { id: 2, name: 'Well Man', company: 'Medichecks', collectedAt: '2026-06-28T12:00:00Z', meta: { dateSource: 'report' } },
    ],
    results: [R(1, 1, 'HDL Cholesterol', 0.9, 'mmol/L', 1), R(2, 2, 'HDL Cholesterol', 1.1, 'mmol/L', 1)],
    files: [], targets: [], compounds: [], injections: [],
  })
  for (const t of ts) {
    assert.ok(t.needsCheck.some((c) => c.startsWith('Same day as')), `${t.id}`)
    assert.equal(t.markers[0].prev, undefined)
  }
})

check('a slash between two names for one marker is a synonym, not a ratio', () => {
  assert.equal(canonicalize('ALT/SGPT')?.key, 'alt')
  assert.equal(canonicalize('Urea/BUN')?.key, 'urea')
  assert.equal(canonicalize('Total Cholesterol/HDL')?.key, 'tc_hdl_ratio')
})

check('marker keys survive the hash, and a bad hash cannot crash', () => {
  for (const key of ['lh/fsh ratio', 'neutrophils %', 'hdl % of total cholesterol', 'albumin/creatinine ratio']) {
    assert.deepEqual(parseBloodsHash(markerHash(key, 5)), { kind: 'marker', key, examId: 5 })
    assert.deepEqual(parseBloodsHash(markerHash(key)), { kind: 'marker', key, examId: undefined })
  }
  assert.deepEqual(parseBloodsHash('#marker/50%'), { kind: 'home', tab: 'latest' })
})

check('a small dose keeps its weekly total', () => {
  const drawAt = new Date(2026, 5, 28, 9, 0)
  const doses = (every) => [0, 1, 2, 3].map((k) => ({ compoundId: 1, takenAt: new Date(drawAt.getTime() - (1 + k * every) * 86_400_000).toISOString(), dose: 0.25, unit: 'mg' }))
  assert.equal(protocolAtDraw(drawAt, true, compounds, doses(7))[0].weekly, 0.25)
  assert.equal(protocolAtDraw(drawAt, true, compounds, doses(3.5))[0].weekly, 0.5)
  assert.equal(protocolAtDraw(drawAt, true, compounds, doses(3.5).map((d) => ({ ...d, dose: 50 })))[0].weekly, 100)
})

check('a dose the evening before a draw with no time is not same day', () => {
  // Local times: the draw is assumed at 9 am on Jun 28.
  const [d] = protocolAtDraw(new Date(2026, 5, 28, 9, 0), false, compounds, [{ compoundId: 1, takenAt: '2026-06-27T22:00:00', dose: 50, unit: 'mg' }])
  assert.notEqual(d.phase, 'same-day')
  assert.equal(d.daysBefore, 0.5)
  assert.notEqual(dayOf(d.since), '2026-06-28')
})

check('expected on protocol survives a personal target', () => {
  const ts = buildTests({
    exams: [{ id: 1, name: 'x', collectedAt: '2026-06-28T12:00:00Z', meta: { dateSource: 'report' } }],
    results: [R(1, 1, 'Testosterone', 35, 'nmol/L', 8.6, 29)],
    files: [], targets: [{ marker: 'total_testosterone', low: 20, high: 40, unit: 'nmol/L' }], compounds, injections,
  })
  const m = ts[0].markers[0]
  assert.equal(m.read, 'fine')
  assert.equal(m.expected, true)
  assert.equal(latest.markers.find((x) => x.key === 'total_testosterone').expected, true)
  assert.equal(latest.markers.find((x) => x.key === 'estradiol').expected, false)
})

// ── Step 5: import, editing and merging ─────────────────────────────────────

check('the draw date skips birth dates, future dates and old dates, and prefers collection labels', () => {
  const now = new Date('2026-09-29T12:00:00Z')
  assert.deepEqual(extractCollectionDate('Reported: 30/06/2026\nSample collected: 28/06/2026', now), { date: '2026-06-28', source: 'report' })
  assert.deepEqual(extractCollectionDate('Report date 30 Jun 2026', now), { date: '2026-06-30', source: 'report-date' })
  assert.deepEqual(extractCollectionDate('Collected 23/06/2026 DOB 01/02/1980', now), { date: '2026-06-23', source: 'report' })
  assert.equal(extractCollectionDate('Collected DOB: 01/02/1990', now), undefined)
  assert.equal(extractCollectionDate('Sample date 01/01/2027', now), undefined)
  assert.equal(extractCollectionDate('Collection date 01/01/2009', now), undefined)
  assert.equal(extractCollectionDate('Date of birth 12/03/2020 Reported 30/06/2026', now).date, '2026-06-30')
})

check('typed values and ranges', () => {
  assert.deepEqual(parseEntry('<0.5'), { value: 0.5, op: '<' })
  assert.deepEqual(parseEntry('51,2'), { value: 51.2, op: undefined })
  assert.equal(parseEntry('abc').value, undefined)
  assert.deepEqual(parseRange('40', '50'), { low: 40, high: 50 })
  assert.deepEqual(parseRange('<5', ''), { low: undefined, high: 5 })
  assert.deepEqual(parseRange('', '<5'), { low: undefined, high: 5 })
  assert.deepEqual(parseRange('', '50'), { low: undefined, high: 50 })
  assert.deepEqual(parseRange('>60', ''), { low: 60, high: undefined })
})

check('adding to a same-draw test skips markers it already has', () => {
  const rows = [{ marker: 'Haematocrit', unit: '%', value: 51 }, { marker: 'Vitamin D', unit: 'nmol/L', value: 80 }]
  const { add, skipped } = splitNewRows(rows, [{ marker: 'Hematocrit', unit: 'L/L', value: 0.5 }])
  assert.equal(skipped, 1)
  assert.deepEqual(add.map((r) => r.marker), ['Vitamin D'])
})

check('a merge archives every moved row whose marker the destination already has', () => {
  const src = [R(1, 1, 'HDL Cholesterol', 1.1, 'mmol/L'), R(2, 1, 'Haematocrit', 0.5, 'L/L'), R(3, 1, 'ALT', 30, 'U/L'), R(7, 1, 'GGT', 25, 'U/L')]
  const dst = [R(4, 2, 'HDL', 1.1, 'mmol/L'), R(5, 2, 'Hematocrit', 50, '%'), R(6, 2, 'ALT', 44, 'U/L'), { id: 8, examId: 2, marker: 'GGT', rawValue: '', unit: 'U/L' }]
  // dst keeps its ALT; src's GGT is the only value, so it stays.
  assert.deepEqual(planMerge(src, dst), { archive: [1, 2, 3], differing: 1 })
})

check('a merge into a legacy test keeps "Draw date not confirmed" and never brings back a file-name title', () => {
  const legacy = { id: 1, name: 'Alex Morgan bloods', labName: 'PDF import', collectedAt: '2025-11-15T18:43:12.345Z' }
  const filled = { ...legacy, ...fillEmpty(legacy, { meta: { dateSource: 'user', fasted: true } }) }
  const [t] = buildTests({ exams: [filled], results: [], files: [], targets: [], compounds: [], injections: [] })
  assert.deepEqual(t.needsCheck, ['Draw date not confirmed'])
  assert.equal(t.title, 'Blood test')
})

check('a merge fills only the empty fields of the destination', () => {
  const fill = fillEmpty(
    { id: 2, name: 'Well Man', collectedAt: 'x', company: 'Medichecks', meta: { dateSource: 'report', fasted: null } },
    { id: 1, name: 'Blood test', collectedAt: 'x', company: 'Thriva', notes: 'hard week', sourceFileId: 7, meta: { dateSource: 'user', drawTime: '08:40', fasted: true } },
  )
  assert.deepEqual(fill, { notes: 'hard week', sourceFileId: 7, meta: { dateSource: 'report', drawTime: '08:40', fasted: true } })
  assert.deepEqual(fillEmpty({ id: 2, name: 'x', collectedAt: 'x', company: 'A' }, { company: 'B' }), {})
})

// ── Step 8 and 9: compare and the doctor report ─────────────────────────────

check('compare and report routes parse', () => {
  assert.deepEqual(parseBloodsHash(compareHash(11, 9)), { kind: 'compare', newerId: 11, olderId: 9 })
  assert.deepEqual(parseBloodsHash('#compare/11'), { kind: 'compare', newerId: 11, olderId: undefined })
  assert.deepEqual(parseBloodsHash('#report/11'), { kind: 'report', id: 11 })
  assert.deepEqual(parseBloodsHash('#report/x'), { kind: 'home', tab: 'latest' })
})

check('compare defaults: previous is a strictly earlier day, older shares the most markers', () => {
  const t11 = byId(11)
  assert.equal(previousTest(tests, t11).id, 9) // Jun 18 (9 and 10 share the day; 9 has more results)
  assert.ok(earlierTests(tests, byId(9)).every((o) => o.date.slice(0, 10) < '2026-06-18'))
  // 9 and 1 both share three markers with 11; the nearer one wins.
  assert.equal(defaultOlder(tests, t11).id, 9)
  // The oldest test has nothing earlier and falls back to another test.
  assert.ok(defaultOlder(tests, byId(1)))
})

check('compare converts into the newer unit and applies R6', () => {
  const c = compareTests(byId(11), byId(9))
  const row = (k) => c.sections.flatMap((s) => s.rows).find((r) => r.key === k)
  assert.equal(row('hematocrit').change.text, '▲ 2.2 pts')
  assert.equal(row('hematocrit').change.meaningful, true)
  assert.equal(row('total_testosterone').change.text, 'same') // 17% is under the 20% bar
  assert.equal(row('estradiol').change.text, '▲ 20%')
  assert.equal(c.gapDays, 10)
  assert.deepEqual(c.onlyOlder.map((m) => m.key).sort(), ['insulin', 'psa'])
  assert.equal(c.both + c.onlyNewer.length, byId(11).counts.total)
  // % into L/L, with the printed value kept for the second line.
  const d = compareTests(byId(11), byId(1))
  const hct = d.sections.flatMap((s) => s.rows).find((r) => r.key === 'hematocrit')
  assert.equal(hct.olderValue, 0.44)
  assert.equal(hct.olderConverted, true)
  // No conversion: no value and no change, just "different unit".
  const e = compareTests(byId(11), byId(2))
  const hgb = e.sections.flatMap((s) => s.rows).find((r) => r.key === 'hemoglobin')
  assert.equal(hgb.olderValue, undefined)
  assert.equal(hgb.change.text, 'different unit')
  assert.equal(hgb.change.meaningful, false)
  // Sections follow the clinical order.
  assert.deepEqual(c.sections.map((s) => s.section), ['Hormones', 'Full blood count'])
})

check('the key-marker matrix converts into the first column unit and lists each conversion once', () => {
  const m = keyMarkerMatrix([byId(11), byId(9), byId(1)])
  const hct = m.rows.find((r) => r.key === 'hematocrit')
  assert.equal(hct.unit, 'L/L')
  assert.deepEqual(hct.cells.map((c) => c && [c.text, c.labFlag, c.converted]), [['0.512', 'high', false], ['0.49', 'in', false], ['0.44', 'in', true]])
  assert.deepEqual(m.conversions, ['Hematocrit: % to L/L'])
  assert.equal(m.rows[0].key, 'total_testosterone')
  // Never a calculated ratio or a marker outside the key list.
  assert.ok(m.rows.every((r) => !/ratio|homa|insulin|platelets/i.test(r.key)))
  // A row only when some column has the marker; an empty cell where a test lacks it.
  assert.ok(!m.rows.some((r) => r.key === 'egfr'))
  const psa = m.rows.find((r) => r.key === 'psa')
  assert.equal(psa.cells[0], undefined)
  assert.equal(psa.cells[1].text, '1')
})

check('a < or > limit is not a value: no change from it, and the lab\'s sign is kept', () => {
  const two = (marker, unit, olderRaw, newerRaw) => buildTests({
    exams: [{ id: 1, name: 'A', collectedAt: '2026-01-10', meta: { dateSource: 'user' } }, { id: 2, name: 'B', collectedAt: '2026-06-10', meta: { dateSource: 'user' } }],
    results: [[1, olderRaw], [2, newerRaw]].map(([examId, raw], i) => ({ id: i + 1, examId, marker, unit, rawValue: raw, value: parseEntry(raw).value })),
    files: [], targets: [], compounds: [], injections: [],
  })
  const [vd] = two('Vitamin D', 'nmol/L', '<37', '80')
  assert.equal(vd.markers[0].change, undefined)
  assert.equal(vd.markers[0].prev.raw, '<37')
  assert.equal(prevText(vd.markers[0].prev), '<37')
  const [psa] = two('PSA', 'ug/L', '<0.1', '<0.1')
  assert.equal(prevText(psa.markers[0].prev), '<0.1')
  assert.equal(psa.markers[0].change, undefined)
  const [n, o] = two('eGFR', 'mL/min/1.73m2', '62', '>90')
  const row = compareTests(n, o).sections[0].rows[0]
  assert.equal(row.change.meaningful, false)
  assert.equal(row.change.text, 'not comparable')
})

check('a legacy import stamp is a draw date not confirmed', () => {
  const [t] = buildTests({ exams: [{ id: 1, name: 'SCT001-01187340_LabReport_28-May-2026-0413', labName: 'PDF import', collectedAt: '2026-05-30T19:59:28.724Z' }], results: [], files: [], targets: [], compounds: [], injections: [] })
  assert.ok(t.needsCheck.includes('Draw date not confirmed'))
})

console.log(`\n${n} checks passed`)

// ── Spreadsheet import (CSV/Excel via labTable) ──
{
  const { parseLabTable, TABLE_SENTINEL, toCsv, parseCsv } = await import('../src/lib/labTable.ts')
  const csv = `Test Name,Category,Date,Value,Units,Reference Range,Status
Haematocrit,haematology,2026-10-01,0.56,L/L,0.380 - 0.500,Above normal
eGFR,kidneyFunction,2026-10-01,66,mL/min/1.73m2,>60,Normal
ALT,liverFunction,2026-10-01,33,U/L,<50,Normal
"Free-Testosterone(Calculated)",hormones,2026-10-01,"6.507",nmol/L,0.2 - 0.62,Above normal
Note,,,,,,`
  const { markers, date } = parseLabTable(`${TABLE_SENTINEL}\n${csv}`)
  assert.equal(date, '2026-10-01')
  assert.equal(markers.length, 4)
  assert.deepEqual(markers[0], { marker: 'Haematocrit', value: 0.56, unit: 'L/L', low: 0.38, high: 0.5, flag: 'H', rawValue: undefined, confidence: 'high' })
  assert.equal(markers[1].low, 60); assert.equal(markers[1].high, undefined); assert.equal(markers[1].flag, undefined)
  assert.equal(markers[2].high, 50)
  assert.equal(markers[3].value, 6.507)
  assert.deepEqual(parseCsv(toCsv([['a,b', 'c"d', '']])), [['a,b', 'c"d', '']])
  assert.equal(extractCollectionDate(`${TABLE_SENTINEL}\n${csv}`).date, '2026-10-01')
  // Semicolon CSV with low/high columns and an Excel serial date (46296 = 2026-10-01).
  const semi = parseLabTable('Marker;Result;Unit;Low;High;Date\nFerritin;95;ug/L;30;400;46296')
  assert.deepEqual([semi.markers[0].low, semi.markers[0].high, semi.date], [30, 400, '2026-10-01'])
  console.log('labTable ok')
}

// ── Blood-letting against hematocrit ──
{
  const { hctSeries, bleedEffect, bleedNudge } = await import('../src/lib/phlebotomy.ts')
  const test = (date, value, high, labFlag) => ({ date, markers: [{ key: 'hematocrit', value, high, labFlag, read: 'watch' }] })
  const series = hctSeries([test('2026-10-01', 0.56, 0.5, 'high'), test('2026-06-01', 49, 50, 'none')])
  assert.deepEqual(series.map((h) => h.pct), [49, 56])
  // High latest test, no bleed: offer to log one.
  assert.equal(bleedNudge(series, [], '2026-10-06').tone, 'warn')
  assert.match(bleedNudge(series, [], '2026-10-06').title, /56% on Oct 1, 2026, over the 50% limit/)
  // Bleed after the test: retest reminder, 28 days on.
  const bleed = { performedAt: '2026-10-04', kind: 'therapeutic', volumeMl: 500 }
  const n = bleedNudge(series, [bleed], '2026-10-06')
  assert.equal(n.title, 'Venesection · 500 mL 2 days ago')
  assert.match(n.sub, /Nov 1, 2026/)
  // Archived bleeds do not count; a test after the bleed ends the nudge if in range.
  assert.equal(bleedNudge(series, [{ ...bleed, archivedAt: 1 }], '2026-10-06').tone, 'warn')
  const after = hctSeries([test('2026-10-01', 0.56, 0.5, 'high'), test('2026-11-01', 0.49, 0.5, 'none')])
  assert.equal(bleedNudge(after, [bleed], '2026-11-02'), undefined)
  assert.equal(bleedEffect(bleed, after).text, 'Hematocrit 56% → 49% (Oct 1, 2026 to Nov 1, 2026)')
  // Too long ago: quiet.
  assert.equal(bleedNudge([], [bleed], '2027-03-01'), undefined)
  console.log('phlebotomy ok')
}

// "Observation Date" (Medichecks/Inuvi) is the draw date, and the birth date before it is ignored.
assert.deepEqual(extractCollectionDate('D.O.B. : 15-FEB-2000 Sex : M Observation Date : 4-JUN-2026 PID : 2024097706', new Date('2026-10-06')), { date: '2026-06-04', source: 'report' })
console.log('observation date ok')
