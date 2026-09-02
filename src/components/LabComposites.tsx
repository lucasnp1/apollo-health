/**
 * LabComposites: multi-marker panels that read a blood panel the way a
 * TRT-literate clinician would. Unit-aware (UK mmol/L and US mg/dL both
 * work), shows the change since the previous test, and expands into a plain
 * note plus sourced suggestions. Not medical advice.
 */

import { useMemo, useState } from 'react'
import type { LabExam } from '../lib/db'
import { canonicalize } from '../lib/markers'
import type { EnrichedResult } from '../lib/insights'
import { Activity, Atom, Brain, ChevronDown, ChevronUp, Droplet, Flame, Heart, Filter, Pill, Sun, type LucideIcon } from 'lucide-react'
import { PanelCard } from './dashboard/PanelCard'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Status = 'good' | 'warn' | 'bad' | 'none'
type Trend = { pct: number; dir: 'up' | 'down' | 'flat' }
type MarkerVal = { label: string; display: string; status: Status; trend?: Trend }

type CompositePanel = {
  id: string
  icon: LucideIcon
  label: string
  status: Status
  pills: MarkerVal[]
  note: string
  since?: string
  recommendations: Array<{ text: string; source: string }>
}

// A marker reading with history: latest value plus the previous test's value.
type Reading = { value: number; unit: string; low?: number; high?: number; date: string; prev?: { value: number; unit: string; date: string } }
type History = Map<string, Reading>

// ── History ────────────────────────────────────────────────────────────────
function buildHistory(results: EnrichedResult[], exams: LabExam[]): History {
  const examDate = new Map(exams.map((e) => [e.id, e.collectedAt]))
  const byKey = new Map<string, Array<{ r: EnrichedResult; date: string }>>()
  for (const r of results) {
    if (r.value === undefined) continue
    const key = canonicalize(r.marker)?.key ?? r.marker.toLowerCase().trim()
    const date = examDate.get(r.examId) ?? ''
    const list = byKey.get(key) ?? []
    list.push({ r, date })
    byKey.set(key, list)
  }
  const out: History = new Map()
  for (const [key, list] of byKey) {
    list.sort((a, b) => b.date.localeCompare(a.date))
    const latest = list[0]
    const prev = list.find((x) => x.date < latest.date)
    out.set(key, {
      value: latest.r.value as number,
      unit: latest.r.unit ?? '',
      low: latest.r.low,
      high: latest.r.high,
      date: latest.date,
      prev: prev ? { value: prev.r.value as number, unit: prev.r.unit ?? '', date: prev.date } : undefined,
    })
  }
  return out
}

function get(h: History, ...keys: string[]): Reading | null {
  for (const k of keys) {
    const r = h.get(k)
    if (r) return r
  }
  return null
}

function trendOf(r: Reading): Trend | undefined {
  if (!r.prev || r.prev.unit.toLowerCase() !== r.unit.toLowerCase() || r.prev.value === 0) return undefined
  const pct = ((r.value - r.prev.value) / Math.abs(r.prev.value)) * 100
  return { pct, dir: Math.abs(pct) < 3 ? 'flat' : pct > 0 ? 'up' : 'down' }
}

function worst(...statuses: Status[]): Status {
  if (statuses.includes('bad')) return 'bad'
  if (statuses.includes('warn')) return 'warn'
  if (statuses.includes('good')) return 'good'
  return 'none'
}

function fmt(v: number, digits = 1) {
  return v % 1 === 0 ? String(v) : v.toFixed(digits)
}

// Status from the lab's own reference range, for markers without a curated rule.
function byRange(r: Reading): Status {
  if (r.low === undefined && r.high === undefined) return 'none'
  if (r.low !== undefined && r.value < r.low) return 'warn'
  if (r.high !== undefined && r.value > r.high) return 'warn'
  return 'good'
}

// Three-band status: good below a, warn below b, bad above. `invert` for markers where higher is better.
function bands(v: number, a: number, b: number, invert = false): Status {
  if (invert) return v >= a ? 'good' : v >= b ? 'warn' : 'bad'
  return v < a ? 'good' : v < b ? 'warn' : 'bad'
}

