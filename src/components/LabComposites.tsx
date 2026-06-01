/**
 * LabComposites — clinically meaningful multi-marker panels for TRT/steroid users.
 *
 * Always-visible compact cards showing status + key values inline.
 * Click to expand the clinical note + evidence-based recommendations.
 */

import { useMemo, useState } from 'react'
import type { LabExam } from '../lib/db'
import { canonicalize } from '../lib/markers'
import type { EnrichedResult } from '../lib/insights'
import { ChevronDown, ChevronUp } from 'lucide-react'

type Status = 'good' | 'warn' | 'bad' | 'none'
type MarkerVal = { label: string; display: string; status: Status }

type CompositePanel = {
  id: string
  icon: string
  label: string
  status: Status
  pills: MarkerVal[]         // always shown inline
  note: string               // shown when expanded
  recommendations: Array<{ text: string; source: string }>
}

// ── Unit converters ────────────────────────────────────────────────────────
const nmolTongdl = (v: number) => v * 28.84   // T nmol/L → ng/dL
const pmolTopgml = (v: number) => v * 0.272   // E2 pmol/L → pg/mL
const gLTogdl    = (v: number) => v / 10      // Hgb g/L → g/dL

// ── Lookup helpers ─────────────────────────────────────────────────────────
function buildLatestMap(results: EnrichedResult[], exams: LabExam[]) {
  const examDateMap = new Map(exams.map(e => [e.id, e.collectedAt]))
  const sorted = [...results]
    .filter(r => r.value !== undefined)
    .sort((a, b) => (examDateMap.get(b.examId) ?? '').localeCompare(examDateMap.get(a.examId) ?? ''))
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

function fmt(v: number, digits = 1) {
  return v % 1 === 0 ? String(v) : v.toFixed(digits)
}

// ── 1. Cardiovascular ──────────────────────────────────────────────────────
function buildCardio(map: Map<string, EnrichedResult>): CompositePanel {
  const tc  = getVal(map, 'total_cholesterol')
  const hdl = getVal(map, 'hdl')
  const ldl = getVal(map, 'ldl')
  const tg  = getVal(map, 'triglycerides')

  const pills: MarkerVal[] = []
  const recs: CompositePanel['recommendations'] = []

  let tcHdlStatus: Status = 'none'
  if (tc && hdl && hdl.value > 0) {
    const ratio = tc.value / hdl.value
    tcHdlStatus = ratio <= 3.5 ? 'good' : ratio <= 5 ? 'warn' : 'bad'
    pills.push({ label: 'TC/HDL', display: fmt(ratio, 2), status: tcHdlStatus })
  }

  let aipStatus: Status = 'none'
  if (tg && hdl && hdl.value > 0) {
    const aip = Math.log10(tg.value / hdl.value)
    aipStatus = aip < 0.11 ? 'good' : aip < 0.21 ? 'warn' : 'bad'
    pills.push({ label: 'AIP', display: fmt(aip, 3), status: aipStatus })
  }

  if (hdl) {
    const s: Status = hdl.value >= 1.0 ? 'good' : 'warn'
    pills.push({ label: 'HDL', display: `${hdl.value} ${hdl.unit}`, status: s })
    if (s === 'warn') recs.push({
      text: 'Low HDL is common on AAS. Regular aerobic exercise, omega-3 (2–4 g EPA/DHA/day), and reducing AAS dose can help raise HDL.',
      source: 'AHA Lipid Guidelines',
    })
  }
  if (ldl) {
    const s: Status = ldl.value < 2.6 ? 'good' : ldl.value < 3.4 ? 'warn' : 'bad'
    pills.push({ label: 'LDL', display: `${ldl.value} ${ldl.unit}`, status: s })
    if (s !== 'good') recs.push({
      text: 'Elevated LDL: consider plant sterols, soluble fibre (oats, psyllium), and discuss statin therapy if persistently elevated.',
      source: 'ESC/EAS Dyslipidaemia Guidelines',
    })
  }

  if (pills.length === 0) pills.push({ label: 'No lipid data', display: '—', status: 'none' })
  const status = worst(...pills.map(p => p.status))
  const note = status === 'bad'
    ? 'High cardiovascular risk — AAS commonly suppresses HDL and raises LDL/AIP. Review dose and add cardio-protective interventions.'
    : status === 'warn'
    ? 'Lipid profile needs monitoring. Common on anabolic steroids. Check every 3 months on active cycle.'
    : 'Lipid profile within healthy range.'

  return { id: 'cardio', icon: '❤️', label: 'Cardiovascular', status, pills, note, recommendations: recs }
}

// ── 2. Hormone balance ─────────────────────────────────────────────────────
function buildHormones(map: Map<string, EnrichedResult>): CompositePanel {
  const tt   = getVal(map, 'total_testosterone')
  const ft   = getVal(map, 'free_testosterone')
  const e2   = getVal(map, 'estradiol')
  const shbg = getVal(map, 'shbg')

  const pills: MarkerVal[] = []
  const recs: CompositePanel['recommendations'] = []

  if (tt) {
    const ttNgdl = tt.unit.toLowerCase().includes('nmol') ? nmolTongdl(tt.value) : tt.value
    const s: Status = ttNgdl >= 700 ? 'good' : ttNgdl >= 400 ? 'warn' : 'bad'
    pills.push({ label: 'Total T', display: `${tt.value} ${tt.unit}`, status: s })
  }

  if (tt && e2 && e2.value > 0) {
    const ttNgdl = tt.unit.toLowerCase().includes('nmol') ? nmolTongdl(tt.value) : tt.value
    const e2Pgml = e2.unit.toLowerCase().includes('pmol') ? pmolTopgml(e2.value) : e2.value
    const ratio  = ttNgdl / e2Pgml
    const s: Status = ratio >= 15 && ratio <= 30 ? 'good' : (ratio >= 10 || ratio <= 50) ? 'warn' : 'bad'
    pills.push({ label: 'T:E2', display: fmt(ratio, 1), status: s })
    if (ratio < 10) recs.push({
      text: 'Low T:E2 ratio — excess aromatization. Discuss AI dose with doctor. Avoid over-correction (crashed E2 is worse).',
      source: 'Testosterone Therapy Guidelines',
    })
    if (ratio > 50) recs.push({
      text: 'High T:E2 ratio — E2 may be too suppressed by AI. Joint pain and low libido are early signs. Reduce or pause AI.',
      source: 'Testosterone Therapy Guidelines',
    })
  }

  if (e2) {
    const e2Pgml = e2.unit.toLowerCase().includes('pmol') ? pmolTopgml(e2.value) : e2.value
    const s: Status = e2Pgml >= 20 && e2Pgml <= 40 ? 'good' : e2Pgml > 60 || e2Pgml < 15 ? 'bad' : 'warn'
    pills.push({ label: 'E2', display: `${e2.value} ${e2.unit}`, status: s })
  }

  if (shbg) {
    const s: Status = shbg.value >= 20 && shbg.value <= 50 ? 'good' : 'warn'
    pills.push({ label: 'SHBG', display: `${shbg.value} ${shbg.unit}`, status: s })
    if (shbg.value > 50) recs.push({
      text: 'High SHBG reduces free testosterone bioavailability. Boron (10 mg/day), more frequent TRT injections, and a lower carbohydrate diet may help lower SHBG.',
      source: 'NCBI — SHBG Modulation',
    })
  }

  if (ft) {
    const s: Status = ft.value >= 0.3 ? 'good' : ft.value >= 0.2 ? 'warn' : 'bad'
    pills.push({ label: 'Free T', display: `${ft.value} ${ft.unit}`, status: s })
  }

  if (pills.length === 0) pills.push({ label: 'No hormone data', display: '—', status: 'none' })
  const status = worst(...pills.map(p => p.status))
  const note = status === 'bad'
    ? 'Hormone panel out of balance. Review injection timing, AI dosing, and SHBG.'
    : status === 'warn'
    ? 'Some hormone markers need attention. Check E2 symptoms vs numbers before adjusting.'
    : 'Hormone panel looks balanced. T:E2 ratio indicates good aromatization control.'

  return { id: 'hormones', icon: '⚗️', label: 'Hormone balance', status, pills, note, recommendations: recs }
}

// ── 3. Blood health ────────────────────────────────────────────────────────
function buildBlood(map: Map<string, EnrichedResult>): CompositePanel {
  const hct = getVal(map, 'hematocrit')
  const hgb = getVal(map, 'hemoglobin')
  const rbc = getVal(map, 'rbc')

  const pills: MarkerVal[] = []
  const recs: CompositePanel['recommendations'] = []

  if (hct) {
    const pct = hct.value < 1 ? hct.value * 100 : hct.value
    const s: Status = pct < 50 ? 'good' : pct < 52 ? 'warn' : 'bad'
    pills.push({ label: 'HCT', display: `${fmt(pct, 1)}%`, status: s })
    if (pct >= 52) recs.push({
      text: 'HCT ≥52% significantly raises blood viscosity and VTE risk. Donate blood or arrange therapeutic phlebotomy. Stay well hydrated. Discuss TRT dose reduction.',
      source: 'AUA/Endocrine Society TRT Guidelines',
    })
    if (pct >= 50 && pct < 52) recs.push({
      text: 'HCT approaching threshold. Drink 3+ litres of water daily. Reduce red meat. Monitor monthly.',
      source: 'AUA TRT Guidelines',
    })
  }
  if (hgb) {
    const gdl = hgb.unit.toLowerCase() === 'g/l' ? gLTogdl(hgb.value) : hgb.value
    const s: Status = gdl <= 17.5 ? 'good' : gdl <= 18.5 ? 'warn' : 'bad'
    pills.push({ label: 'Hgb', display: `${fmt(gdl, 1)} g/dL`, status: s })
  }
  if (rbc) {
    const s: Status = rbc.value < 5.9 ? 'good' : rbc.value < 6.5 ? 'warn' : 'bad'
    pills.push({ label: 'RBC', display: `${rbc.value} ${rbc.unit}`, status: s })
  }

  if (pills.length === 0) pills.push({ label: 'No CBC data', display: '—', status: 'none' })
  const status = worst(...pills.map(p => p.status))
  const note = status === 'bad'
    ? 'Erythrocytosis risk. HCT >52% is the clinical threshold for therapeutic phlebotomy on TRT.'
    : status === 'warn'
    ? 'HCT approaching threshold — monitor closely, stay hydrated.'
    : 'Blood count within safe range. TRT-driven erythropoiesis appears controlled.'

  return { id: 'blood', icon: '🩸', label: 'Blood health', status, pills, note, recommendations: recs }
}

// ── 4. Liver ───────────────────────────────────────────────────────────────
function buildLiver(map: Map<string, EnrichedResult>): CompositePanel {
  const alt = getVal(map, 'alt')
  const ast = getVal(map, 'ast')
  const ggt = getVal(map, 'ggt')
  const ck  = getVal(map, 'creatine_kinase')

  const pills: MarkerVal[] = []
  const recs: CompositePanel['recommendations'] = []
  const ULN = 40

  const muscleSource = ck && ck.value > 200 && (!ggt || ggt.value < 50)

  if (alt) {
    const x = alt.value / ULN
    const s: Status = x < 1 ? 'good' : x < 3 ? 'warn' : 'bad'
    pills.push({ label: 'ALT', display: `${alt.value} ${alt.unit}`, status: muscleSource ? 'warn' : s })
  }
  if (ast) {
    const x = ast.value / ULN
    const s: Status = x < 1 ? 'good' : x < 3 ? 'warn' : 'bad'
    pills.push({ label: 'AST', display: `${ast.value} ${ast.unit}`, status: muscleSource ? 'warn' : s })
  }
  if (ggt) {
    const x = ggt.value / 50
    const s: Status = x < 1 ? 'good' : x < 3 ? 'warn' : 'bad'
    pills.push({ label: 'GGT', display: `${ggt.value} ${ggt.unit}`, status: s })
  }

  if (pills.length === 0) pills.push({ label: 'No liver data', display: '—', status: 'none' })
  const rawStatus = worst(...pills.map(p => p.status))
  const status: Status = muscleSource ? 'warn' : rawStatus

  const note = muscleSource
    ? 'ALT/AST elevation likely from muscle damage (CK elevated, GGT normal) — exercise artifact, not liver damage.'
    : rawStatus === 'bad'
    ? 'Significant liver enzyme elevation. If on oral AAS, discontinue and retest in 2 weeks. Hepatology referral if >5× ULN.'
    : rawStatus === 'warn'
    ? 'Mild enzyme elevation. Watch closely on oral steroids — GGT is the key discriminator for true liver source.'
    : 'Liver enzymes within normal range.'

  if (!muscleSource && rawStatus !== 'good') recs.push({
    text: 'Reduce or eliminate oral 17α-alkylated steroids. TUDCA (500–1000 mg/day) and NAC (600 mg/day) have supporting evidence for hepatoprotection during AAS use.',
    source: 'NCBI — Liver Injury from AAS',
  })

  return { id: 'liver', icon: '🫀', label: 'Liver', status, pills, note, recommendations: recs }
}

// ── 5. HPTA status ─────────────────────────────────────────────────────────
function buildHpta(map: Map<string, EnrichedResult>): CompositePanel {
  const lh  = getVal(map, 'lh')
  const fsh = getVal(map, 'fsh')

  const pills: MarkerVal[] = []
  const recs: CompositePanel['recommendations'] = []

  if (lh)  pills.push({ label: 'LH',  display: `${lh.value} ${lh.unit}`,  status: lh.value < 2  ? 'warn' : lh.value > 10 ? 'bad' : 'good' })
  if (fsh) pills.push({ label: 'FSH', display: `${fsh.value} ${fsh.unit}`, status: fsh.value < 2 ? 'warn' : fsh.value > 10 ? 'bad' : 'good' })

  if (pills.length === 0) pills.push({ label: 'No LH/FSH data', display: '—', status: 'none' })
  const status = worst(...pills.map(p => p.status))

  const bothSuppressed = lh && fsh && lh.value < 2 && fsh.value < 2
  const note = bothSuppressed
    ? 'Full HPTA suppression — expected on active TRT/AAS. Endogenous production is offline. Plan PCT if cycling off.'
    : status === 'bad'
    ? 'Very high LH/FSH may indicate primary hypogonadism (testes not responding to signal). Consult endocrinology.'
    : status === 'good'
    ? 'LH/FSH in normal range — either not suppressed or recovering post-cycle.'
    : 'Partial suppression or incomplete data.'

  if (bothSuppressed) recs.push({
    text: 'If planning PCT after cycle: HCG (500 IU EOD × 3 weeks) followed by Clomid (25–50 mg/day × 4–6 weeks) or Nolvadex (20–40 mg/day × 4–6 weeks) is a common recovery protocol.',
    source: "HPTA Recovery Protocols — Men's Health Forum",
  })

  return { id: 'hpta', icon: '🧠', label: 'HPTA status', status, pills, note, recommendations: recs }
}

// ── Compact composite card ─────────────────────────────────────────────────
function CompositeCard({ panel, expanded, onToggle }: {
  panel: CompositePanel
  expanded: boolean
  onToggle: () => void
}) {
  const statusColor = panel.status === 'good' ? 'var(--good)'
    : panel.status === 'warn' ? 'var(--warn)'
    : panel.status === 'bad'  ? 'var(--bad)'
    : 'var(--ink-mute)'

  const statusBg = panel.status === 'good' ? 'var(--good-soft)'
    : panel.status === 'warn' ? 'var(--warn-soft)'
    : panel.status === 'bad'  ? 'var(--bad-soft)'
    : 'var(--surface-2)'

  const statusText = panel.status === 'good' ? '✓ Good'
    : panel.status === 'warn' ? '~ Monitor'
    : panel.status === 'bad'  ? '! Action'
    : 'No data'

  const hasDetail = panel.note || panel.recommendations.length > 0

  return (
    <button
      type="button"
      className="composite-card"
      style={{ borderLeft: `3px solid ${statusColor}` }}
      onClick={hasDetail ? onToggle : undefined}
    >
      {/* Header row: icon + name (left) · badge + chevron (right) */}
      <div className="composite-head">
        <span className="composite-icon">{panel.icon}</span>
        <span className="composite-label">{panel.label}</span>
        <span className="composite-badge" style={{ background: statusBg, color: statusColor }}>
          {statusText}
        </span>
        {hasDetail && (
          <span className="composite-toggle" aria-hidden>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        )}
      </div>

      {/* Pills row — wraps freely on its own line, never collides with badge */}
      <div className="composite-pills">
        {panel.pills.map(p => (
          <span
            key={p.label}
            className="composite-pill"
            style={{
              color: p.status === 'good' ? 'var(--good)'
                : p.status === 'warn' ? 'var(--warn)'
                : p.status === 'bad'  ? 'var(--bad)'
                : 'var(--ink-dim)',
            }}
          >
            <span className="composite-pill-label">{p.label}</span>
            <span className="composite-pill-val">{p.display}</span>
          </span>
        ))}
      </div>

      {/* Expandable detail */}
      {expanded && hasDetail && (
        <div className="composite-detail">
          <p className="composite-note">{panel.note}</p>
          {panel.recommendations.map((rec, i) => (
            <div key={i} className="composite-rec">
              <span className="composite-rec-text">{rec.text}</span>
              <span className="composite-rec-source">Source: {rec.source}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  )
}

// ── Main export ────────────────────────────────────────────────────────────
export function LabComposites({ results, exams }: { results: EnrichedResult[]; exams: LabExam[] }) {
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

  const actionCount  = panels.filter(p => p.status === 'bad').length
  const monitorCount = panels.filter(p => p.status === 'warn').length

  return (
    <section className="surface col-12">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div>
          <span className="section-label">Smart analysis</span>
          <h3 style={{ margin: 0 }}>Composites</h3>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {actionCount  > 0 && <span className="chip" style={{ background: 'var(--bad-soft)',  color: 'var(--bad)'  }}>{actionCount} action</span>}
          {monitorCount > 0 && <span className="chip" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>{monitorCount} monitor</span>}
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
