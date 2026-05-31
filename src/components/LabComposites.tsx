/**
 * LabComposites — clinically meaningful multi-marker panels for TRT/steroid users.
 *
 * Composites:
 *  1. Cardiovascular  — TC/HDL ratio, Atherogenic Index of Plasma (AIP), LDL, Non-HDL
 *  2. Hormone balance — Total T, Free T, E2, SHBG, T:E2 ratio
 *  3. Blood health    — Haematocrit, Haemoglobin, RBC (erythrocytosis)
 *  4. Liver           — ALT, AST, GGT pattern (hepatocellular vs muscle source)
 *  5. HPTA status     — LH + FSH suppression vs recovery pattern
 *
 * Thresholds sourced from AUA TRT guidelines, Endocrine Society, ACG liver guideline.
 */

import type { LabExam } from '../lib/db'
import { canonicalize } from '../lib/markers'
import type { EnrichedResult } from '../lib/insights'

type Status = 'good' | 'warn' | 'bad' | 'none'
type MarkerVal = { value: number; unit: string; label: string; status: Status }

type CompositePanel = {
  id: string
  icon: string
  label: string
  status: Status
  headline: string   // one-line summary shown on collapsed card
  note: string       // clinical interpretation
  markers: MarkerVal[]
}

// ── Unit converters ────────────────────────────────────────────────────────
// Testosterone: nmol/L → ng/dL
const nmolTongdl = (v: number) => v * 28.84
// Estradiol: pmol/L → pg/mL
const pmolTopgml = (v: number) => v * 0.272
// Haemoglobin: g/L → g/dL
const gLTogdl = (v: number) => v / 10

// ── Lookup helpers ─────────────────────────────────────────────────────────
function buildLatestMap(results: EnrichedResult[], exams: LabExam[]) {
  const examDateMap = new Map(exams.map(e => [e.id, e.collectedAt]))
  // Sort results newest-first
  const sorted = [...results]
    .filter(r => r.value !== undefined)
    .sort((a, b) => {
      const da = examDateMap.get(a.examId) ?? ''
      const db = examDateMap.get(b.examId) ?? ''
      return db.localeCompare(da)
    })
  // Map canonicalized key → first (newest) result
  const map = new Map<string, EnrichedResult>()
  for (const r of sorted) {
    const canon = canonicalize(r.marker)
    const key = canon?.key ?? r.marker.toLowerCase().trim()
    if (!map.has(key)) map.set(key, r)
  }
  return map
}

function getVal(map: Map<string, EnrichedResult>, ...keys: string[]): { value: number; unit: string } | null {
  for (const k of keys) {
    const r = map.get(k)
    if (r?.value !== undefined) return { value: r.value, unit: r.unit ?? '' }
  }
  return null
}

function worst(...statuses: Status[]): Status {
  if (statuses.includes('bad'))  return 'bad'
  if (statuses.includes('warn')) return 'warn'
  if (statuses.includes('good')) return 'good'
  return 'none'
}

function statusLabel(s: Status): string {
  if (s === 'good') return 'All good'
  if (s === 'warn') return 'Monitor'
  if (s === 'bad')  return 'Action'
  return 'No data'
}