const u = (r: Reading) => r.unit.toLowerCase()
const show = (r: Reading) => `${fmt(r.value, 2)} ${r.unit}`.trim()

// ── Unit conversions (to one working unit per marker) ──────────────────────
const cholMmol = (r: Reading) => (/mg/.test(u(r)) || (!/mmol/.test(u(r)) && r.value > 20) ? r.value / 38.67 : r.value)
const tgMmol = (r: Reading) => (/mg/.test(u(r)) || (!/mmol/.test(u(r)) && r.value > 20) ? r.value / 88.57 : r.value)
const ttNgdl = (r: Reading) => (/nmol/.test(u(r)) || (!/ng/.test(u(r)) && r.value < 100) ? r.value * 28.84 : r.value)
const e2Pgml = (r: Reading) => (/pmol/.test(u(r)) ? r.value * 0.272 : r.value)
const ftPgml = (r: Reading) => (/nmol/.test(u(r)) ? r.value * 288.4 : /pmol/.test(u(r)) ? r.value * 0.2884 : /ng\/dl/.test(u(r)) ? r.value * 10 : r.value)
const prolNgml = (r: Reading) => (/miu|mu\/l/.test(u(r)) ? r.value / 21.2 : r.value)
const hgbGdl = (r: Reading) => (u(r) === 'g/l' || (!/dl/.test(u(r)) && r.value > 30) ? r.value / 10 : r.value)
const hctPct = (r: Reading) => (r.value < 1 ? r.value * 100 : r.value)
const creatMgdl = (r: Reading) => (/mol/.test(u(r)) || r.value > 25 ? r.value / 88.4 : r.value)
const glucoseMgdl = (r: Reading) => (/mmol/.test(u(r)) || r.value < 25 ? r.value * 18 : r.value)
const a1cPct = (r: Reading) => (/mmol/.test(u(r)) || r.value > 20 ? r.value / 10.929 + 2.15 : r.value)
const vitdNgml = (r: Reading) => (/nmol/.test(u(r)) ? r.value / 2.5 : r.value)
const b12Pgml = (r: Reading) => (/pmol/.test(u(r)) ? r.value * 1.355 : r.value)
const apobMgdl = (r: Reading) => (/g\/l/.test(u(r)) && !/mg/.test(u(r)) ? r.value * 100 : r.value)
const ferritinNgml = (r: Reading) => (/pmol/.test(u(r)) ? r.value / 2.247 : r.value) // µg/L == ng/mL

function pill(label: string, r: Reading, status: Status, display = show(r)): MarkerVal {
  return { label, display, status, trend: trendOf(r) }
}

// ── 1. Cardiovascular ──────────────────────────────────────────────────────
function buildCardio(h: History): CompositePanel {
  const tc = get(h, 'total_cholesterol'); const hdl = get(h, 'hdl'); const ldl = get(h, 'ldl'); const tg = get(h, 'triglycerides'); const apob = get(h, 'apob')
  const pills: MarkerVal[] = []
  const recs: CompositePanel['recommendations'] = []

  if (tc && hdl && hdl.value > 0) {
    const ratio = cholMmol(tc) / cholMmol(hdl)
    pills.push({ label: 'TC/HDL', display: fmt(ratio, 2), status: bands(ratio, 3.5, 5) })
  }
  if (tg && hdl && hdl.value > 0) {
    const aip = Math.log10(tgMmol(tg) / cholMmol(hdl))
    pills.push({ label: 'AIP', display: fmt(aip, 2), status: bands(aip, 0.11, 0.21) })
  }
  if (hdl) {
    const v = cholMmol(hdl)
    const s = bands(v, 1.3, 1.0, true)
    pills.push(pill('HDL', hdl, s))
    if (s !== 'good') recs.push({ text: 'Low HDL is common on AAS. Regular aerobic exercise, omega-3 (2 to 4 g EPA/DHA a day) and a lower AAS dose can help raise it.', source: 'AHA Lipid Guidelines' })
  }
  if (ldl) {
    const s = bands(cholMmol(ldl), 2.6, 3.4)
    pills.push(pill('LDL', ldl, s))
    if (s !== 'good') recs.push({ text: 'Raised LDL: plant sterols, soluble fiber (oats, psyllium) and, if it stays high, a conversation about statin therapy.', source: 'ESC/EAS Dyslipidaemia Guidelines' })
  }
  if (tg) pills.push(pill('TG', tg, bands(tgMmol(tg), 1.7, 2.3)))
  if (apob) {
    const s = bands(apobMgdl(apob), 90, 130)
    pills.push(pill('ApoB', apob, s))
    if (s === 'bad') recs.push({ text: 'ApoB counts the particles that actually cause plaque. Above 130 mg/dL, treat it like high LDL even if LDL looks fine.', source: 'ESC/EAS Dyslipidaemia Guidelines' })
  }

  if (pills.length === 0) pills.push({ label: 'No lipid data', display: '—', status: 'none' })
  const status = worst(...pills.map((p) => p.status))
  const note = status === 'bad'
    ? 'High cardiovascular risk. AAS commonly lowers HDL and raises LDL and AIP. Review the dose and add heart-protective habits.'
    : status === 'warn'
      ? 'Lipids need watching. Common on anabolics. Recheck every 3 months while on cycle.'
      : 'Lipids look healthy.'
  return { id: 'cardio', icon: Heart, label: 'Cardiovascular', status, pills, note, since: sinceOf(hdl, ldl, tc, tg), recommendations: recs }
}

