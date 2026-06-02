import { useEffect, useMemo, useState } from 'react'
import { useTheme } from '../lib/useTheme'
import {
  ChevronDown, ChevronRight, ChevronUp,
  Edit2, FileText, FlaskConical, Plus, Trash2, X,
} from 'lucide-react'
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, ReferenceLine,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Compound, type InjectionLog, type LabExam, type VitalLog } from '../lib/db'
import { extractMarkersFromText, type ExtractedMarker } from '../lib/pdf'
import { type EnrichedResult } from '../lib/insights'
import { canonicalize, metaForKey, PANEL_ORDER, type LabPanel } from '../lib/markers'
import { EmptyState } from '../components/EmptyState'
import { LabComposites } from '../components/LabComposites'

// ── Types ─────────────────────────────────────────────────────────────────────

type MarkerEntry = {
  resultId?: number
  examId: number
  examName: string
  date: string           // ISO string
  value: number | undefined
  rawValue: string
  unit?: string
  low?: number
  high?: number
}

type MarkerSummary = {
  key: string
  label: string
  panel: LabPanel
  unit?: string
  low?: number
  high?: number
  entries: MarkerEntry[]  // all exams, newest first
}

// ── Range helpers ─────────────────────────────────────────────────────────────

function rangeStatus(v: number | undefined, low?: number, high?: number): 'good' | 'warn' | 'none' {
  if (v === undefined) return 'none'
  if (low !== undefined && v < low) return 'warn'
  if (high !== undefined && v > high) return 'warn'
  return 'good'
}

// Returns a 0–1 position for the value within [low, high], clamped
function rangePos(v: number, low?: number, high?: number): number | null {
  if (low === undefined || high === undefined) return null
  const range = high - low
  if (range <= 0) return null
  return Math.max(0, Math.min(1, (v - low) / range))
}

// ── Compact marker card ────────────────────────────────────────────────────────

