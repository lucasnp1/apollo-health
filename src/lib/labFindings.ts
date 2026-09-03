/**
 * labFindings: reads a blood panel the way an experienced TRT user would and
 * writes it down in sentences. Each panel (lipids, hormones, blood count, liver,
 * kidney, metabolic, thyroid, vitamins, HPTA, prostate and inflammation) gets a
 * verdict, a short story that ties the numbers together, the probable causes on
 * a protocol, and what people usually do about it. Unit-aware (UK mmol/L and US
 * mg/dL both work) and compares with the previous test. Not medical advice; the
 * UI (components/LabAnalysis.tsx) says so at the top.
 */

import { useMemo } from 'react'
import type { LabExam } from './db'
import { canonicalize } from './markers'
import type { EnrichedResult } from './insights'
import { Activity, Atom, Brain, Droplet, Flame, Filter, Heart, Pill, ShieldAlert, Sun, type LucideIcon } from 'lucide-react'

export type Status = 'good' | 'warn' | 'bad' | 'none'
export type Trend = { pct: number; dir: 'up' | 'down' | 'flat' }
export type MarkerVal = { label: string; display: string; status: Status; trend?: Trend }

export type Finding = {
  id: string
  icon: LucideIcon
  label: string
  status: Status
  /** One line under the title: the verdict in plain words. */
  headline: string
  /** The numbers, with a tone each, for the facts row. */
  markers: MarkerVal[]
  /** Two to four sentences that tie the numbers together. */
  story: string
  /** Why this usually happens to someone on a protocol. */
  causes: string[]
  /** What people in TRT circles usually do about it. Common practice, not advice. */
  practices: string[]
  since?: string
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

function mark(label: string, r: Reading, status: Status, display = show(r)): MarkerVal {
  return { label, display, status, trend: trendOf(r) }
}

// ── Sentence helpers ───────────────────────────────────────────────────────
function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
function monthOf(iso?: string): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toLocaleDateString(undefined, { month: 'long' })
}
// "up 17% since June" / "down 8% since your last test" / "about where it was in June"
function movedText(r: Reading | null): string {
  const t = r ? trendOf(r) : undefined
  if (!r || !t) return ''
  const when = monthOf(r.prev?.date)
  const since = when ? `since ${when}` : 'since your last test'
  if (t.dir === 'flat') return `about where it was ${when ? `in ${when}` : 'last time'}`
  return `${t.dir === 'up' ? 'up' : 'down'} ${Math.abs(t.pct).toFixed(0)}% ${since}`
}
function sinceOf(...readings: Array<Reading | null>): string | undefined {
  for (const r of readings) if (r?.prev) return r.prev.date
  return undefined
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ── 1. Cardiovascular ──────────────────────────────────────────────────────
function buildCardio(h: History): Finding {
  const tc = get(h, 'total_cholesterol'); const hdl = get(h, 'hdl'); const ldl = get(h, 'ldl'); const tg = get(h, 'triglycerides'); const apob = get(h, 'apob')
  const markers: MarkerVal[] = []
  const bits: string[] = []
  let ratioStatus: Status = 'none'

  if (tc && hdl && hdl.value > 0) {
    const ratio = cholMmol(tc) / cholMmol(hdl)
    ratioStatus = bands(ratio, 3.5, 5)
    markers.push({ label: 'TC/HDL', display: fmt(ratio, 2), status: ratioStatus })
    bits.push(`Total cholesterol to HDL is ${fmt(ratio, 1)}: ${ratio < 3.5 ? 'under the 3.5 people aim for, which is the single best number on this panel' : ratio < 5 ? 'above the 3.5 people aim for but under the 5 risk line' : 'over the 5 risk line, and this ratio predicts heart risk better than LDL alone'}.`)
  }
  let hdlS: Status = 'none'
  let ldlS: Status = 'none'
  if (hdl) { hdlS = bands(cholMmol(hdl), 1.3, 1.0, true); markers.push(mark('HDL', hdl, hdlS)) }
  if (ldl) { ldlS = bands(cholMmol(ldl), 2.6, 3.4); markers.push(mark('LDL', ldl, ldlS)) }
  if (ldl && hdl) {
    const lm = movedText(ldl); const hm = movedText(hdl)
    const pattern = trendOf(ldl)?.dir === 'up' && trendOf(hdl)?.dir === 'down'
    bits.push(`LDL is ${show(ldl)}${lm ? `, ${lm}` : ''}, and HDL is ${show(hdl)}${hm ? `, ${hm}` : ''}.${pattern ? ' LDL climbing while HDL falls is the classic pattern on testosterone and especially on orals; the ratio gets hit from both ends.' : hdlS !== 'good' ? ' Low HDL is the lipid that androgens hit hardest and it drags the ratio up on its own.' : ''}`)
  } else if (ldl) {
    bits.push(`LDL is ${show(ldl)}${movedText(ldl) ? `, ${movedText(ldl)}` : ''}.`)
  } else if (hdl) {
    bits.push(`HDL is ${show(hdl)}${movedText(hdl) ? `, ${movedText(hdl)}` : ''}.`)
  }
  if (tg && hdl && hdl.value > 0) {
    const aip = Math.log10(tgMmol(tg) / cholMmol(hdl))
    const s = bands(aip, 0.11, 0.21)
    markers.push({ label: 'AIP', display: fmt(aip, 2), status: s })
    bits.push(`Triglycerides ${show(tg)} against HDL give an atherogenic index of ${fmt(aip, 2)} (${s === 'good' ? 'low risk' : s === 'warn' ? 'medium risk' : 'high risk'}).`)
  } else if (tg) {
    markers.push(mark('TG', tg, bands(tgMmol(tg), 1.7, 2.3)))
  }
  if (tg && !(hdl && hdl.value > 0)) { /* TG already added above */ } else if (tg) { markers.push(mark('TG', tg, bands(tgMmol(tg), 1.7, 2.3))) }
  if (apob) {
    const s = bands(apobMgdl(apob), 90, 130)
    markers.push(mark('ApoB', apob, s))
    if (s !== 'good') bits.push(`ApoB ${show(apob)} counts the particles that actually build plaque, so treat it like a high LDL even when LDL looks fine.`)
  }

  const status = worst(ratioStatus, hdlS, ldlS, ...markers.map((m) => m.status))
  const headline = status === 'bad' ? 'Lipids are in the risk zone' : status === 'warn' ? 'Lipids are drifting the wrong way' : status === 'good' ? 'Lipids look healthy' : 'No lipid data yet'
  const causes = status === 'good' ? [] : [
    'A higher testosterone dose, or a recent increase. Lipids follow the dose within a few weeks.',
    'Any oral (Anavar, Winstrol, Dianabol, Superdrol) or a 19-nor such as trenbolone: these crush HDL hardest.',
    'An aromatase inhibitor pushing estradiol low. E2 is what keeps HDL up in men.',
    'A bulk in progress, more saturated fat, alcohol, or simply not much cardio.',
  ]
  const practices = status === 'good' ? [] : [
    'Drop or shorten the oral. HDL usually comes back within 6 to 8 weeks of stopping.',
    'Zone-2 cardio three or four times a week. Lipids respond to it faster than to any supplement.',
    'Omega-3 fish oil (2 to 4 g of EPA and DHA a day) and soluble fibre from psyllium or oats.',
    'Citrus bergamot extract is the go-to supplement in TRT circles for LDL and the ratio; some use red yeast rice, which works like a mild statin. A doctor can prescribe the real thing if it stays high.',
    'If an AI has E2 crashed, easing it usually lifts HDL on the next test.',
  ]
  return { id: 'cardio', icon: Heart, label: 'Cardiovascular', status, headline, markers, story: bits.join(' '), causes, practices, since: sinceOf(hdl, ldl, tc, tg) }
}

// ── 2. Hormone balance ─────────────────────────────────────────────────────
function buildHormones(h: History): Finding {
  const tt = get(h, 'total_testosterone'); const ft = get(h, 'free_testosterone'); const e2 = get(h, 'estradiol'); const shbg = get(h, 'shbg'); const prl = get(h, 'prolactin')
  const markers: MarkerVal[] = []
  const bits: string[] = []
  const causes: string[] = []
  const practices: string[] = []

  if (tt) {
    const s = bands(ttNgdl(tt), 700, 400, true)
    markers.push(mark('Total T', tt, s))
    const aboveLab = tt.high !== undefined && tt.value > tt.high
    bits.push(`Total testosterone is ${show(tt)}${movedText(tt) ? `, ${movedText(tt)}` : ''}. ${aboveLab ? 'Above the lab range is normal on TRT; what matters is how the rest of the panel responds to it.' : s === 'good' ? 'That is a solid TRT level.' : 'That is on the low side for someone on a protocol; timing of the draw against the injection matters a lot here.'}`)
  }
  // Judged on the rounded ratio so the wording never contradicts the number shown.
  let ratio: number | undefined
  if (tt && e2 && e2.value > 0) {
    ratio = Math.round(ttNgdl(tt) / e2Pgml(e2))
    const s: Status = ratio >= 15 && ratio <= 30 ? 'good' : ratio >= 10 && ratio <= 50 ? 'warn' : 'bad'
    markers.push({ label: 'T:E2', display: String(ratio), status: s })
  }
  if (e2) {
    const v = e2Pgml(e2)
    const s: Status = v >= 20 && v <= 40 ? 'good' : v > 60 || v < 15 ? 'bad' : 'warn'
    markers.push(mark('E2', e2, s))
    const r = ratio !== undefined ? ` The testosterone to estradiol ratio is ${ratio}: ${ratio >= 15 && ratio <= 30 ? 'right in the 15 to 30 band people aim for, so aromatisation is under control' : ratio < 15 ? 'below 15, which means a good share of the testosterone is turning into estradiol' : 'above 30, which means estradiol is being held low relative to the testosterone'}.` : ''
    bits.push(`Estradiol is ${show(e2)}${movedText(e2) ? `, ${movedText(e2)}` : ''}, ${v > 40 ? 'on the high side' : v < 20 ? 'on the low side' : 'in the range where most men feel best'}.${r}`)
    if (v > 40) {
      causes.push('A bigger weekly dose or fewer, larger injections: the peaks are what aromatise.', 'Higher body fat, which carries more aromatase.', 'Alcohol in the days before the draw.')
      practices.push('Split the weekly dose into two or three injections to flatten the peaks; that alone often brings E2 down.', 'Most people treat the symptoms (water, moodiness, sore nipples), not the number. If there are none, they leave it alone.', 'DIM and calcium-D-glucarate are the soft options people try; a low dose of an aromatase inhibitor is the hard one, and crashed E2 feels worse than high E2.')
    } else if (v < 20) {
      causes.push('An aromatase inhibitor that is too strong or too frequent. This is the usual cause by a mile.', 'Very low body fat or a hard diet.')
      practices.push('Reduce or pause the AI and retest in three to four weeks. Joint pain, flat mood and low libido are the tells of crashed E2.', 'People on TRT rarely need an AI at all once the dose is split across the week.')
    }
  }
  if (shbg) {
    const s: Status = shbg.value >= 20 && shbg.value <= 50 ? 'good' : 'warn'
    markers.push(mark('SHBG', shbg, s))
    bits.push(`SHBG is ${show(shbg)}: ${shbg.value < 20 ? 'low, so more of the total is free and active, and estradiol swings hit harder' : shbg.value > 50 ? 'high, so it binds up testosterone and the free fraction runs lower than the total suggests' : 'in the normal band, so total and free testosterone tell the same story'}.`)
    if (shbg.value > 50) {
      causes.push('Low insulin and low carbs, thyroid running high, age, or simply genetics.')
      practices.push('For high SHBG people use boron (10 mg a day) and inject more often; more carbs and a bit more body fat also bring it down.')
    } else if (shbg.value < 20) {
      causes.push('Insulin resistance, a high dose, or orals; all three push SHBG down.')
    }
  }
  if (ft) {
    const byLab = byRange(ft)
    const v = ftPgml(ft)
    const s = byLab !== 'none' ? (ft.high !== undefined && ft.value > ft.high ? 'good' : byLab) : bands(v, 15, 8, true)
    markers.push(mark('Free T', ft, s))
    bits.push(`Free testosterone is ${show(ft)}${movedText(ft) ? `, ${movedText(ft)}` : ''}${ft.high !== undefined && ft.value > ft.high ? ', above the lab range, which on TRT is the point' : s === 'good' ? ', where it should be' : ', a bit low for the total; see SHBG'}.`)
  }
  if (prl) {
    const s = bands(prolNgml(prl), 15, 25)
    markers.push(mark('Prolactin', prl, s))
    if (s !== 'good') {
      bits.push(`Prolactin is ${show(prl)}, ${s === 'bad' ? 'clearly high' : 'a little high'}. It blunts libido and erections when it climbs.`)
      causes.push('19-nor compounds (nandrolone, trenbolone) push prolactin up.', 'Stress, poor sleep, or an orgasm in the hours before the draw.')
      practices.push('Retest fasted, rested and without sex the night before. If it holds, people on 19-nors use P5P (vitamin B6) as the soft fix and cabergoline through a doctor as the hard one.')
    }
  }

  const status = worst(...markers.map((m) => m.status))
  const headline = status === 'bad' ? 'Hormones are out of balance' : status === 'warn' ? 'One hormone marker is off' : status === 'good' ? 'Hormones sit where a TRT user wants them' : 'No hormone data yet'
  if (status === 'good' && practices.length === 0) practices.push('Nothing to change. Keep the draw at the same point in the injection cycle each time so tests compare like for like.')
  return { id: 'hormones', icon: Atom, label: 'Hormone balance', status, headline, markers, story: bits.join(' '), causes, practices, since: sinceOf(tt, e2, ft) }
}

// ── 3. Blood health ────────────────────────────────────────────────────────
function buildBlood(h: History): Finding {
  const hct = get(h, 'hematocrit'); const hgb = get(h, 'hemoglobin'); const rbc = get(h, 'rbc'); const ferr = get(h, 'ferritin')
  const markers: MarkerVal[] = []
  const bits: string[] = []
  const causes: string[] = []
  const practices: string[] = []

  let pct: number | undefined
  if (hct) {
    pct = hctPct(hct)
    const s = bands(pct, 50, 52)
    markers.push(mark('HCT', hct, s, `${fmt(pct, 1)}%`))
    bits.push(`Hematocrit is ${fmt(pct, 1)}%${movedText(hct) ? `, ${movedText(hct)}` : ''}. ${pct >= 52 ? 'Over 52% the blood is thick enough that clot risk goes up, and it is the line where doctors usually order a phlebotomy.' : pct >= 50 ? 'Under the 52% action line but creeping towards it; a couple more points and it becomes a problem.' : 'Under 50%, which is the comfortable zone on testosterone.'}`)
  }
  if (hgb) {
    const g = hgbGdl(hgb)
    markers.push(mark('Hgb', hgb, bands(g, 17.5, 18.5), `${fmt(g, 1)} g/dL`))
    if (g >= 17.5) bits.push(`Hemoglobin ${fmt(g, 1)} g/dL is moving with it, which says this is more red cells, not just less water.`)
  }
  if (rbc) markers.push(mark('RBC', rbc, bands(rbc.value, 5.9, 6.5)))
  if (ferr) {
    const v = ferritinNgml(ferr)
    const s: Status = v >= 30 && v <= 300 ? 'good' : v < 15 || v > 500 ? 'bad' : 'warn'
    markers.push(mark('Ferritin', ferr, s))
    if (v < 30) {
      bits.push(`Ferritin is ${show(ferr)}, low. That is usually the price of repeated donations, and it shows up as flat energy and poor recovery.`)
      causes.push('Donating blood too often to hold hematocrit down.')
      practices.push('Space donations at least eight weeks apart and take iron with vitamin C between them; do not donate on a low ferritin.')
    } else if (movedText(ferr).startsWith('down')) {
      bits.push(`Ferritin ${show(ferr)} is ${movedText(ferr)}, which fits with a donation in between.`)
    }
  }

  if (pct !== undefined && pct >= 50) {
    causes.push('Testosterone drives red-cell production, more so at higher doses and with injections that peak high.', 'A draw taken near the injection peak, or slightly dehydrated (hematocrit is a concentration).', 'Sleep apnea, smoking and altitude all add to it.')
    practices.push(pct >= 52 ? 'Donate blood, or ask for a therapeutic phlebotomy. Most people drop three to four points from one donation.' : 'Retest at trough, well hydrated, before doing anything; a lot of "high" hematocrits are a dry draw day.', 'Drink more water the day before the draw and test at the trough, not the peak.', 'Smaller, more frequent injections lower the peaks that drive it.', 'Grapefruit juice (naringin) and nattokinase circulate as bro-science fixes; neither has solid evidence.')
  }

  const status = worst(...markers.map((m) => m.status))
  const headline = status === 'bad' ? 'Blood is getting thick' : status === 'warn' ? 'Red-cell count is creeping up' : status === 'good' ? 'Blood count is in the safe zone' : 'No blood count data yet'
  return { id: 'blood', icon: Droplet, label: 'Blood health', status, headline, markers, story: bits.join(' '), causes, practices, since: sinceOf(hct, hgb) }
}

// ── 4. Liver ───────────────────────────────────────────────────────────────
function buildLiver(h: History): Finding {
  const alt = get(h, 'alt'); const ast = get(h, 'ast'); const ggt = get(h, 'ggt'); const ck = get(h, 'creatine_kinase')
  const markers: MarkerVal[] = []
  const ULN = 40
  const muscleSource = !!ck && ck.value > 200 && (!ggt || ggt.value < 50)

  if (alt) markers.push(mark('ALT', alt, muscleSource ? 'warn' : bands(alt.value / ULN, 1, 3)))
  if (ast) markers.push(mark('AST', ast, muscleSource ? 'warn' : bands(ast.value / ULN, 1, 3)))
  if (ggt) markers.push(mark('GGT', ggt, bands(ggt.value / 50, 1, 3)))
  if (ck) markers.push(mark('CK', ck, bands(ck.value, 200, 1000)))

  const rawStatus = worst(...markers.filter((m) => m.label !== 'CK').map((m) => m.status))
  const status: Status = muscleSource ? 'warn' : rawStatus
  const bits: string[] = []
  const causes: string[] = []
  const practices: string[] = []
  if (muscleSource) {
    bits.push('ALT and AST are up while GGT is normal and CK is high. That pattern is muscle breakdown from training, not the liver; the enzymes leak from sore muscle too.')
    practices.push('No hard training for 48 hours before the next draw, so the enzymes mean something.')
  } else if (markers.length > 0) {
    const parts: string[] = []
    if (alt) parts.push(`ALT ${show(alt)} is ${alt.value > ULN ? `${fmt(alt.value / ULN, 1)} times the upper limit` : 'within limits'}${movedText(alt) ? `, ${movedText(alt)}` : ''}`)
    if (ast) parts.push(`AST ${show(ast)} is ${ast.value > ULN ? 'high' : 'normal'}`)
    if (ggt) parts.push(`GGT ${show(ggt)} is ${ggt.value > 50 ? 'high' : 'normal'}`)
    bits.push(`${cap(list(parts))}.`)
    if (rawStatus !== 'good') {
      bits.push(ggt && ggt.value <= 50
        ? 'GGT is the marker that separates a true liver cause from training soreness, and it is normal here, so a hard session in the two days before the draw is the most likely explanation.'
        : 'GGT rising along with ALT points at the liver itself rather than training.')
      causes.push('Oral 17-alpha-alkylated steroids (Anavar, Winstrol, Dianabol, Superdrol) are the number one cause on a protocol.', 'Heavy training within two days of the draw.', 'Alcohol, high-dose paracetamol, some fat burners.', 'Fatty liver after a long bulk.')
      practices.push('Stop or shorten the oral and retest in two to three weeks. Enzymes fall fast once the oral is gone.', 'TUDCA (500 to 1000 mg a day) and NAC (600 to 1200 mg a day) are the standard liver supports in AAS circles; milk thistle is popular but the weakest of the three.', 'No training for 48 hours before the next draw.')
      if (rawStatus === 'bad') practices.push('Above three times the upper limit, or with any yellowing or dark urine, people go to a doctor, not a forum.')
    }
  }
  const headline = muscleSource ? 'Enzymes are up from training, not the liver' : status === 'bad' ? 'Liver enzymes are well above normal' : status === 'warn' ? 'Mild liver enzyme rise' : status === 'good' ? 'Liver enzymes are normal' : 'No liver data yet'
  return { id: 'liver', icon: Activity, label: 'Liver', status, headline, markers, story: bits.join(' '), causes, practices, since: sinceOf(alt, ast) }
}

// ── 5. Kidney ──────────────────────────────────────────────────────────────
function buildKidney(h: History): Finding {
  const cr = get(h, 'creatinine'); const egfr = get(h, 'egfr'); const cys = get(h, 'cystatin_c')
  const markers: MarkerVal[] = []
  if (cr) markers.push(mark('Creatinine', cr, bands(creatMgdl(cr), 1.3, 1.5)))
  if (egfr) markers.push(mark('eGFR', egfr, bands(egfr.value, 90, 60, true)))
  if (cys) markers.push(mark('Cystatin C', cys, bands(cys.value, 1.0, 1.2)))

  const status = worst(...markers.map((m) => m.status))
  const bits: string[] = []
  const causes: string[] = []
  const practices: string[] = []
  if (cr) bits.push(`Creatinine is ${show(cr)}${movedText(cr) ? `, ${movedText(cr)}` : ''}${egfr ? `, and the filtration estimate (eGFR) is ${show(egfr)}` : ''}.`)
  else if (egfr) bits.push(`The filtration estimate (eGFR) is ${show(egfr)}.`)
  if (cys) bits.push(`Cystatin C ${show(cys)} is the cleaner test because it ignores muscle mass, and it reads ${bands(cys.value, 1.0, 1.2) === 'good' ? 'normal' : 'high'}.`)
  if (status !== 'good' && status !== 'none') {
    if (cr && !cys) bits.push('Creatinine tracks muscle mass and creatine supplements, so a mild rise in a big, supplemented lifter is often not a kidney problem at all.')
    causes.push('Creatine, which raises creatinine without touching the kidney.', 'More muscle than the formula assumes; eGFR is built for an average build.', 'Dehydration, a high-protein diet, NSAIDs like ibuprofen.', 'Blood pressure running high for months; that is the real kidney risk on a protocol.')
    practices.push('Retest well hydrated and off creatine for five to seven days.', 'Ask the lab for cystatin C next time; it is not skewed by muscle.', 'Keep blood pressure in check and go easy on NSAIDs; those two protect the kidneys more than anything else.')
  }
  const headline = status === 'bad' ? 'Kidney markers are outside the safe range' : status === 'warn' ? 'Kidney markers are a little off' : status === 'good' ? 'Kidney function looks normal' : 'No kidney data yet'
  return { id: 'kidney', icon: Filter, label: 'Kidney', status, headline, markers, story: bits.join(' '), causes, practices, since: sinceOf(cr, egfr) }
}

// ── 6. Metabolic ───────────────────────────────────────────────────────────
function buildMetabolic(h: History): Finding {
  const glu = get(h, 'glucose'); const a1c = get(h, 'hba1c'); const ins = get(h, 'insulin'); const homa = get(h, 'homa_ir')
  const markers: MarkerVal[] = []
  const bits: string[] = []
  if (a1c) {
    const p = a1cPct(a1c)
    const s = bands(p, 5.7, 6.5)
    markers.push(mark('HbA1c', a1c, s))
    bits.push(`HbA1c is ${show(a1c)}${movedText(a1c) ? `, ${movedText(a1c)}` : ''}. It is your average blood sugar over the last three months, and ${s === 'good' ? 'this is a healthy reading' : s === 'warn' ? 'this sits in prediabetes territory (5.7 to 6.4%)' : 'this is in the diabetic range (6.5% and up)'}.`)
  }
  if (glu) {
    const s = bands(glucoseMgdl(glu), 100, 126)
    markers.push(mark('Glucose', glu, s))
    bits.push(`Fasting glucose ${show(glu)} is ${s === 'good' ? 'normal' : s === 'warn' ? 'a touch high' : 'high'}${a1c ? (s === 'good' && bands(a1cPct(a1c), 5.7, 6.5) !== 'good' ? ', so the problem is after meals, not first thing in the morning' : '') : ''}.`)
  }
  if (ins) markers.push(mark('Insulin', ins, bands(ins.value, 10, 15)))
  const homaVal = homa ? homa.value : glu && ins ? (glucoseMgdl(glu) * ins.value) / 405 : undefined
  if (homaVal !== undefined) {
    const s = bands(homaVal, 1.5, 2.5)
    markers.push({ label: 'HOMA-IR', display: fmt(homaVal, 2), status: s, trend: homa ? trendOf(homa) : undefined })
    bits.push(`HOMA-IR ${fmt(homaVal, 1)} puts insulin sensitivity at ${s === 'good' ? 'good' : s === 'warn' ? 'early resistance' : 'clear resistance'}.`)
  }
  const status = worst(...markers.map((m) => m.status))
  const causes = status === 'good' || status === 'none' ? [] : [
    'Growth hormone or GH secretagogues (MK-677, ipamorelin, CJC) raise blood sugar directly; this is the most common cause in peptide users.',
    'A long bulk at a higher body fat, or trenbolone and some orals, which worsen insulin sensitivity.',
    'Poor sleep and high cortisol.',
    'On testosterone, faster red-cell turnover and recent donations can make HbA1c read lower than reality, so the fasting glucose and insulin matter too.',
  ]
  const practices = status === 'good' || status === 'none' ? [] : [
    'Walk after meals, keep lifting, sleep. These move HbA1c within a few months.',
    'Berberine (500 mg two or three times a day with meals) is the supplement people reach for; it behaves a little like metformin, which a doctor can prescribe.',
    'Cut the MK-677 or GH dose, or move it to before bed with no carbs.',
    '25 g or more of fibre a day and fewer refined carbs; chromium and cinnamon get talked up but do little.',
  ]
  const headline = status === 'bad' ? 'Blood sugar control is off' : status === 'warn' ? 'Early signs of insulin resistance' : status === 'good' ? 'Blood sugar and insulin look healthy' : 'No metabolic data yet'
  return { id: 'metabolic', icon: Flame, label: 'Metabolic', status, headline, markers, story: bits.join(' '), causes, practices, since: sinceOf(glu, a1c) }
}

// ── 7. Thyroid ─────────────────────────────────────────────────────────────
function buildThyroid(h: History): Finding {
  const tsh = get(h, 'tsh'); const ft4 = get(h, 'free_t4'); const ft3 = get(h, 'free_t3')
  const markers: MarkerVal[] = []
  const bits: string[] = []
  if (tsh) {
    const s: Status = tsh.value >= 0.4 && tsh.value <= 2.5 ? 'good' : tsh.value < 0.1 || tsh.value > 4.5 ? 'bad' : 'warn'
    markers.push(mark('TSH', tsh, s))
    bits.push(`TSH is ${show(tsh)}${movedText(tsh) ? `, ${movedText(tsh)}` : ''}: ${s === 'good' ? 'in the 0.4 to 2.5 band where the thyroid is working without strain' : tsh.value > 2.5 ? 'on the high side, which means the brain is pushing the thyroid harder than it should need to' : 'suppressed, which usually means thyroid hormone is coming from somewhere else'}.`)
  }
  if (ft4) { markers.push(mark('Free T4', ft4, byRange(ft4))); bits.push(`Free T4 ${show(ft4)} is ${byRange(ft4) === 'good' ? 'in range' : 'out of range'}.`) }
  if (ft3) { markers.push(mark('Free T3', ft3, byRange(ft3))); bits.push(`Free T3 ${show(ft3)}, the active hormone, is ${byRange(ft3) === 'good' ? 'in range' : 'out of range'}.`) }
  const status = worst(...markers.map((m) => m.status))
  const causes = status === 'good' || status === 'none' ? [] : ['Hard dieting and low calories; T3 drops first when food is scarce.', 'Fat burners such as clenbuterol, or taking T3 itself.', 'Iodine or selenium running short.', 'Plain hypothyroidism, which has nothing to do with the protocol.']
  const practices = status === 'good' || status === 'none' ? [] : ['Retest after two or three weeks eating at maintenance; a diet-suppressed thyroid comes back on its own.', 'Selenium (200 mcg) and iodine from food are the usual soft supports.', 'If T3 or a fat burner is in the stack, that is the cause; people talk to a doctor before touching it.']
  const headline = status === 'bad' ? 'Thyroid is clearly off' : status === 'warn' ? 'Thyroid is slightly off' : status === 'good' ? 'Thyroid looks normal' : 'No thyroid data yet'
  return { id: 'thyroid', icon: Pill, label: 'Thyroid', status, headline, markers, story: bits.join(' '), causes, practices, since: sinceOf(tsh) }
}

// ── 8. Vitamins ────────────────────────────────────────────────────────────
function buildVitamins(h: History): Finding {
  const d = get(h, 'vitamin_d'); const b12 = get(h, 'vitamin_b12'); const fol = get(h, 'folate')
  const markers: MarkerVal[] = []
  const bits: string[] = []
  const causes: string[] = []
  const practices: string[] = []
  if (d) {
    const v = vitdNgml(d)
    const s: Status = v >= 40 && v <= 80 ? 'good' : v < 20 || v > 100 ? 'bad' : 'warn'
    markers.push(mark('Vit D', d, s))
    bits.push(`Vitamin D is ${show(d)}${movedText(d) ? `, ${movedText(d)}` : ''}, ${v < 20 ? 'deficient' : v < 40 ? 'short of the 40 ng/mL (100 nmol/L) people aim for' : v > 100 ? 'higher than it needs to be' : 'where people aim for'}.`)
    if (v < 40) {
      causes.push('Indoor life, winter, darker skin; and body fat stores it away.')
      practices.push('D3 at 2000 to 4000 IU a day with K2 and a meal usually gets there in two to three months; retest then.')
    } else if (v > 100) practices.push('Ease the D3 dose; more is not better past 80 ng/mL.')
  }
  if (b12) {
    const s = bands(b12Pgml(b12), 400, 200, true)
    markers.push(mark('B12', b12, s))
    if (s !== 'good') { bits.push(`B12 ${show(b12)} is ${s === 'bad' ? 'low' : 'on the low side'}; it shows up as tiredness and pins and needles.`); causes.push('A vegetarian diet, metformin, or acid blockers.'); practices.push('Methylcobalamin B12, sublingual or an injection through a doctor.') }
  }
  if (fol) markers.push(mark('Folate', fol, byRange(fol)))
  const status = worst(...markers.map((m) => m.status))
  const headline = status === 'good' ? 'Vitamin levels look good' : status === 'none' ? 'No vitamin data yet' : 'A vitamin is running short'
  if (status !== 'good' && status !== 'none' && bits.length === 0) bits.push('A vitamin level is short. Cheap to fix, and it shows up in energy and recovery.')
  return { id: 'vitamins', icon: Sun, label: 'Vitamins', status, headline, markers, story: bits.join(' '), causes, practices, since: sinceOf(d, b12) }
}

// ── 9. HPTA status ─────────────────────────────────────────────────────────
function buildHpta(h: History): Finding {
  const lh = get(h, 'lh'); const fsh = get(h, 'fsh')
  const markers: MarkerVal[] = []
  if (lh) markers.push(mark('LH', lh, lh.value < 2 ? 'warn' : lh.value > 10 ? 'bad' : 'good'))
  if (fsh) markers.push(mark('FSH', fsh, fsh.value < 2 ? 'warn' : fsh.value > 10 ? 'bad' : 'good'))
  const status = worst(...markers.map((m) => m.status))
  const bothSuppressed = !!lh && !!fsh && lh.value < 2 && fsh.value < 2
  const parts: string[] = []
  if (lh) parts.push(`LH ${show(lh)}`)
  if (fsh) parts.push(`FSH ${show(fsh)}`)
  const story = bothSuppressed
    ? `${list(parts)} are both near zero. That is full suppression of your own production, which is expected on testosterone or a cycle: the brain sees plenty of androgen and stops sending the signal. Not a problem while you are on; it matters when you come off.`
    : status === 'bad'
      ? `${list(parts)} are very high. When the signal is loud and testosterone is still low, the testes are not answering (primary hypogonadism). Worth an endocrinology visit.`
      : status === 'good'
        ? `${list(parts)} are in range, so either you are not suppressed or the axis is recovering after a cycle.`
        : `${list(parts)}: partial suppression, or not enough data to say more.`
  const causes = bothSuppressed ? ['Any exogenous testosterone or AAS shuts the signal down. This is how the axis works, not a fault.'] : []
  const practices = bothSuppressed
    ? ['People who care about fertility or testicle size run HCG (250 to 500 IU two or three times a week) alongside TRT to keep the testes responsive.', 'Coming off: a PCT of HCG followed by clomiphene or tamoxifen is the common recovery route, done with a doctor.']
    : []
  const headline = bothSuppressed ? 'Own production is switched off, as expected' : status === 'bad' ? 'The testes are not answering the signal' : status === 'good' ? 'Own production is working' : status === 'none' ? 'No LH or FSH data yet' : 'Partly suppressed'
  return { id: 'hpta', icon: Brain, label: 'HPTA status', status: bothSuppressed ? 'good' : status, headline, markers, story, causes, practices, since: sinceOf(lh, fsh) }
}

// ── 10. Prostate & inflammation ────────────────────────────────────────────
function buildProstateInflammation(h: History): Finding {
  const psa = get(h, 'psa'); const crp = get(h, 'crp'); const hcy = get(h, 'homocysteine')
  const markers: MarkerVal[] = []
  const bits: string[] = []
  const causes: string[] = []
  const practices: string[] = []
  if (psa) {
    let s = bands(psa.value, 2.5, 4)
    const jump = psa.prev !== undefined && psa.value - psa.prev.value > 1.4
    if (jump && s === 'good') s = 'warn'
    markers.push(mark('PSA', psa, s))
    bits.push(`PSA is ${show(psa)}${movedText(psa) ? `, ${movedText(psa)}` : ''}. ${s === 'good' ? 'Under 2.5 is comfortable.' : jump ? 'A rise of more than 1.4 within a year on TRT is the trigger for a urology check even when the number itself is fine.' : psa.value >= 4 ? 'Above 4 needs a urologist, full stop.' : 'Between 2.5 and 4 people watch it and retest.'}`)
    if (s !== 'good') {
      causes.push('TRT itself lifts PSA a little in the first year.', 'Cycling, sex or a prostate infection in the 48 hours before the draw.', 'Age and an enlarged prostate.')
      practices.push('Retest after 48 hours with no cycling and no ejaculation. If it holds, see a urologist; this is one people do not self-manage.')
    }
  }
  if (crp) {
    const s = bands(crp.value, 1, 3)
    markers.push(mark('hs-CRP', crp, s))
    bits.push(`CRP ${show(crp)} shows ${s === 'good' ? 'low' : s === 'warn' ? 'mild' : 'high'} background inflammation.`)
    if (s !== 'good') {
      causes.push('Hard training in the days before the draw; CRP spikes after big sessions.', 'An infection, an injury, poor sleep, or extra body fat.')
      practices.push('Retest after a few easy days. Omega-3, curcumin and better sleep are the usual levers people pull for a stubborn CRP.')
    }
  }
  if (hcy) {
    const s = bands(hcy.value, 10, 15)
    markers.push(mark('Homocysteine', hcy, s))
    if (s !== 'good') { bits.push(`Homocysteine ${show(hcy)} is high, which adds to cardiovascular risk.`); practices.push('Methylated B vitamins (folate, B12, B6) bring homocysteine down within weeks.') }
  }
  const status = worst(...markers.map((m) => m.status))
  const headline = status === 'bad' ? 'A marker here is high enough to act on' : status === 'warn' ? 'Mild inflammation, or a PSA to watch' : status === 'good' ? 'Inflammation and PSA look fine' : 'No data yet'
  return { id: 'prostate', icon: ShieldAlert, label: 'Prostate & inflammation', status, headline, markers, story: bits.join(' '), causes, practices, since: sinceOf(psa, crp) }
}

// ── Build all ──────────────────────────────────────────────────────────────
const ORDER: Record<Status, number> = { bad: 0, warn: 1, good: 2, none: 3 }

export function buildFindings(results: EnrichedResult[], exams: LabExam[]): Finding[] {
  if (results.length === 0) return []
  const h = buildHistory(results, exams)
  return [
    buildCardio(h), buildHormones(h), buildBlood(h), buildLiver(h), buildKidney(h),
    buildMetabolic(h), buildThyroid(h), buildVitamins(h), buildHpta(h), buildProstateInflammation(h),
  ]
    .filter((f) => f.status !== 'none' && f.markers.length > 0)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status])
}