// ── 2. Hormone balance ─────────────────────────────────────────────────────
function buildHormones(h: History): CompositePanel {
  const tt = get(h, 'total_testosterone'); const ft = get(h, 'free_testosterone'); const e2 = get(h, 'estradiol'); const shbg = get(h, 'shbg'); const prl = get(h, 'prolactin')
  const pills: MarkerVal[] = []
  const recs: CompositePanel['recommendations'] = []

  if (tt) pills.push(pill('Total T', tt, bands(ttNgdl(tt), 700, 400, true)))
  if (tt && e2 && e2.value > 0) {
    const ratio = ttNgdl(tt) / e2Pgml(e2)
    const s: Status = ratio >= 15 && ratio <= 30 ? 'good' : ratio >= 10 && ratio <= 50 ? 'warn' : 'bad'
    pills.push({ label: 'T:E2', display: fmt(ratio, 1), status: s })
    if (ratio < 10) recs.push({ text: 'Low T:E2 ratio means a lot of aromatization. Talk AI dosing through with your doctor and avoid over-correcting: crashed E2 feels worse than high E2.', source: 'Testosterone Therapy Guidelines' })
    if (ratio > 50) recs.push({ text: 'High T:E2 ratio. E2 may be too suppressed, often from an AI. Joint pain and low libido are the early signs. Reduce or pause the AI.', source: 'Testosterone Therapy Guidelines' })
  }
  if (e2) {
    const v = e2Pgml(e2)
    pills.push(pill('E2', e2, v >= 20 && v <= 40 ? 'good' : v > 60 || v < 15 ? 'bad' : 'warn'))
  }
  if (shbg) {
    const s: Status = shbg.value >= 20 && shbg.value <= 50 ? 'good' : 'warn'
    pills.push(pill('SHBG', shbg, s))
    if (shbg.value > 50) recs.push({ text: 'High SHBG binds up testosterone and lowers the free fraction. Boron (10 mg a day), more frequent injections and fewer carbs can bring it down.', source: 'NCBI: SHBG Modulation' })
  }
  if (ft) {
    const byLab = byRange(ft)
    const v = ftPgml(ft)
    pills.push(pill('Free T', ft, byLab !== 'none' ? (ft.high !== undefined && ft.value > ft.high ? 'good' : byLab) : bands(v, 15, 8, true)))
  }
  if (prl) {
    const s = bands(prolNgml(prl), 15, 25)
    pills.push(pill('Prolactin', prl, s))
    if (s === 'bad') recs.push({ text: 'High prolactin can blunt libido and erections, and 19-nor compounds (nandrolone, trenbolone) push it up. Recheck fasted and rested; a persistent rise deserves a doctor visit.', source: 'Endocrine Society Hyperprolactinemia Guideline' })
  }

  if (pills.length === 0) pills.push({ label: 'No hormone data', display: '—', status: 'none' })
  const status = worst(...pills.map((p) => p.status))
  const note = status === 'bad'
    ? 'Hormones are out of balance. Look at injection timing, AI dosing and SHBG.'
    : status === 'warn'
      ? 'Some hormone markers need attention. Weigh E2 symptoms against the numbers before changing anything.'
      : 'Hormones look balanced. The T:E2 ratio points to good aromatization control.'
  return { id: 'hormones', icon: Atom, label: 'Hormone balance', status, pills, note, since: sinceOf(tt, e2, ft), recommendations: recs }
}