function MarkerCard({
  summary,
  selected,
  onClick,
}: {
  summary: MarkerSummary
  selected: boolean
  onClick: () => void
}) {
  const latest  = summary.entries[0]
  const prev    = summary.entries[1]
  const val     = latest?.value
  // Use the LATEST entry's own confirmed range for the badge.
  // This means: if latest test has no lab range → no HIGH/LOW badge.
  // Never use summary-level catalog ranges for badges (avoids unit-mismatch false alarms).
  const latestLow  = latest?.low
  const latestHigh = latest?.high
  const status  = rangeStatus(val, latestLow, latestHigh)
  const pos     = val !== undefined ? rangePos(val, latestLow, latestHigh) : null
  const delta   = val !== undefined && prev?.value !== undefined ? val - prev.value : undefined

  return (
    <button
      type="button"
      className={`marker-card${selected ? ' selected' : ''}${status === 'warn' ? ' out' : ''}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      {/* Top row: name + status badge — name truncates, badge never clips */}
      <div className="mc-top">
        <span className="mc-name">{summary.label}</span>
        {val !== undefined && status !== 'none' && (
          <span className={`mc-badge ${status}`}>
            {status === 'good' ? 'OK' : latestHigh !== undefined && val !== undefined && val > latestHigh ? 'HIGH' : 'LOW'}
          </span>
        )}
      </div>

      {/* Main value + delta */}
      <div className="mc-value-row">
        <span className="mc-value">
          {val !== undefined ? (latest.rawValue || String(val)) : '—'}
        </span>
        {summary.unit && val !== undefined && (
          <span className="mc-unit">{summary.unit}</span>
        )}
        {delta !== undefined && Math.abs(delta) > 0.05 && (
          <span className={`mc-delta ${delta > 0 ? 'up' : 'down'}`}>
            {delta > 0 ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}
          </span>
        )}
      </div>

      {/* Range bar */}
      {pos !== null && (
        <div className="mc-range-bar">
          <div className="mc-range-fill" style={{ width: `${pos * 100}%` }} />
          <div className={`mc-range-dot ${status}`} style={{ left: `${pos * 100}%` }} />
        </div>
      )}
      {latestLow !== undefined && latestHigh !== undefined && (
        <div className="mc-range-labels">
          <span>{latestLow}</span>
          <span>{latestHigh}</span>
        </div>
      )}

      {/* Exam date */}
      {latest && (
        <div className="mc-date">
          {format(parseISO(latest.date), 'MMM d, yyyy')}
          {summary.entries.length > 1 && (
            <span className="mc-count">· {summary.entries.length} tests</span>
          )}
        </div>
      )}
    </button>
  )
}

// ── History pane (shown below a panel when a marker is selected) ───────────────

function MarkerHistoryPane({
  summary,
  onClose,
  onDelete,
  onEditTarget,
  hasPersonalTarget,
  colors,
}: {
  summary: MarkerSummary
  onClose: () => void
  onDelete: (resultId: number) => void
  onEditTarget: () => void
  hasPersonalTarget: boolean
  colors: ReturnType<typeof useTheme>['chart']
}) {
  const meta = metaForKey(summary.key)
  const chartData = [...summary.entries]
    .filter(e => e.value !== undefined)
    .reverse()  // oldest → newest for chart
    .map(e => ({
      date: format(parseISO(e.date), 'MMM d yy'),
      value: e.value,
    }))

  const min = Math.min(...chartData.map(d => d.value!))
  const max = Math.max(...chartData.map(d => d.value!))
  const pad = (max - min) * 0.25 || 5
  const yMin = Math.max(0, Math.floor(min - pad))
  const yMax = Math.ceil(max + pad)

  return (
    <div className="marker-history-pane">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
        <div>
          <span className="section-label" style={{ display: 'block' }}>
            {summary.panel} · all tests
          </span>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            {summary.label}
            {summary.unit && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ink-dim)' }}>{summary.unit}</span>}
          </h3>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <button
            type="button"
            className="ghost-button"
            style={{ fontSize: 12, height: 30 }}
            onClick={onEditTarget}
          >
            <Edit2 size={11} /> {hasPersonalTarget ? 'Edit range' : 'Set range'}
          </button>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Optimal range note */}
      {meta?.optimal?.note && (
        <p className="panel-note" style={{ marginBottom: 8 }}>{meta.optimal.note}</p>
      )}

      {/* Line chart */}
      {chartData.length > 1 ? (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={colors.grid} vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 10 }} />
            <YAxis domain={[yMin, yMax]} tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 10, fontSize: 12, color: colors.tooltipText }}
              formatter={(v) => [`${v} ${summary.unit ?? ''}`.trim(), summary.label]}
            />
            {summary.low !== undefined && (
              <ReferenceLine y={summary.low} stroke="var(--warn)" strokeDasharray="3 3" strokeWidth={1} />
            )}
            {summary.high !== undefined && (
              <ReferenceLine y={summary.high} stroke="var(--warn)" strokeDasharray="3 3" strokeWidth={1} />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={2.5}
              dot={{ r: 4, fill: 'var(--accent)', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="panel-note">Need at least 2 tests to show a trend.</p>
      )}

      {/* All tests list */}
      <div className="history-list" style={{ marginTop: 12 }}>
        {summary.entries.map((entry, i) => {
          const status = rangeStatus(entry.value, summary.low, summary.high)
          const nextEntry = summary.entries[i + 1]
          const delta = entry.value !== undefined && nextEntry?.value !== undefined
            ? entry.value - nextEntry.value
            : undefined
          return (
            <div
              key={entry.resultId ?? i}
              className={`history-row${status === 'warn' ? ' out' : ''}`}
            >
              <div className="history-row-date">
                <span>{format(parseISO(entry.date), 'MMM d, yyyy')}</span>
                <span className="history-exam-name">{entry.examName}</span>
              </div>
              <div className="history-row-val">
                <span className={`history-val-num ${status === 'warn' ? 'bad' : 'good'}`}>
                  {entry.rawValue}
                  {entry.unit && <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 3, color: 'var(--ink-dim)' }}>{entry.unit}</span>}
                </span>
                {delta !== undefined && Math.abs(delta) > 0.05 && (
                  <span className={`mc-delta ${delta > 0 ? 'up' : 'down'}`} style={{ fontSize: 11 }}>
                    {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}
                  </span>
                )}
                {status !== 'none' && (
                  <span className={`mc-badge ${status}`} style={{ fontSize: 10 }}>
                    {status === 'good' ? 'OK' : entry.value !== undefined && summary.high !== undefined && entry.value > summary.high ? 'HIGH' : 'LOW'}
                  </span>
                )}
              </div>
              {entry.resultId !== undefined && (
                <button
                  type="button"
                  className="icon-button danger"
                  style={{ width: 22, height: 22, opacity: 0.4 }}
                  title="Delete this result"
                  onClick={() => onDelete(entry.resultId!)}
                  onMouseOver={e => (e.currentTarget.style.opacity = '1')}
                  onMouseOut={e => (e.currentTarget.style.opacity = '0.4')}
                  aria-label="Delete result"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Labs component ────────────────────────────────────────────────────────

export function Labs({
  exams,
  results,
  files,
  addOpen,
  onAddClose,
  compounds: _c,
  injections: _i,
  vitals: _v,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  vitals: VitalLog[]
  exams: LabExam[]
  results: EnrichedResult[]
  files: Array<{ id?: number; name: string; status: string; extractedText?: string }>
  addOpen?: boolean
  onAddClose?: () => void
}) {
  const { chart: colors } = useTheme()
  const markerTargets = useLiveQuery(() => db.markerTargets.toArray(), [], [])
  const targetByKey   = useMemo(() => new Map((markerTargets ?? []).map(t => [t.marker, t])), [markerTargets])

  // Build marker summaries from ALL exams (newest first per entry)
  const markersByPanel = useMemo<Map<LabPanel, MarkerSummary[]>>(() => {
    if (exams.length === 0) return new Map()

    const examById = new Map(exams.map(e => [e.id, e]))
    const keyOrder: string[] = []
    const summaryMap = new Map<string, MarkerSummary>()

    // Sort results by exam date newest → oldest
    const sorted = [...results].sort((a, b) => {
      const ea = examById.get(a.examId)
      const eb = examById.get(b.examId)
      if (!ea || !eb) return 0
      return eb.collectedAt.localeCompare(ea.collectedAt)
    })

    for (const r of sorted) {
      const exam = examById.get(r.examId)
      if (!exam) continue
      const canon    = canonicalize(r.marker)
      const key      = canon?.key ?? r.marker.toLowerCase().trim()
      const personal = canon ? targetByKey.get(canon.key) : undefined

      // Confirmed range: lab-provided or user personal only — NEVER catalog.
      // Using catalog ranges causes false HIGH/LOW when units differ between labs.
      const confirmedLow  = personal?.low  ?? r.low
      const confirmedHigh = personal?.high ?? r.high

      // Sanitize rawValue: strip reference range text like "[80.0 - 98.0]; Outside..."
      const cleanRaw = r.rawValue
        ?.replace(/\s*[\[\(][0-9].*$/, '')  // strip [range] notation
        ?.replace(/\s*;.*$/, '')             // strip ; comments
        ?.trim()

      if (!summaryMap.has(key)) {
        keyOrder.push(key)
        summaryMap.set(key, {
          key,
          label:   canon?.label ?? r.marker,
          panel:   canon?.panel ?? 'Other',
          unit:    canon?.unit  ?? r.unit,
          low:     confirmedLow,
          high:    confirmedHigh,
          entries: [],
        })
      }
      const summary = summaryMap.get(key)!
      const dupKey = `${exam.name}|${exam.collectedAt.slice(0, 10)}`
      if (summary.entries.some(e => `${e.examName}|${e.date.slice(0, 10)}` === dupKey)) continue

      summary.entries.push({
        resultId: r.id,
        examId:   r.examId,
        examName: exam.name,
        date:     exam.collectedAt,
        value:    r.value,
        rawValue: cleanRaw ?? r.rawValue,
        unit:     r.unit ?? canon?.unit,
        low:      confirmedLow,
        high:     confirmedHigh,
      })
    }

    // Group by panel in PANEL_ORDER order
    const grouped = new Map<LabPanel, MarkerSummary[]>()
    for (const panel of PANEL_ORDER) grouped.set(panel, [])

    for (const key of keyOrder) {
      const s = summaryMap.get(key)!
      const list = grouped.get(s.panel) ?? []
      list.push(s)
      grouped.set(s.panel, list)
    }

    return grouped
  }, [exams, results, targetByKey])

  const hasData = exams.length > 0

  const [selectedKey,      setSelectedKey]      = useState<string | null>(null)
  const [showAddForm,      setShowAddForm]       = useState(false)
  const [collapsedPanels,  setCollapsedPanels]   = useState<Set<LabPanel>>(new Set())
  const [editingTargetKey, setEditingTargetKey]  = useState<string | null>(null)
  const [targetLow,        setTargetLow]         = useState('')
  const [targetHigh,       setTargetHigh]        = useState('')

  useEffect(() => { if (addOpen) { setShowAddForm(true); onAddClose?.() } }, [addOpen, onAddClose])

  function togglePanel(panel: LabPanel) {
    setCollapsedPanels(prev => {
      const next = new Set(prev)
      next.has(panel) ? next.delete(panel) : next.add(panel)
      return next
    })
  }

  function openTargetEdit(key: string) {
    const ex = targetByKey.get(key)
    setTargetLow(ex?.low   !== undefined ? String(ex.low)  : '')
    setTargetHigh(ex?.high !== undefined ? String(ex.high) : '')
    setEditingTargetKey(key)
  }

  async function saveTarget(key: string, unit?: string) {
    const data = { marker: key, low: targetLow ? Number(targetLow) : undefined, high: targetHigh ? Number(targetHigh) : undefined, unit }
    const existing = targetByKey.get(key)
    existing?.id ? await db.markerTargets.update(existing.id, data) : await db.markerTargets.add(data)
    setEditingTargetKey(null); setTargetLow(''); setTargetHigh('')
  }

  // Manual add
  const [examName, setExamName] = useState('Blood panel')
  const [marker,   setMarker]   = useState('Total Testosterone')
  const [value,    setValue]    = useState('')
  const [unit,     setUnit]     = useState('ng/dL')
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10))

  async function addManual() {
    const id = await db.exams.add({ name: examName || 'Blood panel', collectedAt: new Date(manualDate).toISOString(), labName: 'Manual entry' })
    await db.results.add({ examId: id, marker, value: Number(value), rawValue: value, unit })
    setValue('')
  }

  // PDF review
  const latestFile = files.find(f => f.status === 'Needs review')
  const extracted  = latestFile?.extractedText ? extractMarkersFromText(latestFile.extractedText) : []

  async function saveExtracted(items: ExtractedMarker[]) {
    if (!latestFile?.id || items.length === 0) return
    const examId = await db.exams.add({
      name: latestFile.name.replace(/\.pdf$/i, ''),
      collectedAt: new Date().toISOString(),
      labName: 'PDF import',
      sourceFileId: latestFile.id,
    })
    await db.results.bulkAdd(items.map(item => ({ examId, marker: item.marker, value: item.value, rawValue: String(item.value), unit: item.unit })))
    await db.files.update(latestFile.id, { status: 'Reviewed' })
  }

  const selectedSummary = selectedKey
    ? [...markersByPanel.values()].flat().find(s => s.key === selectedKey)
    : null

  return (
    <div className="content-grid">

      {/* ── PDF pending banner ── */}
      {latestFile && extracted.length > 0 && (
        <section className="surface col-12" style={{ background: 'var(--accent-soft)', borderColor: 'rgba(15,118,110,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <FileText size={14} style={{ color: 'var(--accent-ink)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 13, color: 'var(--accent-ink)' }}>PDF ready to import</strong>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--accent-ink)', opacity: 0.8 }}>
                {latestFile.name} · {extracted.length} markers detected
              </span>
            </div>
            <button type="button" className="primary-button" style={{ background: 'var(--accent)', height: 30, fontSize: 12 }}
              onClick={() => saveExtracted(extracted)}>
              Import {extracted.length} markers
            </button>
          </div>
        </section>
      )}

      {/* ── Health composites ── */}
      {hasData && <LabComposites results={results} exams={exams} />}

      {/* ── No data empty state ── */}
      {!hasData && (
        <section className="surface col-12">
          <EmptyState icon={FlaskConical} title="No lab results yet" detail="Upload a PDF or add markers manually using the buttons in the top right." />
        </section>
      )}

      {/* ── Panel sections ── */}
      {hasData && PANEL_ORDER.map(panel => {
        const summaries = markersByPanel.get(panel)
        if (!summaries || summaries.length === 0) return null
        const collapsed = collapsedPanels.has(panel)

        // Count out-of-range markers
        const outCount = summaries.filter(s => {
          const v = s.entries[0]?.value
          return rangeStatus(v, s.low, s.high) === 'warn'
        }).length

        // Is the selected marker in this panel?
        const selectedInPanel = selectedSummary?.panel === panel

        return (
          <section key={panel} className="surface col-12">
            {/* Panel header */}
            <div
              className="panel-header"
              style={{ cursor: 'pointer', userSelect: 'none', marginBottom: collapsed ? 0 : 12 }}
              onClick={() => togglePanel(panel)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {collapsed
                  ? <ChevronRight size={13} style={{ color: 'var(--ink-mute)' }} />
                  : <ChevronDown  size={13} style={{ color: 'var(--ink-mute)' }} />
                }
                <span className="section-label" style={{ margin: 0 }}>{panel}</span>
                <span style={{ fontSize: 11, color: 'var(--ink-dim)' }}>{summaries.length} markers</span>
                {outCount > 0 && (
                  <span className="chip" style={{ background: 'var(--bad-soft)', color: 'var(--bad)', fontSize: 10, height: 18 }}>
                    {outCount} out of range
                  </span>
                )}
              </div>
            </div>

            {/* Marker cards grid */}
            {!collapsed && (
              <div className="marker-grid">
                {summaries.map(s => (
                  <MarkerCard
                    key={s.key}
                    summary={s}
                    selected={selectedKey === s.key}
                    onClick={() => setSelectedKey(selectedKey === s.key ? null : s.key)}
                  />
                ))}
              </div>
            )}

            {/* History pane — shown inline when a marker in this panel is selected */}
            {!collapsed && selectedInPanel && selectedSummary && (
              <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <MarkerHistoryPane
                  summary={selectedSummary}
                  onClose={() => setSelectedKey(null)}
                  onDelete={(id) => void db.results.delete(id)}
                  onEditTarget={() => openTargetEdit(selectedSummary.key)}
                  hasPersonalTarget={targetByKey.has(selectedSummary.key)}
                  colors={colors}
                />
                {/* Inline target editor */}
                {editingTargetKey === selectedSummary.key && (
                  <div style={{ marginTop: 12, padding: '12px 16px', background: 'var(--accent-soft)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-ink)' }}>
                      Personal range for {selectedSummary.label}:
                    </span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                      Low
                      <input inputMode="decimal" placeholder="e.g. 700" value={targetLow}
                        onChange={e => setTargetLow(e.target.value)} style={{ width: 80, fontSize: 12 }} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                      High
                      <input inputMode="decimal" placeholder="e.g. 1000" value={targetHigh}
                        onChange={e => setTargetHigh(e.target.value)} style={{ width: 80, fontSize: 12 }} />
                    </label>
                    <button type="button" className="primary-button" style={{ height: 28, fontSize: 11, padding: '0 10px' }}
                      onClick={() => void saveTarget(selectedSummary.key, selectedSummary.unit)}>
                      Save
                    </button>
                    {targetByKey.has(selectedSummary.key) && (
                      <button type="button" className="ghost-button" style={{ height: 28, fontSize: 11, color: 'var(--bad)' }}
                        onClick={() => { void db.markerTargets.where('marker').equals(selectedSummary.key).delete(); setEditingTargetKey(null) }}>
                        Remove custom
                      </button>
                    )}
                    <button type="button" className="icon-button" onClick={() => setEditingTargetKey(null)}>
                      <X size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )
      })}

      {/* ── Manual add form ── */}
      {showAddForm && (
        <section className="surface col-6">
          <div className="panel-header">
            <div><span className="section-label">Manual entry</span><h3>Add result</h3></div>
            <button type="button" className="text-button" onClick={() => setShowAddForm(false)}>Close</button>
          </div>
          <div className="form-grid">
            <label className="wide-field">
              Exam / panel name
              <input value={examName} onChange={e => setExamName(e.target.value)} />
            </label>
            <label>
              Date
              <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} />
            </label>
            <label>
              Marker
              <input value={marker} onChange={e => setMarker(e.target.value)} />
            </label>
            <label>
              Value
              <input inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} />
            </label>
            <label>
              Unit
              <input value={unit} onChange={e => setUnit(e.target.value)} />
            </label>
            <button type="button" className="primary-button wide-field"
              onClick={async () => { await addManual(); setShowAddForm(false) }}
              disabled={!value}>
              <Plus size={14} /> Save marker
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