// ── 1. Cardiovascular ──────────────────────────────────────────────────────
function buildCardio(map: Map<string, EnrichedResult>): CompositePanel {
  const tc    = getVal(map, 'total_cholesterol')
  const hdl   = getVal(map, 'hdl')
  const ldl   = getVal(map, 'ldl')
  const tg    = getVal(map, 'triglycerides')
  const nonHdl = getVal(map, 'non_hdl')

  const markers: MarkerVal[] = []

  // TC/HDL ratio
  let tcHdlStatus: Status = 'none'
  let tcHdlVal: number | null = null
  if (tc && hdl && hdl.value > 0) {
    tcHdlVal = tc.value / hdl.value
    tcHdlStatus = tcHdlVal <= 3.5 ? 'good' : tcHdlVal <= 5 ? 'warn' : 'bad'
    markers.push({ label: 'TC/HDL', value: tcHdlVal, unit: '', status: tcHdlStatus })
  }

  // AIP = log10(TG_mmol / HDL_mmol)  — only valid if both in mmol/L
  let aipStatus: Status = 'none'
  if (tg && hdl && hdl.value > 0) {
    const aip = Math.log10(tg.value / hdl.value)
    aipStatus = aip < 0.11 ? 'good' : aip < 0.21 ? 'warn' : 'bad'
    markers.push({ label: 'AIP', value: parseFloat(aip.toFixed(3)), unit: '', status: aipStatus })
  }

  // HDL (men: ≥1.0 mmol/L = good, <1.0 = warn)
  let hdlStatus: Status = 'none'
  if (hdl) {
    hdlStatus = hdl.value >= 1.0 ? 'good' : 'warn'
    markers.push({ label: 'HDL', value: hdl.value, unit: hdl.unit, status: hdlStatus })
  }

  // LDL (mmol/L: <2.6 good, 2.6-3.4 warn, >3.4 bad)
  let ldlStatus: Status = 'none'
  if (ldl) {
    ldlStatus = ldl.value < 2.6 ? 'good' : ldl.value < 3.4 ? 'warn' : 'bad'
    markers.push({ label: 'LDL', value: ldl.value, unit: ldl.unit, status: ldlStatus })
  }

  if (nonHdl) {
    const nonHdlStatus: Status = nonHdl.value < 3.37 ? 'good' : nonHdl.value < 4.14 ? 'warn' : 'bad'
    markers.push({ label: 'Non-HDL', value: nonHdl.value, unit: nonHdl.unit, status: nonHdlStatus })
  }

  const status = markers.length ? worst(...markers.map(m => m.status)) : 'none'
  const headline = tcHdlVal !== null
    ? `TC/HDL ${tcHdlVal.toFixed(2)} · HDL ${hdl?.value ?? '—'} · LDL ${ldl?.value ?? '—'}`
    : 'Upload lipid panel to see cardiovascular risk'

  const note = status === 'bad'
    ? 'Elevated cardiovascular risk — AAS commonly suppresses HDL and raises LDL. Consider dose review.'
    : status === 'warn'
    ? 'Some lipid markers need monitoring. Common on anabolic steroids.'
    : status === 'good'
    ? 'Lipid profile within healthy range. Keep monitoring every 3–6 months on TRT.'
    : 'Add a lipid panel to assess cardiovascular risk.'

  return { id: 'cardio', icon: '❤️', label: 'Cardiovascular', status, headline, note, markers }
}