// ── 3. Blood health ────────────────────────────────────────────────────────
function buildBlood(h: History): CompositePanel {
  const hct = get(h, 'hematocrit'); const hgb = get(h, 'hemoglobin'); const rbc = get(h, 'rbc'); const ferr = get(h, 'ferritin')
  const pills: MarkerVal[] = []
  const recs: CompositePanel['recommendations'] = []

  if (hct) {
    const pct = hctPct(hct)
    pills.push(pill('HCT', hct, bands(pct, 50, 52), `${fmt(pct, 1)}%`))
    if (pct >= 52) recs.push({ text: 'Hematocrit at 52% or more thickens the blood and raises clot risk. Donate blood or arrange a therapeutic phlebotomy, stay well hydrated, and discuss a lower TRT dose.', source: 'AUA/Endocrine Society TRT Guidelines' })
    else if (pct >= 50) recs.push({ text: 'Hematocrit is creeping up. Drink 3+ liters of water a day, go easy on red meat, and recheck monthly.', source: 'AUA TRT Guidelines' })
  }
  if (hgb) {
    const g = hgbGdl(hgb)
    pills.push(pill('Hgb', hgb, bands(g, 17.5, 18.5), `${fmt(g, 1)} g/dL`))
  }
  if (rbc) pills.push(pill('RBC', rbc, bands(rbc.value, 5.9, 6.5)))
  if (ferr) {
    const v = ferritinNgml(ferr)
    const s: Status = v >= 30 && v <= 300 ? 'good' : v < 15 || v > 500 ? 'bad' : 'warn'
    pills.push(pill('Ferritin', ferr, s))
    if (v < 30) recs.push({ text: 'Low ferritin often follows repeated blood donations on TRT. It costs you energy and training capacity. Check iron intake and space donations out.', source: 'BSH Iron Deficiency Guideline' })
  }

  if (pills.length === 0) pills.push({ label: 'No CBC data', display: '—', status: 'none' })
  const status = worst(...pills.map((p) => p.status))
  const note = status === 'bad'
    ? 'Erythrocytosis risk. Hematocrit above 52% is the usual trigger for therapeutic phlebotomy on TRT.'
    : status === 'warn'
      ? 'Blood count is drifting. Keep an eye on it and stay hydrated.'
      : 'Blood count is in the safe zone. TRT-driven red-cell production looks controlled.'
  return { id: 'blood', icon: Droplet, label: 'Blood health', status, pills, note, since: sinceOf(hct, hgb), recommendations: recs }
}