export function useLabFindings(results: EnrichedResult[], exams: LabExam[]): Finding[] {
  return useMemo(() => buildFindings(results, exams), [results, exams])
}

// The written summary at the top of the page: who needs action, what moved, what is fine.
export function summarize(findings: Finding[]): string[] {
  const bad = findings.filter((f) => f.status === 'bad')
  const warn = findings.filter((f) => f.status === 'warn')
  const good = findings.filter((f) => f.status === 'good')
  const out: string[] = []
  if (findings.length === 0) return out

  const first: string[] = []
  if (bad.length) first.push(`${list(bad.map((f) => f.label))} ${bad.length === 1 ? 'needs' : 'need'} action`)
  if (warn.length) first.push(`${list(warn.map((f) => f.label.toLowerCase()))} ${warn.length === 1 ? 'is' : 'are'} worth watching`)
  if (good.length) first.push(good.length === findings.length ? 'every panel looks fine' : `${good.length === 1 ? good[0].label.toLowerCase() + ' looks' : `${good.length} panels look`} fine`)
  out.push(`${cap(list(first))}.`)

  // Suppressed LH/FSH wobble around zero; a "33%" swing there is noise, not news.
  const moves = findings.filter((f) => f.id !== 'hpta').flatMap((f) =>
    f.markers
      .filter((m) => m.trend && m.trend.dir !== 'flat' && Math.abs(m.trend.pct) >= 10 && m.status !== 'good')
      .map((m) => ({ text: `${m.label} ${m.trend!.dir === 'up' ? 'up' : 'down'} ${Math.abs(m.trend!.pct).toFixed(0)}%`, pct: Math.abs(m.trend!.pct) })),
  ).sort((a, b) => b.pct - a.pct).slice(0, 3)
  const since = monthOf(findings.find((f) => f.since)?.since)
  if (moves.length) out.push(`Since ${since ? `your ${since} test` : 'your last test'}: ${list(moves.map((m) => m.text))}.`)

  const heads = [...bad, ...warn].slice(0, 3).map((f) => f.headline.toLowerCase())
  if (heads.length) out.push(`${cap(list(heads))}. Each panel below says why and what people usually do about it.`)
  return out
}

