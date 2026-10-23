/**
 * labFindings: reads one blood test the way an experienced person on a
 * protocol would and writes it down in sentences. Each section (lipids,
 * hormones, blood count, liver, kidney, blood sugar, thyroid, vitamins,
 * prostate, inflammation) gets a verdict, a short story that ties the numbers
 * together, and the probable causes on a protocol. No next steps: decisions
 * belong to the user and their clinician. Unit-aware (UK mmol/L and US mg/dL both work). Feed it ONE exam's
 * results: every pairing (ratios, HOMA-IR, the CK pattern) must come from the
 * same draw. Not medical advice; the UI says so.
 */

import { useMemo } from 'react'
import type { LabExam } from './db'
import type { LabSection } from './markers'
import { canonicalKey, tcUnitExams } from './labTests'
import type { EnrichedResult } from './insights'
import { homaIr } from './labUnits'
import { dayOf, daysBetween, fmtDay } from './dates'
import { Activity, Atom, Droplet, Flame, Filter, Heart, Pill, ShieldAlert, Sun, type LucideIcon } from 'lucide-react'

export type Status = 'good' | 'warn' | 'bad' | 'none'
export type Trend = { pct: number; dir: 'up' | 'down' | 'flat' }
export type MarkerVal = { label: string; display: string; status: Status; trend?: Trend }

export type Finding = {
  id: string
  icon: LucideIcon
  label: string
  section: LabSection
  status: Status
  /** One line under the title: the verdict in plain words. */
  headline: string
  /** The numbers, with a tone each, for the facts row. */
  markers: MarkerVal[]
  /** Two to four sentences that tie the numbers together. */
  story: string
  /** Why this usually happens to someone on a protocol. */
  causes: string[]
  /** Retired 19 Oct 2026 with the app's next-step lines; kept optional for older callers. */
  practices?: string[]
  since?: string
}

// A marker reading with history: latest value plus the previous test's value.
type Reading = { value: number; unit: string; low?: number; high?: number; date: string; prev?: { value: number; unit: string; date: string } }
type History = Map<string, Reading>