// ── 4. Liver ───────────────────────────────────────────────────────────────
function buildLiver(h: History): CompositePanel {
  const alt = get(h, 'alt'); const ast = get(h, 'ast'); const ggt = get(h, 'ggt'); const ck = get(h, 'creatine_kinase')
  const pills: MarkerVal[] = []
  const recs: CompositePanel['recommendations'] = []
  const ULN = 40
  const muscleSource = !!ck && ck.value > 200 && (!ggt || ggt.value < 50)

  if (alt) pills.push(pill('ALT', alt, muscleSource ? 'warn' : bands(alt.value / ULN, 1, 3)))
  if (ast) pills.push(pill('AST', ast, muscleSource ? 'warn' : bands(ast.value / ULN, 1, 3)))
  if (ggt) pills.push(pill('GGT', ggt, bands(ggt.value / 50, 1, 3)))
  if (ck) pills.push(pill('CK', ck, bands(ck.value, 200, 1000)))

  if (pills.length === 0) pills.push({ label: 'No liver data', display: '—', status: 'none' })
  const rawStatus = worst(...pills.filter((p) => p.label !== 'CK').map((p) => p.status))
  const status: Status = muscleSource ? 'warn' : rawStatus
  const note = muscleSource
    ? 'ALT and AST are up while GGT is normal and CK is high: that pattern is muscle breakdown from training, not liver damage.'
    : rawStatus === 'bad'
      ? 'Liver enzymes are well above normal. If you take oral steroids, stop and retest in 2 weeks. Above 5 times the upper limit, see a hepatologist.'
      : rawStatus === 'warn'
        ? 'Mild enzyme rise. Watch it closely on orals. GGT is what separates a true liver cause from training soreness.'
        : 'Liver enzymes are normal.'
  if (!muscleSource && rawStatus !== 'good') recs.push({ text: 'Cut back on or drop oral 17-alpha-alkylated steroids. TUDCA (500 to 1000 mg a day) and NAC (600 mg a day) have supporting evidence for liver protection during AAS use.', source: 'NCBI: Liver Injury from AAS' })
  return { id: 'liver', icon: Activity, label: 'Liver', status, pills, note, since: sinceOf(alt, ast), recommendations: recs }
}

// ── 5. Kidney ──────────────────────────────────────────────────────────────
function buildKidney(h: History): CompositePanel {
  const cr = get(h, 'creatinine'); const egfr = get(h, 'egfr'); const cys = get(h, 'cystatin_c')
  const pills: MarkerVal[] = []
  const recs: CompositePanel['recommendations'] = []

  if (cr) pills.push(pill('Creatinine', cr, bands(creatMgdl(cr), 1.3, 1.5)))
  if (egfr) pills.push(pill('eGFR', egfr, bands(egfr.value, 90, 60, true)))
  if (cys) pills.push(pill('Cystatin C', cys, bands(cys.value, 1.0, 1.2)))

  if (pills.length === 0) pills.push({ label: 'No kidney data', display: '—', status: 'none' })
  const status = worst(...pills.map((p) => p.status))
  const muscleNote = cr && !cys ? ' Creatinine tracks muscle mass and creatine supplements, so a mild rise in a big, supplemented lifter is often not a kidney problem. Cystatin C is the cleaner test.' : ''
  const note = status === 'bad'
    ? 'Kidney markers are outside the safe range. Retest well hydrated, off creatine for a week, and see a doctor if it holds.' + muscleNote
    : status === 'warn'
      ? 'Kidney markers are a little off.' + muscleNote
      : 'Kidney function looks normal.'
  if (status !== 'good' && cr && !cys) recs.push({ text: 'Ask for cystatin C next time. It estimates kidney filtration without being skewed by muscle mass or creatine.', source: 'KDIGO CKD Guideline' })
  return { id: 'kidney', icon: Filter, label: 'Kidney', status, pills, note, since: sinceOf(cr, egfr), recommendations: recs }
}

// ── 6. Metabolic ───────────────────────────────────────────────────────────
function buildMetabolic(h: History): CompositePanel {
  const glu = get(h, 'glucose'); const a1c = get(h, 'hba1c'); const ins = get(h, 'insulin'); const homa = get(h, 'homa_ir')
  const pills: MarkerVal[] = []
  const recs: CompositePanel['recommendations'] = []

  if (glu) pills.push(pill('Glucose', glu, bands(glucoseMgdl(glu), 100, 126)))
  if (a1c) pills.push(pill('HbA1c', a1c, bands(a1cPct(a1c), 5.7, 6.5)))
  if (ins) pills.push(pill('Insulin', ins, bands(ins.value, 10, 15)))
  const homaVal = homa ? homa.value : glu && ins ? (glucoseMgdl(glu) * ins.value) / 405 : undefined
  if (homaVal !== undefined) pills.push({ label: 'HOMA-IR', display: fmt(homaVal, 2), status: bands(homaVal, 1.5, 2.5), trend: homa ? trendOf(homa) : undefined })

  if (pills.length === 0) pills.push({ label: 'No metabolic data', display: '—', status: 'none' })
  const status = worst(...pills.map((p) => p.status))
  const note = status === 'bad'
    ? 'Blood sugar control is off. Growth hormone, peptides and some orals worsen insulin resistance. Worth a proper diabetes screen.'
    : status === 'warn'
      ? 'Early insulin resistance signs. More steps, fewer refined carbs, and recheck in 3 months.'
      : 'Blood sugar and insulin look healthy.'
  if (status !== 'good') recs.push({ text: 'Walking after meals, resistance training and 25+ g of fiber a day all improve insulin sensitivity within weeks.', source: 'ADA Standards of Care' })
  return { id: 'metabolic', icon: Flame, label: 'Metabolic', status, pills, note, since: sinceOf(glu, a1c), recommendations: recs }
}