// ── 2. Hormone balance ─────────────────────────────────────────────────────
function buildHormones(map: Map<string, EnrichedResult>): CompositePanel {
  const tt   = getVal(map, 'total_testosterone')
  const ft   = getVal(map, 'free_testosterone')
  const e2   = getVal(map, 'estradiol')
  const shbg = getVal(map, 'shbg')

  const markers: MarkerVal[] = []

  // Total T
  if (tt) {
    // Support both nmol/L (EU) and ng/dL (US)
    const ttNgdl = tt.unit.toLowerCase().includes('nmol') ? nmolTongdl(tt.value) : tt.value
    const ttStatus: Status = ttNgdl >= 700 ? 'good' : ttNgdl >= 400 ? 'warn' : 'bad'
    markers.push({ label: 'Total T', value: tt.value, unit: tt.unit, status: ttStatus })
  }

  // T:E2 ratio (T in ng/dL, E2 in pg/mL — higher = lower relative E2)
  // Optimal on TRT: T/E2 = 15–30
  if (tt && e2 && e2.value > 0) {
    const ttNgdl = tt.unit.toLowerCase().includes('nmol') ? nmolTongdl(tt.value) : tt.value
    const e2Pgml = e2.unit.toLowerCase().includes('pmol') ? pmolTopgml(e2.value) : e2.value
    const ratio  = ttNgdl / e2Pgml
    const ratioStatus: Status = ratio >= 15 && ratio <= 30 ? 'good'
      : (ratio >= 10 && ratio < 15) || (ratio > 30 && ratio <= 50) ? 'warn'
      : 'bad'
    markers.push({ label: 'T:E2', value: parseFloat(ratio.toFixed(1)), unit: '', status: ratioStatus })
  }

  // E2 (pmol/L: optimal 73–147, >180 = elevated, <55 = crashed)
  if (e2) {
    const e2Pgml = e2.unit.toLowerCase().includes('pmol') ? pmolTopgml(e2.value) : e2.value
    const e2Status: Status = e2Pgml >= 20 && e2Pgml <= 40 ? 'good'
      : e2Pgml > 40 && e2Pgml <= 60 ? 'warn'
      : e2Pgml < 15 ? 'bad'
      : e2Pgml > 60 ? 'bad'
      : 'warn'
    markers.push({ label: 'E2', value: e2.value, unit: e2.unit, status: e2Status })
  }

  // SHBG (optimal 20–50 nmol/L for TRT)
  if (shbg) {
    const shbgStatus: Status = shbg.value >= 20 && shbg.value <= 50 ? 'good'
      : shbg.value > 50 ? 'warn'
      : 'warn'
    markers.push({ label: 'SHBG', value: shbg.value, unit: shbg.unit, status: shbgStatus })
  }

  // Free T (nmol/L: >0.3 good, 0.2–0.3 warn, <0.2 bad)
  if (ft) {
    const ftStatus: Status = ft.value >= 0.3 ? 'good' : ft.value >= 0.2 ? 'warn' : 'bad'
    markers.push({ label: 'Free T', value: ft.value, unit: ft.unit, status: ftStatus })
  }

  const status = markers.length ? worst(...markers.map(m => m.status)) : 'none'

  const ttDisplay = tt ? `${tt.value} ${tt.unit}` : '—'
  const e2Display = e2 ? `E2 ${e2.value} ${e2.unit}` : ''
  const headline = `T ${ttDisplay}${e2Display ? ' · ' + e2Display : ''}`

  const note = status === 'bad'
    ? 'Hormone levels outside optimal range. Review dose, injection timing, and AI usage.'
    : status === 'warn'
    ? 'Some hormone markers need attention. Check E2 symptoms vs labs before adjusting AI.'
    : status === 'good'
    ? 'Hormone panel looks balanced. T:E2 ratio indicates good aromatization control.'
    : 'Add a hormone panel to track testosterone, E2, and SHBG.'

  return { id: 'hormones', icon: '⚗️', label: 'Hormone balance', status, headline, note, markers }
}

// ── 3. Blood health (erythrocytosis) ───────────────────────────────────────
function buildBlood(map: Map<string, EnrichedResult>): CompositePanel {
  const hct = getVal(map, 'hematocrit')
  const hgb = getVal(map, 'hemoglobin')
  const rbc = getVal(map, 'rbc')

  const markers: MarkerVal[] = []

  if (hct) {
    const pct = hct.value < 1 ? hct.value * 100 : hct.value  // handle 0.478 vs 47.8
    const s: Status = pct < 50 ? 'good' : pct < 52 ? 'warn' : 'bad'
    markers.push({ label: 'Haematocrit', value: parseFloat(pct.toFixed(1)), unit: '%', status: s })
  }

  if (hgb) {
    const gdl = hgb.unit.toLowerCase() === 'g/l' ? gLTogdl(hgb.value) : hgb.value
    const s: Status = gdl <= 17.5 ? 'good' : gdl <= 18.5 ? 'warn' : 'bad'
    markers.push({ label: 'Haemoglobin', value: parseFloat(gdl.toFixed(1)), unit: 'g/dL', status: s })
  }

  if (rbc) {
    // Could be 10^12/L or 10^6/µL — same numeric scale (6.4 vs 6.4)
    const s: Status = rbc.value < 5.9 ? 'good' : rbc.value < 6.5 ? 'warn' : 'bad'
    markers.push({ label: 'RBC', value: rbc.value, unit: rbc.unit, status: s })
  }

  const status = markers.length ? worst(...markers.map(m => m.status)) : 'none'

  const hctPct = hct ? (hct.value < 1 ? hct.value * 100 : hct.value).toFixed(1) : '—'
  const headline = `HCT ${hctPct}%${hgb ? ` · Hgb ${(hgb.unit === 'g/L' ? gLTogdl(hgb.value) : hgb.value).toFixed(1)} g/dL` : ''}`

  const note = status === 'bad'
    ? 'Erythrocytosis risk — HCT >52% requires therapeutic phlebotomy. High blood viscosity increases VTE/cardiovascular risk.'
    : status === 'warn'
    ? 'HCT approaching threshold. Stay hydrated, monitor closely. Consider dose reduction if above 52%.'
    : status === 'good'
    ? 'Blood count within safe range. TRT-driven erythropoiesis appears controlled.'
    : 'Add a full blood count to monitor erythrocytosis risk on TRT.'

  return { id: 'blood', icon: '🩸', label: 'Blood health', status, headline, note, markers }
}