// ── History ────────────────────────────────────────────────────────────────
// Latest values come from one exam only, so ratios, HOMA-IR and the CK pattern
// pair within a single draw; earlier exams supply `prev` for trends and PSA velocity.
function buildHistory(results: EnrichedResult[], exams: LabExam[], examId: number): History {
  const examDate = new Map(exams.map((e) => [e.id, e.collectedAt]))
  const day = dayOf(examDate.get(examId) ?? '')
  const tcUnit = tcUnitExams(results)
  const byKey = new Map<string, Array<{ r: EnrichedResult; date: string }>>()
  for (const r of results) {
    if (r.value === undefined) continue
    const key = canonicalKey(r.marker, r.unit, r, tcUnit.has(r.examId)).key
    const date = examDate.get(r.examId) ?? ''
    const list = byKey.get(key) ?? []
    list.push({ r, date })
    byKey.set(key, list)
  }
  const out: History = new Map()
  for (const [key, list] of byKey) {
    const latest = list.find((x) => x.r.examId === examId)
    if (!latest) continue // not measured in this test: no read
    list.sort((a, b) => b.date.localeCompare(a.date))
    // R4: the previous value is from a strictly earlier calendar day.
    const prev = day ? list.find((x) => { const d = dayOf(x.date); return d !== '' && d < day }) : undefined
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

// "32.1", not "32.10": fixed digits for rounding, trailing zeros dropped.
function fmt(v: number, digits = 1) {
  return v % 1 === 0 ? String(v) : String(Number(v.toFixed(digits)))
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
const dayText = (iso?: string) => (iso ? fmtDay(iso) || undefined : undefined)
// "up 17% since Jun 18, 2026" / "down 8% since your last test" / "about where it was on Jun 18, 2026"
function movedText(r: Reading | null): string {
  const t = r ? trendOf(r) : undefined
  if (!r || !t) return ''
  const when = dayText(r.prev?.date)
  const since = when ? `since ${when}` : 'since your last test'
  if (t.dir === 'flat') return `about where it was ${when ? `on ${when}` : 'last time'}`
  return `${t.dir === 'up' ? 'up' : 'down'} ${Math.abs(t.pct).toFixed(0)}% ${since}`
}
function sinceOf(...readings: Array<Reading | null>): string | undefined {
  for (const r of readings) if (r?.prev) return r.prev.date
  return undefined
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
// Inside the lab's own printed range: a curated warn then reads
// "In the lab range, but …" so it never contradicts the lab. No range printed
// falls through to the plain sentence.
const inLab = (r: Reading) => byRange(r) === 'good'

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
    bits.push(`Total cholesterol to HDL is ${fmt(ratio, 1)}: ${ratio < 3.5 ? 'under the 3.5 commonly quoted as a target' : ratio < 5 ? 'above the commonly quoted 3.5 but under 5' : 'over 5, the level commonly quoted as higher risk'}.`)
  }
  let hdlS: Status = 'none'
  let ldlS: Status = 'none'
  if (hdl) { hdlS = bands(cholMmol(hdl), 1.3, 1.0, true); markers.push(mark('HDL', hdl, hdlS)) }
  if (ldl) { ldlS = bands(cholMmol(ldl), 2.6, 3.4); markers.push(mark('LDL', ldl, ldlS)) }
  if (ldl && hdl) {
    const lm = movedText(ldl); const hm = movedText(hdl)
    const pattern = trendOf(ldl)?.dir === 'up' && trendOf(hdl)?.dir === 'down'
    bits.push(`LDL is ${show(ldl)}${lm ? `, ${lm}` : ''}, and HDL is ${show(hdl)}${hm ? `, ${hm}` : ''}.${pattern ? ' LDL climbing while HDL falls is a common pattern on testosterone; the ratio gets hit from both ends.' : hdlS === 'warn' && inLab(hdl) ? ' In the lab range, but HDL is on the low side. It is the lipid that androgens hit hardest and it drags the ratio up on its own.' : hdlS !== 'good' ? ' Low HDL is the lipid that androgens hit hardest and it drags the ratio up on its own.' : ''}`)
  } else if (ldl) {
    bits.push(`LDL is ${show(ldl)}${movedText(ldl) ? `, ${movedText(ldl)}` : ''}.`)
  } else if (hdl) {
    bits.push(`HDL is ${show(hdl)}${movedText(hdl) ? `, ${movedText(hdl)}` : ''}.`)
  }
  if (tg && hdl && hdl.value > 0) {
    const aip = Math.log10(tgMmol(tg) / cholMmol(hdl))
    const s = bands(aip, 0.11, 0.21)
    markers.push({ label: 'Triglyceride to HDL balance', display: fmt(aip, 2), status: s })
    bits.push(`Triglycerides ${show(tg)} against HDL give a triglyceride to HDL balance of ${fmt(aip, 2)} (${s === 'good' ? 'low risk' : s === 'warn' ? 'medium risk' : 'high risk'}).`)
  } else if (tg) {
    markers.push(mark('TG', tg, bands(tgMmol(tg), 1.7, 2.3)))
  }
  if (tg && !(hdl && hdl.value > 0)) { /* TG already added above */ } else if (tg) { markers.push(mark('TG', tg, bands(tgMmol(tg), 1.7, 2.3))) }
  if (apob) {
    const s = bands(apobMgdl(apob), 90, 130)
    markers.push(mark('ApoB', apob, s))
    if (s !== 'good') bits.push(`ApoB ${show(apob)} counts the particles that actually build plaque, so it can read high even when LDL looks fine.`)
  }

  const status = worst(ratioStatus, hdlS, ldlS, ...markers.map((m) => m.status))
  const headline = status === 'bad' ? 'Lipids are in the risk zone' : status === 'warn' ? 'Lipids are drifting the wrong way' : status === 'good' ? 'Lipids look healthy' : 'No lipid data yet'
  const causes = status === 'good' ? [] : [
    'A higher testosterone dose, or a recent increase. Lipids follow the dose within a few weeks.',
    'An aromatase inhibitor pushing estradiol low. E2 is what keeps HDL up in men.',
    'A bulk in progress, more saturated fat, alcohol, or simply not much cardio.',
  ]
  return { id: 'cardio', icon: Heart, label: 'Cardiovascular', section: 'Lipids', status, headline, markers, story: bits.join(' '), causes, since: sinceOf(hdl, ldl, tc, tg) }
}

// ── 2. Hormone balance ─────────────────────────────────────────────────────
function buildHormones(h: History): Finding {
  const tt = get(h, 'total_testosterone'); const ft = get(h, 'free_testosterone'); const e2 = get(h, 'estradiol'); const shbg = get(h, 'shbg'); const prl = get(h, 'prolactin')
  const markers: MarkerVal[] = []
  const bits: string[] = []
  const causes: string[] = []

  if (tt) {
    const s = bands(ttNgdl(tt), 700, 400, true)
    markers.push(mark('Total T', tt, s))
    const aboveLab = tt.high !== undefined && tt.value > tt.high
    bits.push(`Total testosterone is ${show(tt)}${movedText(tt) ? `, ${movedText(tt)}` : ''}. ${aboveLab ? 'Above the lab range is normal on a protocol; what matters is how the rest of the test responds to it.' : s === 'good' ? 'That is a solid level on a protocol.' : 'That is on the low side for someone on a protocol; timing of the draw against the injection matters a lot here.'}`)
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
    const r = ratio !== undefined ? ` The testosterone to estradiol ratio is ${ratio}: ${ratio >= 15 && ratio <= 30 ? 'inside the 15 to 30 band commonly quoted on testosterone' : ratio < 15 ? 'below 15, which means a good share of the testosterone is turning into estradiol' : 'above 30, which means estradiol is being held low relative to the testosterone'}.` : ''
    const side = v > 40 ? 'above' : v < 20 ? 'below' : ''
    bits.push(side && inLab(e2)
      ? `In the lab range, but estradiol ${show(e2)} is ${side} the 20 to 40 pg/mL range commonly quoted on testosterone${movedText(e2) ? `, ${movedText(e2)}` : ''}.${r}`
      : `Estradiol is ${show(e2)}${movedText(e2) ? `, ${movedText(e2)}` : ''}, ${side || 'inside'} the 20 to 40 pg/mL range commonly quoted on testosterone.${r}`)
    if (v > 40) {
      causes.push('A bigger weekly dose or fewer, larger injections: the peaks are what aromatize.', 'Higher body fat, which carries more aromatase.', 'Alcohol in the days before the draw.')
    } else if (v < 20) {
      causes.push('An aromatase inhibitor that is too strong or too frequent. This is the usual cause by a mile.', 'Very low body fat or a hard diet.')
    }
  }
  if (shbg) {
    const s: Status = shbg.value >= 20 && shbg.value <= 50 ? 'good' : 'warn'
    markers.push(mark('SHBG', shbg, s))
    const why = shbg.value > 50 ? 'it binds up testosterone and the free fraction runs lower than the total suggests' : 'more of the total is free and active, and estradiol swings hit harder'
    bits.push(s === 'warn' && inLab(shbg)
      ? `In the lab range, but SHBG ${show(shbg)} is on the ${shbg.value > 50 ? 'high' : 'low'} side, so ${why}.`
      : `SHBG is ${show(shbg)}: ${s === 'good' ? 'in the normal band, so total and free testosterone tell the same story' : `${shbg.value > 50 ? 'high' : 'low'}, so ${why}`}.`)
    if (shbg.value > 50) {
      causes.push('Low insulin and low carbs, thyroid running high, age, or simply genetics.')
    } else if (shbg.value < 20) {
      causes.push('Insulin resistance or a higher dose; both push SHBG down.')
    }
  }
  if (ft) {
    const byLab = byRange(ft)
    const v = ftPgml(ft)
    const s = byLab !== 'none' ? (ft.high !== undefined && ft.value > ft.high ? 'good' : byLab) : bands(v, 15, 8, true)
    markers.push(mark('Free T', ft, s))
    bits.push(`Free testosterone is ${show(ft)}${movedText(ft) ? `, ${movedText(ft)}` : ''}${ft.high !== undefined && ft.value > ft.high ? ', above the lab range, which on a protocol is the point' : s === 'good' ? ', where it should be' : ', a bit low for the total; see SHBG'}.`)
  }
  if (prl) {
    const s = bands(prolNgml(prl), 15, 25)
    markers.push(mark('Prolactin', prl, s))
    if (s !== 'good') {
      bits.push(s === 'warn' && inLab(prl)
        ? `In the lab range, but prolactin ${show(prl)} is a little high. It blunts libido and erections when it climbs.`
        : `Prolactin is ${show(prl)}, ${s === 'bad' ? 'clearly high' : 'a little high'}. It blunts libido and erections when it climbs.`)
      causes.push('Stress, poor sleep, or an orgasm in the hours before the draw.', 'Some medications, and rarely a pituitary cause.')
    }
  }

  const status = worst(...markers.map((m) => m.status))
  const headline = status === 'bad' ? 'Hormones are out of balance' : status === 'warn' ? 'One hormone marker is off' : status === 'good' ? 'Hormones sit where someone on a protocol wants them' : 'No hormone data yet'
  return { id: 'hormones', icon: Atom, label: 'Hormone balance', section: 'Hormones', status, headline, markers, story: bits.join(' '), causes, since: sinceOf(tt, e2, ft) }
}

// ── 3. Blood health ────────────────────────────────────────────────────────
function buildBlood(h: History): Finding {
  const hct = get(h, 'hematocrit'); const hgb = get(h, 'hemoglobin'); const rbc = get(h, 'rbc'); const ferr = get(h, 'ferritin')
  const markers: MarkerVal[] = []
  const bits: string[] = []
  const causes: string[] = []

  let pct: number | undefined
  if (hct) {
    pct = hctPct(hct)
    const s = bands(pct, 50, 52)
    markers.push(mark('HCT', hct, s, `${fmt(pct, 1)}%`))
    const moved = movedText(hct) ? `, ${movedText(hct)}` : ''
    bits.push(pct >= 50 && pct < 52 && inLab(hct)
      ? `In the lab range, but hematocrit ${fmt(pct, 1)}% is over 50%${moved}, close to the 52% line often quoted for testosterone therapy.`
      : `Hematocrit is ${fmt(pct, 1)}%${moved}. ${pct >= 52 ? 'Over 52% the blood is thicker, which is why it is the number doctors watch most closely on testosterone.' : pct >= 50 ? 'Under the 52% line often quoted for testosterone therapy, but close to it.' : 'Under 50%, which is the comfortable zone on testosterone.'}`)
  }
  if (hgb) {
    // Judged in g/dL, shown in the lab's own unit.
    const g = hgbGdl(hgb)
    markers.push(mark('Hgb', hgb, bands(g, 17.5, 18.5)))
    if (g >= 17.5) bits.push(`Hemoglobin ${show(hgb)} is moving with it, which says this is more red cells, not just less water.`)
  }
  if (rbc) markers.push(mark('RBC', rbc, bands(rbc.value, 5.9, 6.5)))
  if (ferr) {
    const v = ferritinNgml(ferr)
    const s: Status = v >= 30 && v <= 300 ? 'good' : v < 15 || v > 500 ? 'bad' : 'warn'
    markers.push(mark('Ferritin', ferr, s))
    if (v < 30) {
      bits.push(`Ferritin is ${show(ferr)}, low. That is usually the price of repeated donations, and it shows up as flat energy and poor recovery.`)
      causes.push('Donating blood too often to hold hematocrit down.')
    } else if (movedText(ferr).startsWith('down')) {
      bits.push(`Ferritin ${show(ferr)} is ${movedText(ferr)}, which fits with a donation in between.`)
    }
  }

  if (pct !== undefined && pct >= 50) {
    causes.push('Testosterone drives red-cell production, more so at higher doses and with injections that peak high.', 'A draw taken near the injection peak, or slightly dehydrated (hematocrit is a concentration).', 'Sleep apnea, smoking and altitude all add to it.')
  }

  const status = worst(...markers.map((m) => m.status))
  // The headline follows the trend: "creeping up" only when it is.
  const dir = hct ? trendOf(hct)?.dir : undefined
  const headline = status === 'bad' ? (dir === 'down' ? 'Blood is thick but coming down' : 'Blood is getting thick')
    : status === 'warn' ? (dir === 'up' ? 'Red-cell count is creeping up' : dir === 'down' ? 'Red-cell count is high but coming down' : 'Red-cell count is near the top')
      : status === 'good' ? 'Blood count is in the safe zone' : 'No blood count data yet'
  return { id: 'blood', icon: Droplet, label: 'Blood health', section: 'Full blood count', status, headline, markers, story: bits.join(' '), causes, since: sinceOf(hct, hgb) }
}

// ── 4. Liver ───────────────────────────────────────────────────────────────
function buildLiver(h: History): Finding {
  const alt = get(h, 'alt'); const ast = get(h, 'ast'); const ggt = get(h, 'ggt'); const ck = get(h, 'creatine_kinase')
  const markers: MarkerVal[] = []
  // Each result against its own lab's upper limit; 40 when none was printed.
  const uln = (r: Reading, d: number) => r.high ?? d
  const altUp = !!alt && alt.value > uln(alt, 40)
  const astUp = !!ast && ast.value > uln(ast, 40)
  const ggtUp = !!ggt && ggt.value > uln(ggt, 50)
  // Muscle, not liver, only when CK from the SAME test is high AND an enzyme is actually up.
  const sameTest = (r: Reading | null) => !!r && !!ck && r.date === ck.date
  const up = [altUp && sameTest(alt) ? 'ALT' : '', astUp && sameTest(ast) ? 'AST' : ''].filter(Boolean)
  const muscleSource = !!ck && ck.value > uln(ck, 200) && up.length > 0 && !ggtUp

  if (alt) markers.push(mark('ALT', alt, muscleSource ? 'warn' : bands(alt.value / uln(alt, 40), 1, 3)))
  if (ast) markers.push(mark('AST', ast, muscleSource ? 'warn' : bands(ast.value / uln(ast, 40), 1, 3)))
  if (ggt) markers.push(mark('GGT', ggt, bands(ggt.value / uln(ggt, 50), 1, 3)))
  if (ck) markers.push(mark('CK', ck, bands(ck.value / uln(ck, 200), 1, 5)))

  const rawStatus = worst(...markers.filter((m) => m.label !== 'CK').map((m) => m.status))
  const status: Status = muscleSource ? 'warn' : rawStatus
  const bits: string[] = []
  const causes: string[] = []
  if (muscleSource) {
    bits.push(`${list(up)} ${up.length > 1 ? 'are' : 'is'} up while ${ggt ? 'GGT is normal and ' : ''}CK is high. That pattern usually comes from training rather than the liver; the enzymes leak from sore muscle too.`)
  } else if (markers.length > 0) {
    const parts: string[] = []
    if (alt) parts.push(`ALT ${show(alt)} is ${altUp ? `${fmt(alt.value / uln(alt, 40), 1)} times the upper limit` : 'within limits'}${movedText(alt) ? `, ${movedText(alt)}` : ''}`)
    if (ast) parts.push(`AST ${show(ast)} is ${astUp ? 'high' : 'normal'}`)
    if (ggt) parts.push(`GGT ${show(ggt)} is ${ggtUp ? 'high' : 'normal'}`)
    bits.push(`${cap(list(parts))}.`)
    if (rawStatus !== 'good') {
      bits.push(ggt && !ggtUp
        ? 'GGT is the marker that separates a liver cause from training soreness, and it is normal here, so a hard session in the two days before the draw is the most likely explanation.'
        : 'GGT rising along with ALT points at the liver itself rather than training.')
      causes.push('Heavy training within two days of the draw.', 'Alcohol, high-dose acetaminophen (paracetamol), some fat burners.', 'Fatty liver after a long bulk.')
    }
  }
  const headline = muscleSource ? 'Enzymes are up, likely from training' : status === 'bad' ? 'Liver enzymes are well above normal' : status === 'warn' ? 'Mild liver enzyme rise' : status === 'good' ? 'Liver enzymes are normal' : 'No liver data yet'
  return { id: 'liver', icon: Activity, label: 'Liver', section: 'Liver', status, headline, markers, story: bits.join(' '), causes, since: sinceOf(alt, ast) }
}

// ── 5. Kidney ──────────────────────────────────────────────────────────────
function buildKidney(h: History): Finding {
  const cr = get(h, 'creatinine'); const egfr = get(h, 'egfr'); const cys = get(h, 'cystatin_c')
  const markers: MarkerVal[] = []
  if (cr) markers.push(mark('Creatinine', cr, bands(creatMgdl(cr), 1.3, 1.5)))
  // 60 to 89 is "mildly decreased" on paper and normal for most adults; only flag under 80.
  if (egfr) markers.push(mark('eGFR', egfr, bands(egfr.value, 80, 60, true)))
  if (cys) markers.push(mark('Cystatin C', cys, bands(cys.value, 1.0, 1.2)))

  const status = worst(...markers.map((m) => m.status))
  const bits: string[] = []
  const causes: string[] = []
  if (cr) bits.push(`Creatinine is ${show(cr)}${movedText(cr) ? `, ${movedText(cr)}` : ''}${egfr ? `, and the filtration estimate (eGFR) is ${show(egfr)}` : ''}.`)
  else if (egfr) bits.push(`The filtration estimate (eGFR) is ${show(egfr)}.`)
  if (cys) bits.push(`Cystatin C ${show(cys)} is the cleaner test because it ignores muscle mass, and it reads ${bands(cys.value, 1.0, 1.2) === 'good' ? 'normal' : 'high'}.`)
  if (status !== 'good' && status !== 'none') {
    if (cr && !cys) bits.push('Creatinine tracks muscle mass and creatine supplements, so a mild rise in a big, supplemented lifter is often not a kidney problem at all.')
    causes.push('Creatine, which raises creatinine without touching the kidney.', 'More muscle than the formula assumes; eGFR is built for an average build.', 'Dehydration, a high-protein diet, NSAIDs like ibuprofen.', 'Blood pressure running high for months; that is the real kidney risk on a protocol.')
  }
  const headline = status === 'bad' ? 'Kidney markers are outside the safe range' : status === 'warn' ? 'Kidney markers are a little off' : status === 'good' ? 'Kidney function looks normal' : 'No kidney data yet'
  return { id: 'kidney', icon: Filter, label: 'Kidney', section: 'Kidney', status, headline, markers, story: bits.join(' '), causes, since: sinceOf(cr, egfr) }
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
    bits.push(`${s === 'warn' && inLab(a1c) ? 'In the lab range, but HbA1c' : 'HbA1c'} is ${show(a1c)}${movedText(a1c) ? `, ${movedText(a1c)}` : ''}. It is your average blood sugar over the last three months, and ${s === 'good' ? 'this is a healthy reading' : s === 'warn' ? 'this sits in the 5.7 to 6.4% band labs call prediabetes' : 'this is in the 6.5% and up band a doctor needs to confirm'}.`)
  }
  if (glu) {
    const s = bands(glucoseMgdl(glu), 100, 126)
    markers.push(mark('Glucose', glu, s))
    bits.push(`${s === 'warn' && inLab(glu) ? 'In the lab range, but fasting' : 'Fasting'} glucose ${show(glu)} is ${s === 'good' ? 'normal' : s === 'warn' ? 'a touch high' : 'high'}${a1c ? (s === 'good' && bands(a1cPct(a1c), 5.7, 6.5) !== 'good' ? ', so the problem is after meals, not first thing in the morning' : '') : ''}.`)
  }
  if (ins) markers.push(mark('Insulin', ins, byRange(ins)))
  // Unit-aware and same-draw only: raw insulin in pmol/L read as µIU/mL was the "HOMA-IR 10.8".
  const homaVal = homa ? homa.value : glu && ins && glu.date === ins.date ? homaIr(glu.value, glu.unit, ins.value, ins.unit) : undefined
  if (homaVal !== undefined) {
    const s = bands(homaVal, 1.5, 2.5)
    markers.push({ label: 'HOMA-IR', display: fmt(homaVal, 2), status: s, trend: homa ? trendOf(homa) : undefined })
    bits.push(`HOMA-IR ${fmt(homaVal, 1)} puts insulin sensitivity at ${s === 'good' ? 'good' : s === 'warn' ? 'early resistance' : 'clear resistance'}.`)
  }
  const status = worst(...markers.map((m) => m.status))
  const causes = status === 'good' || status === 'none' ? [] : [
    'Growth hormone or GH secretagogues (MK-677, ipamorelin, CJC) raise blood sugar directly; this is the most common cause in peptide users.',
    'A long bulk at a higher body fat, which worsens insulin sensitivity.',
    'Poor sleep and high cortisol.',
    'On testosterone, faster red-cell turnover and recent donations can make HbA1c read lower than reality, so the fasting glucose and insulin matter too.',
  ]
  const headline = status === 'bad' ? 'Blood sugar control is off' : status === 'warn' ? 'Early signs of insulin resistance' : status === 'good' ? 'Blood sugar and insulin look healthy' : 'No blood sugar data yet'
  return { id: 'metabolic', icon: Flame, label: 'Blood sugar', section: 'Blood sugar', status, headline, markers, story: bits.join(' '), causes, since: sinceOf(glu, a1c) }
}

// ── 7. Thyroid ─────────────────────────────────────────────────────────────
function buildThyroid(h: History): Finding {
  const tsh = get(h, 'tsh'); const ft4 = get(h, 'free_t4'); const ft3 = get(h, 'free_t3')
  const markers: MarkerVal[] = []
  const bits: string[] = []
  if (tsh) {
    const s: Status = tsh.value >= 0.4 && tsh.value <= 2.5 ? 'good' : tsh.value < 0.1 || tsh.value > 4.5 ? 'bad' : 'warn'
    markers.push(mark('TSH', tsh, s))
    bits.push(`${s === 'warn' && inLab(tsh) ? 'In the lab range, but TSH' : 'TSH'} is ${show(tsh)}${movedText(tsh) ? `, ${movedText(tsh)}` : ''}: ${s === 'good' ? 'in the 0.4 to 2.5 band where the thyroid is working without strain' : tsh.value > 2.5 ? 'on the high side, which means the brain is pushing the thyroid harder than it should need to' : 'suppressed, which usually means thyroid hormone is coming from somewhere else'}.`)
  }
  if (ft4) { markers.push(mark('Free T4', ft4, byRange(ft4))); bits.push(`Free T4 ${show(ft4)} is ${byRange(ft4) === 'good' ? 'in range' : 'out of range'}.`) }
  if (ft3) { markers.push(mark('Free T3', ft3, byRange(ft3))); bits.push(`Free T3 ${show(ft3)}, the active hormone, is ${byRange(ft3) === 'good' ? 'in range' : 'out of range'}.`) }
  const status = worst(...markers.map((m) => m.status))
  const causes = status === 'good' || status === 'none' ? [] : ['Hard dieting and low calories; T3 drops first when food is scarce.', 'Fat burners such as clenbuterol, or taking T3 itself.', 'Iodine or selenium running short.', 'Plain hypothyroidism, which has nothing to do with the protocol.']
  const headline = status === 'bad' ? 'Thyroid is clearly off' : status === 'warn' ? 'Thyroid is slightly off' : status === 'good' ? 'Thyroid looks normal' : 'No thyroid data yet'
  return { id: 'thyroid', icon: Pill, label: 'Thyroid', section: 'Thyroid', status, headline, markers, story: bits.join(' '), causes, since: sinceOf(tsh) }
}

// ── 8. Vitamins ────────────────────────────────────────────────────────────
function buildVitamins(h: History): Finding {
  const d = get(h, 'vitamin_d'); const b12 = get(h, 'vitamin_b12'); const fol = get(h, 'folate')
  const markers: MarkerVal[] = []
  const bits: string[] = []
  const causes: string[] = []
  if (d) {
    const v = vitdNgml(d)
    const s: Status = v >= 40 && v <= 80 ? 'good' : v < 20 || v > 100 ? 'bad' : 'warn'
    markers.push(mark('Vit D', d, s))
    bits.push(`${s === 'warn' && inLab(d) ? 'In the lab range, but vitamin D' : 'Vitamin D'} is ${show(d)}${movedText(d) ? `, ${movedText(d)}` : ''}, ${v < 20 ? 'deficient' : v < 40 ? 'under the 40 ng/mL (100 nmol/L) commonly quoted as a target' : v > 100 ? 'above 100 ng/mL, higher than most labs consider needed' : 'in the 40 to 80 ng/mL band commonly quoted as a target'}.`)
    if (v < 40) {
      causes.push('Indoor life, winter, darker skin; and body fat stores it away.')
    }
  }
  if (b12) {
    const s = bands(b12Pgml(b12), 400, 200, true)
    markers.push(mark('B12', b12, s))
    if (s !== 'good') { bits.push(`${s === 'warn' && inLab(b12) ? 'In the lab range, but B12' : 'B12'} ${show(b12)} is ${s === 'bad' ? 'low' : 'on the low side'}; it shows up as tiredness and pins and needles.`); causes.push('A vegetarian diet, metformin, or acid blockers.'); }
  }
  if (fol) markers.push(mark('Folate', fol, byRange(fol)))
  const status = worst(...markers.map((m) => m.status))
  const headline = status === 'good' ? 'Vitamin levels look good' : status === 'none' ? 'No vitamin data yet' : 'A vitamin is running short'
  if (status !== 'good' && status !== 'none' && bits.length === 0) bits.push('A vitamin level is short. It can show up in energy and recovery.')
  return { id: 'vitamins', icon: Sun, label: 'Vitamins', section: 'Iron & vitamins', status, headline, markers, story: bits.join(' '), causes, since: sinceOf(d, b12) }
}

// ── 9. Own production (LH, FSH), part of Hormones ──────────────────────────
function buildHpta(h: History): Finding {
  const lh = get(h, 'lh'); const fsh = get(h, 'fsh'); const tt = get(h, 'total_testosterone')
  const ttLow = !!tt && tt.low !== undefined && tt.value < tt.low
  const markers: MarkerVal[] = []
  if (lh) markers.push(mark('LH', lh, lh.value < 2 ? 'warn' : lh.value > 10 ? 'bad' : 'good'))
  if (fsh) markers.push(mark('FSH', fsh, fsh.value < 2 ? 'warn' : fsh.value > 10 ? 'bad' : 'good'))
  const status = worst(...markers.map((m) => m.status))
  const bothSuppressed = !!lh && !!fsh && lh.value < 2 && fsh.value < 2
  const parts: string[] = []
  if (lh) parts.push(`LH ${show(lh)}`)
  if (fsh) parts.push(`FSH ${show(fsh)}`)
  const story = bothSuppressed
    ? `${list(parts)} are both near zero. That is full suppression of your own production, which is expected on testosterone: the brain sees plenty of androgen and stops sending the signal.`
    : status === 'bad' && ttLow
      ? `${list(parts)} are very high while testosterone is below the lab range, which means the testes are not answering the signal.`
      : status === 'bad'
        ? `${list(parts)} are very high. That can happen while your own production restarts after stopping testosterone.`
      : status === 'good'
        ? `${list(parts)} are in range, so either you are not suppressed or the axis is recovering.`
        : `${list(parts)}: partial suppression, or not enough data to say more.`
  const causes = bothSuppressed ? ['Testosterone from outside the body shuts the signal down. This is how the axis works, not a fault.'] : []
  const headline = bothSuppressed ? 'Own production is switched off, as expected' : status === 'bad' ? (ttLow ? 'The testes are not answering the signal' : 'LH and FSH are high') : status === 'good' ? 'Own production is working' : status === 'none' ? 'No LH or FSH data yet' : 'Partly suppressed'
  return { id: 'hpta', icon: Atom, label: 'Own production (LH, FSH)', section: 'Hormones', status: bothSuppressed ? 'good' : status, headline, markers, story, causes, since: sinceOf(lh, fsh) }
}

// ── 10. Prostate ───────────────────────────────────────────────────────────
function buildProstate(h: History): Finding {
  const psa = get(h, 'psa')
  const markers: MarkerVal[] = []
  const bits: string[] = []
  const causes: string[] = []
  if (psa) {
    let s = bands(psa.value, 2.5, 4)
    const jump = psa.prev !== undefined && daysBetween(psa.prev.date, psa.date) <= 365 && psa.value - psa.prev.value > 1.4
    if (jump && s === 'good') s = 'warn'
    markers.push(mark('PSA', psa, s))
    const moved = movedText(psa) ? `, ${movedText(psa)}` : ''
    bits.push(!jump && s === 'warn' && inLab(psa)
      ? `In the lab range, but PSA ${show(psa)} is between 2.5 and 4${moved}.`
      : `PSA is ${show(psa)}${moved}. ${s === 'good' ? 'Under 2.5 is comfortable.' : jump ? 'It rose more than 1.4 within a year, a change commonly flagged on testosterone even when the number itself is fine.' : psa.value >= 4 ? 'That is at or above 4, the cut-off most labs use.' : 'That is between 2.5 and 4.'}`)
    if (s !== 'good') {
      causes.push('Testosterone itself lifts PSA a little in the first year.', 'Cycling, sex or a prostate infection in the 48 hours before the draw.', 'Age and an enlarged prostate.')
    }
  }
  const status = worst(...markers.map((m) => m.status))
  const headline = status === 'bad' ? 'PSA is high' : status === 'warn' ? 'A PSA to watch' : status === 'good' ? 'PSA looks fine' : 'No PSA data yet'
  return { id: 'prostate', icon: ShieldAlert, label: 'Prostate', section: 'Prostate', status, headline, markers, story: bits.join(' '), causes, since: sinceOf(psa) }
}

// ── 11. Inflammation ───────────────────────────────────────────────────────
function buildInflammation(h: History): Finding {
  // hs-CRP is the low-range cardiac assay; plain CRP is read on the lab's range.
  const hs = get(h, 'hs_crp'); const crp = hs ?? get(h, 'crp'); const hcy = get(h, 'homocysteine')
  const markers: MarkerVal[] = []
  const bits: string[] = []
  const causes: string[] = []
  if (crp) {
    const s = hs ? bands(crp.value, 1, 3) : byRange(crp) !== 'none' ? byRange(crp) : bands(crp.value, 5, 10)
    markers.push(mark(hs ? 'hs-CRP' : 'CRP', crp, s))
    bits.push(`${hs ? 'hs-CRP' : 'CRP'} ${show(crp)} shows ${s === 'good' ? 'low' : s === 'warn' ? 'mild' : 'high'} background inflammation.`)
    if (s !== 'good') {
      causes.push('Hard training in the days before the draw; CRP spikes after big sessions.', 'An infection, an injury, poor sleep, or extra body fat.')
    }
  }
  if (hcy) {
    const s = bands(hcy.value, 10, 15)
    markers.push(mark('Homocysteine', hcy, s))
    if (s !== 'good') { bits.push(s === 'warn' && inLab(hcy) ? `In the lab range, but homocysteine ${show(hcy)} is on the high side, which adds to cardiovascular risk.` : `Homocysteine ${show(hcy)} is high, which adds to cardiovascular risk.`); }
  }
  const status = worst(...markers.map((m) => m.status))
  const headline = status === 'bad' ? 'Inflammation is high' : status === 'warn' ? 'Mild inflammation' : status === 'good' ? 'Inflammation looks low' : 'No inflammation data yet'
  return { id: 'inflammation', icon: Flame, label: 'Inflammation', section: 'Inflammation', status, headline, markers, story: bits.join(' '), causes, since: sinceOf(crp) }
}

// ── Build all ──────────────────────────────────────────────────────────────
const ORDER: Record<Status, number> = { bad: 0, warn: 1, good: 2, none: 3 }

/** The read of one test (`examId`, else the latest); other exams only supply the comparison. */
export function buildFindings(results: EnrichedResult[], exams: LabExam[], examId?: number): Finding[] {
  const id = examId ?? [...exams].sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))[0]?.id
  if (results.length === 0 || id === undefined) return []
  const h = buildHistory(results, exams, id)
  return [
    buildCardio(h), buildHormones(h), buildBlood(h), buildLiver(h), buildKidney(h),
    buildMetabolic(h), buildThyroid(h), buildVitamins(h), buildHpta(h), buildProstate(h), buildInflammation(h),
  ]
    .filter((f) => f.status !== 'none' && f.markers.length > 0)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status])
}