// ── 7. Thyroid ─────────────────────────────────────────────────────────────
function buildThyroid(h: History): CompositePanel {
  const tsh = get(h, 'tsh'); const ft4 = get(h, 'free_t4'); const ft3 = get(h, 'free_t3')
  const pills: MarkerVal[] = []
  if (tsh) pills.push(pill('TSH', tsh, tsh.value >= 0.4 && tsh.value <= 2.5 ? 'good' : tsh.value < 0.1 || tsh.value > 4.5 ? 'bad' : 'warn'))
  if (ft4) pills.push(pill('Free T4', ft4, byRange(ft4)))
  if (ft3) pills.push(pill('Free T3', ft3, byRange(ft3)))
  if (pills.length === 0) pills.push({ label: 'No thyroid data', display: '—', status: 'none' })
  const status = worst(...pills.map((p) => p.status))
  const note = status === 'bad'
    ? 'Thyroid is clearly off. Fatigue, fat gain or a racing heart fit the picture. See a doctor before adding anything.'
    : status === 'warn'
      ? 'Thyroid is slightly off. Heavy dieting and some fat burners suppress it; recheck once you are eating normally.'
      : 'Thyroid looks normal.'
  return { id: 'thyroid', icon: Pill, label: 'Thyroid', status, pills, note, since: sinceOf(tsh), recommendations: [] }
}

// ── 8. Vitamins ────────────────────────────────────────────────────────────
function buildVitamins(h: History): CompositePanel {
  const d = get(h, 'vitamin_d'); const b12 = get(h, 'vitamin_b12'); const fol = get(h, 'folate')
  const pills: MarkerVal[] = []
  const recs: CompositePanel['recommendations'] = []
  if (d) {
    const v = vitdNgml(d)
    const s: Status = v >= 40 && v <= 80 ? 'good' : v < 20 || v > 100 ? 'bad' : 'warn'
    pills.push(pill('Vit D', d, s))
    if (v < 40) recs.push({ text: 'Vitamin D below 40 ng/mL (100 nmol/L). 2000 to 4000 IU a day with a meal usually gets there in 2 to 3 months.', source: 'Endocrine Society Vitamin D Guideline' })
  }
  if (b12) pills.push(pill('B12', b12, bands(b12Pgml(b12), 400, 200, true)))
  if (fol) pills.push(pill('Folate', fol, byRange(fol)))
  if (pills.length === 0) pills.push({ label: 'No vitamin data', display: '—', status: 'none' })
  const status = worst(...pills.map((p) => p.status))
  const note = status === 'good' ? 'Vitamin levels look good.' : 'A vitamin level is short. Cheap to fix and it shows up in energy and recovery.'
  return { id: 'vitamins', icon: Sun, label: 'Vitamins', status, pills, note, since: sinceOf(d, b12), recommendations: recs }
}