// ── 4. Liver ───────────────────────────────────────────────────────────────
function buildLiver(map: Map<string, EnrichedResult>): CompositePanel {
  const alt  = getVal(map, 'alt')
  const ast  = getVal(map, 'ast')
  const ggt  = getVal(map, 'ggt')
  const ck   = getVal(map, 'creatine_kinase')

  const markers: MarkerVal[] = []
  const ULN_ALT = 40, ULN_AST = 40, ULN_GGT = 50

  // Determine if elevated enzymes are muscle-source (CK elevated, GGT normal)
  const muscleSource = ck && ck.value > 200 && (!ggt || ggt.value < ULN_GGT)

  if (alt) {
    const x = alt.value / ULN_ALT
    const s: Status = x < 1 ? 'good' : x < 3 ? 'warn' : 'bad'
    markers.push({ label: 'ALT', value: alt.value, unit: alt.unit, status: s })
  }
  if (ast) {
    const x = ast.value / ULN_AST
    const s: Status = x < 1 ? 'good' : x < 3 ? 'warn' : 'bad'
    markers.push({ label: 'AST', value: ast.value, unit: ast.unit, status: s })
  }
  if (ggt) {
    const x = ggt.value / ULN_GGT
    const s: Status = x < 1 ? 'good' : x < 3 ? 'warn' : 'bad'
    markers.push({ label: 'GGT', value: ggt.value, unit: ggt.unit, status: s })
  }
  if (ck) {
    const s: Status = ck.value < 200 ? 'good' : ck.value < 400 ? 'warn' : 'bad'
    markers.push({ label: 'CK', value: ck.value, unit: ck.unit, status: s })
  }

  const status = markers.length ? worst(...markers.map(m => m.status)) : 'none'

  const headline = alt && ast
    ? `ALT ${alt.value} · AST ${ast.value} · GGT ${ggt?.value ?? '—'}`
    : 'Add liver panel to assess hepatic stress'

  const note = muscleSource
    ? 'Elevated ALT/AST likely muscle-source (CK elevated, GGT normal) — exercise artifact, not liver damage.'
    : status === 'bad'
    ? 'Significant liver enzyme elevation. If on oral AAS, discontinue and retest. Hepatology referral if >5× ULN.'
    : status === 'warn'
    ? 'Mild enzyme elevation. Monitor closely on oral steroids. Ensure GGT is within range to rule out liver source.'
    : status === 'good'
    ? 'Liver enzymes within normal range. Low hepatotoxic burden.'
    : 'Add ALT, AST, and GGT to assess liver health.'

  return { id: 'liver', icon: '🫀', label: 'Liver', status, headline, note, markers }
}

// ── 5. HPTA status ─────────────────────────────────────────────────────────
function buildHpta(map: Map<string, EnrichedResult>): CompositePanel {
  const lh  = getVal(map, 'lh')
  const fsh = getVal(map, 'fsh')

  const markers: MarkerVal[] = []

  if (lh) {
    const s: Status = lh.value >= 2 && lh.value <= 8 ? 'good'
      : lh.value < 2 ? 'warn'
      : 'bad'
    markers.push({ label: 'LH', value: lh.value, unit: lh.unit, status: s })
  }
  if (fsh) {
    const s: Status = fsh.value >= 2 && fsh.value <= 8 ? 'good'
      : fsh.value < 2 ? 'warn'
      : 'bad'
    markers.push({ label: 'FSH', value: fsh.value, unit: fsh.unit, status: s })
  }

  const status = markers.length ? worst(...markers.map(m => m.status)) : 'none'

  const bothSuppressed = lh && fsh && lh.value < 2 && fsh.value < 2
  const headline = lh && fsh
    ? `LH ${lh.value} · FSH ${fsh.value} IU/L`
    : 'Add LH + FSH to assess HPTA'

  const note = bothSuppressed
    ? 'Full HPTA suppression — expected on active TRT/AAS. Endogenous production offline. Monitor for PCT if cycling.'
    : status === 'bad'
    ? 'Very high LH/FSH may indicate primary hypogonadism (testes not responding). Consult endocrinology.'
    : status === 'good'
    ? 'LH/FSH in normal range — either not on TRT or recovering post-cycle.'
    : 'Add a hormone panel including LH and FSH.'

  return { id: 'hpta', icon: '🧠', label: 'HPTA status', status, headline, note, markers }
}