export function useLabFindings(results: EnrichedResult[], exams: LabExam[], examId?: number): Finding[] {
  return useMemo(() => buildFindings(results, exams, examId), [results, exams, examId])
}

// The written summary at the top of the page: what is outside range, what moved, what is fine.
export function summarize(findings: Finding[]): string[] {
  const bad = findings.filter((f) => f.status === 'bad')
  const warn = findings.filter((f) => f.status === 'warn')
  const good = findings.filter((f) => f.status === 'good')
  const out: string[] = []
  if (findings.length === 0) return out

  const first: string[] = []
  if (bad.length) first.push(`${list(bad.map((f) => f.label))} ${bad.length === 1 ? 'is' : 'are'} outside range`)
  if (warn.length) first.push(`${list(warn.map((f) => f.label.toLowerCase()))} ${warn.length === 1 ? 'is' : 'are'} worth watching`)
  if (good.length) first.push(good.length === findings.length ? 'every section looks fine' : `${good.length === 1 ? good[0].label.toLowerCase() + ' looks' : `${good.length} sections look`} fine`)
  out.push(`${cap(list(first))}.`)

  // Suppressed LH/FSH wobble around zero; a "33%" swing there is noise, not news.
  const moves = findings.filter((f) => f.id !== 'hpta').flatMap((f) =>
    f.markers
      .filter((m) => m.trend && m.trend.dir !== 'flat' && Math.abs(m.trend.pct) >= 10 && m.status !== 'good')
      .map((m) => ({ text: `${m.label} ${m.trend!.dir === 'up' ? 'up' : 'down'} ${Math.abs(m.trend!.pct).toFixed(0)}%`, pct: Math.abs(m.trend!.pct) })),
  ).sort((a, b) => b.pct - a.pct).slice(0, 3)
  const since = dayText(findings.find((f) => f.since)?.since)
  if (moves.length) out.push(`Since ${since ? `your ${since} test` : 'your last test'}: ${list(moves.map((m) => m.text))}.`)

  const heads = [...bad, ...warn].slice(0, 3).map((f) => f.headline.toLowerCase())
  if (heads.length) out.push(`${cap(list(heads))}. Each section below says what the numbers are and how they sit together.`)
  return out
}