// ── 9. HPTA status ─────────────────────────────────────────────────────────
function buildHpta(h: History): CompositePanel {
  const lh = get(h, 'lh'); const fsh = get(h, 'fsh')
  const pills: MarkerVal[] = []
  const recs: CompositePanel['recommendations'] = []
  if (lh) pills.push(pill('LH', lh, lh.value < 2 ? 'warn' : lh.value > 10 ? 'bad' : 'good'))
  if (fsh) pills.push(pill('FSH', fsh, fsh.value < 2 ? 'warn' : fsh.value > 10 ? 'bad' : 'good'))
  if (pills.length === 0) pills.push({ label: 'No LH/FSH data', display: '—', status: 'none' })
  const status = worst(...pills.map((p) => p.status))
  const bothSuppressed = !!lh && !!fsh && lh.value < 2 && fsh.value < 2
  const note = bothSuppressed
    ? 'Full HPTA suppression, expected on TRT or a cycle. Your own production is switched off. Plan PCT if you come off.'
    : status === 'bad'
      ? 'Very high LH and FSH can mean the testes are not responding to the signal (primary hypogonadism). Worth an endocrinology visit.'
      : status === 'good'
        ? 'LH and FSH are in range, so either you are not suppressed or you are recovering after a cycle.'
        : 'Partial suppression, or not enough data.'
  if (bothSuppressed) recs.push({ text: 'If you plan PCT after a cycle: HCG (500 IU every other day for 3 weeks) then Clomid (25 to 50 mg a day for 4 to 6 weeks) or Nolvadex (20 to 40 mg a day for 4 to 6 weeks) is a common recovery protocol.', source: "HPTA Recovery Protocols, Men's Health Forum" })
  return { id: 'hpta', icon: Brain, label: 'HPTA status', status, pills, note, since: sinceOf(lh, fsh), recommendations: recs }
}

// ── 10. Prostate & inflammation ────────────────────────────────────────────
function buildProstateInflammation(h: History): CompositePanel {
  const psa = get(h, 'psa'); const crp = get(h, 'crp'); const hcy = get(h, 'homocysteine')
  const pills: MarkerVal[] = []
  const recs: CompositePanel['recommendations'] = []
  if (psa) {
    const s = bands(psa.value, 2.5, 4)
    pills.push(pill('PSA', psa, s))
    const t = trendOf(psa)
    if (s !== 'good' || (t && psa.prev && psa.value - psa.prev.value > 1.4)) recs.push({ text: 'PSA above 4, or a rise of more than 1.4 ng/mL within a year on TRT, calls for a urology check. Skip cycling and sex for 48 hours before a retest.', source: 'AUA Testosterone Deficiency Guideline' })
  }
  if (crp) pills.push(pill('hs-CRP', crp, bands(crp.value, 1, 3)))
  if (hcy) pills.push(pill('Homocysteine', hcy, bands(hcy.value, 10, 15)))
  if (pills.length === 0) pills.push({ label: 'No data', display: '—', status: 'none' })
  const status = worst(...pills.map((p) => p.status))
  const note = status === 'bad'
    ? 'A marker here is high enough to act on. See the note below.'
    : status === 'warn'
      ? 'Mild inflammation or a PSA to keep an eye on. Hard training in the days before a draw pushes CRP up.'
      : 'Inflammation and PSA look fine.'
  return { id: 'prostate', icon: Heart, label: 'Prostate & inflammation', status, pills, note, since: sinceOf(psa, crp), recommendations: recs }
}

function sinceOf(...readings: Array<Reading | null>): string | undefined {
  for (const r of readings) if (r?.prev) return r.prev.date
  return undefined
}

// ── Status styling ─────────────────────────────────────────────────────────
const STATUS_BORDER: Record<Status, string> = { good: 'border-l-emerald-500', warn: 'border-l-amber-500', bad: 'border-l-destructive', none: 'border-l-border' }
const STATUS_TEXT: Record<Status, string> = { good: 'text-emerald-700 dark:text-emerald-400', warn: 'text-amber-700 dark:text-amber-400', bad: 'text-destructive', none: 'text-muted-foreground' }
const STATUS_BADGE: Record<Status, string> = { good: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400', warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', bad: 'bg-destructive/12 text-destructive', none: 'bg-secondary text-muted-foreground' }
const STATUS_LABEL: Record<Status, string> = { good: 'Good', warn: 'Monitor', bad: 'Action', none: 'No data' }
const STATUS_CHIP: Record<Status, string> = { good: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400', warn: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', bad: 'bg-destructive/12 text-destructive', none: 'bg-muted text-muted-foreground' }