// ── Composite card component ───────────────────────────────────────────────
function CompositeCard({ panel, expanded, onToggle }: {
  panel: CompositePanel
  expanded: boolean
  onToggle: () => void
}) {
  const statusColor = panel.status === 'good' ? 'var(--good)'
    : panel.status === 'warn' ? 'var(--warn)'
    : panel.status === 'bad' ? 'var(--bad)'
    : 'var(--ink-mute)'

  const statusBg = panel.status === 'good' ? 'var(--good-soft)'
    : panel.status === 'warn' ? 'var(--warn-soft)'
    : panel.status === 'bad' ? 'var(--bad-soft)'
    : 'var(--surface-2)'

  return (
    <div
      className="composite-card"
      style={{ borderLeft: `3px solid ${statusColor}` }}
    >
      <button type="button" className="composite-header" onClick={onToggle}>
        <span className="composite-icon">{panel.icon}</span>
        <div className="composite-title">
          <span className="composite-label">{panel.label}</span>
          <span className="composite-headline">{panel.headline}</span>
        </div>
        <span
          className="composite-badge"
          style={{ background: statusBg, color: statusColor }}
        >
          {statusLabel(panel.status)}
        </span>
      </button>

      {expanded && (
        <div className="composite-detail">
          <p className="composite-note">{panel.note}</p>
          {panel.markers.length > 0 && (
            <div className="composite-markers">
              {panel.markers.map(m => (
                <div key={m.label} className="composite-marker-row">
                  <span className="composite-marker-name">{m.label}</span>
                  <span className="composite-marker-val" style={{
                    color: m.status === 'good' ? 'var(--good)'
                      : m.status === 'warn' ? 'var(--warn)'
                      : m.status === 'bad' ? 'var(--bad)'
                      : 'var(--ink)',
                  }}>
                    {m.value}{m.unit ? ` ${m.unit}` : ''}
                  </span>
                  <span className="composite-marker-status" style={{ color: statusColor }}>
                    {m.status === 'good' ? '✓' : m.status === 'bad' ? '!' : '~'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'

export function LabComposites({
  results,
  exams,
}: {
  results: EnrichedResult[]
  exams: LabExam[]
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const panels = useMemo(() => {
    if (results.length === 0) return []
    const map = buildLatestMap(results, exams)
    return [
      buildCardio(map),
      buildHormones(map),
      buildBlood(map),
      buildLiver(map),
      buildHpta(map),
    ].filter(p => p.status !== 'none')
  }, [results, exams])

  if (panels.length === 0) return null

  const alertCount = panels.filter(p => p.status === 'bad').length
  const warnCount  = panels.filter(p => p.status === 'warn').length

  return (
    <section className="surface col-12">
      <div className="panel-header" style={{ marginBottom: 12 }}>
        <div>
          <span className="section-label">Smart analysis</span>
          <h3>Health composites</h3>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {alertCount > 0 && (
            <span className="chip" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>
              {alertCount} action
            </span>
          )}
          {warnCount > 0 && (
            <span className="chip" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
              {warnCount} monitor
            </span>
          )}
        </div>
      </div>
      <div className="composite-list">
        {panels.map(panel => (
          <CompositeCard
            key={panel.id}
            panel={panel}
            expanded={expanded === panel.id}
            onToggle={() => setExpanded(expanded === panel.id ? null : panel.id)}
          />
        ))}
      </div>
    </section>
  )
}