function TrendTag({ t }: { t: Trend }) {
  if (t.dir === 'flat') return <span className="text-[10px] text-muted-foreground" title="About the same as your last test">≈</span>
  const glyph = t.dir === 'up' ? '▲' : '▼'
  return (
    <span className="text-[10px] text-muted-foreground" title={`${t.dir === 'up' ? 'Up' : 'Down'} ${Math.abs(t.pct).toFixed(0)}% since your last test`}>
      {glyph}{Math.abs(t.pct).toFixed(0)}%
    </span>
  )
}

function CompositeRow({ panel, expanded, onToggle, first }: { panel: CompositePanel; expanded: boolean; onToggle: () => void; first: boolean }) {
  const hasDetail = Boolean(panel.note) || panel.recommendations.length > 0
  return (
    <div className={cn('border-l pl-3.5', STATUS_BORDER[panel.status], !first && 'mt-3')}>
      <button type="button" className="flex w-full flex-col gap-1.5 text-left" onClick={hasDetail ? onToggle : undefined} aria-expanded={expanded}>
        <span className="flex items-center gap-2">
          <span className={cn('grid size-7 shrink-0 place-items-center rounded-md', STATUS_CHIP[panel.status])}>
            <panel.icon className="size-3.5" />
          </span>
          <span className="text-sm font-medium">{panel.label}</span>
          <Badge variant="secondary" className={cn('ml-auto px-2 text-[10px] font-semibold', STATUS_BADGE[panel.status])}>
            {STATUS_LABEL[panel.status]}
          </Badge>
          {hasDetail && (
            <span className="text-muted-foreground" aria-hidden>
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </span>
          )}
        </span>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {panel.pills.map((p) => (
            <span key={p.label} className="flex items-baseline gap-1.5 font-mono text-xs tabular-nums">
              <span className="text-muted-foreground">{p.label}</span>
              <span className={cn('font-medium', STATUS_TEXT[p.status])}>{p.display}</span>
              {p.trend && <TrendTag t={p.trend} />}
            </span>
          ))}
        </span>
      </button>

      {expanded && hasDetail && (
        <div className="mt-2 flex flex-col gap-2 pb-1">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {panel.note}
            {panel.since && <> Arrows compare with your test from {new Date(panel.since).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.</>}
          </p>
          {panel.recommendations.map((rec, i) => (
            <div key={i} className="rounded-md bg-muted/60 px-3 py-2">
              <p className="text-xs leading-relaxed">{rec.text}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">Source: {rec.source}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function LabComposites({ results, exams }: { results: EnrichedResult[]; exams: LabExam[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const panels = useMemo(() => {
    if (results.length === 0) return []
    const h = buildHistory(results, exams)
    return [
      buildCardio(h),
      buildHormones(h),
      buildBlood(h),
      buildLiver(h),
      buildKidney(h),
      buildMetabolic(h),
      buildThyroid(h),
      buildVitamins(h),
      buildHpta(h),
      buildProstateInflammation(h),
    ].filter((p) => p.status !== 'none')
  }, [results, exams])

  if (panels.length === 0) return null

  const actionCount = panels.filter((p) => p.status === 'bad').length
  const monitorCount = panels.filter((p) => p.status === 'warn').length

  return (
    <PanelCard
      className="h-full"
      title="Composites"
      subtitle="Smart analysis"
      action={
        <span className="flex gap-1.5">
          {actionCount > 0 && <Badge variant="secondary" className={STATUS_BADGE.bad}>{actionCount} action</Badge>}
          {monitorCount > 0 && <Badge variant="secondary" className={STATUS_BADGE.warn}>{monitorCount} monitor</Badge>}
        </span>
      }
    >
      {panels.map((panel, i) => (
        <CompositeRow key={panel.id} panel={panel} first={i === 0} expanded={expanded === panel.id} onToggle={() => setExpanded(expanded === panel.id ? null : panel.id)} />
      ))}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Reads your latest results with TRT-aware thresholds. It is a second opinion for your own reading, not medical advice.
      </p>
    </PanelCard>
  )
}
