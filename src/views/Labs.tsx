import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileText, FlaskConical, Plus } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Compound, type InjectionLog, type LabExam, type VitalLog } from '../lib/db'
import { extractMarkersFromText, type ExtractedMarker } from '../lib/pdf'
import { markerHistory, type EnrichedResult } from '../lib/insights'
import { canonicalize, metaForKey, PANEL_ORDER, type LabPanel } from '../lib/markers'
import { RangeBar } from '../components/RangeBar'
import { EmptyState } from '../components/EmptyState'

// ── Types ──────────────────────────────────────────────────────────────────

type RowData = {
  raw: string
  canonicalKey?: string
  label: string
  panel: LabPanel
  value?: number
  rawValue: string
  unit?: string
  low?: number
  high?: number
  previous?: number
  delta?: number
}

// ── Main component ─────────────────────────────────────────────────────────

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
  const markerTargets = useLiveQuery(() => db.markerTargets.toArray(), [], [])
  const targetByKey = useMemo(() => new Map((markerTargets ?? []).map((t) => [t.marker, t])), [markerTargets])

  // Per-marker sorted history for delta calculation and charting
  const historyByMarker = useMemo(() => {
    const map = new Map<string, EnrichedResult[]>()
    for (const r of results) {
      if (!r.exam || r.value === undefined) continue
      const list = map.get(r.marker.toLowerCase()) ?? []
      list.push(r)
      map.set(r.marker.toLowerCase(), list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => parseISO(a.exam!.collectedAt).getTime() - parseISO(b.exam!.collectedAt).getTime())
    }
    return map
  }, [results])

  // Latest exam rows, grouped by panel
  const latestExam = exams[0]
  const groupedRows = useMemo<Map<LabPanel, RowData[]>>(() => {
    const grouped = new Map<LabPanel, RowData[]>()
    if (!latestExam) return grouped
    const rows = results
      .filter((r) => r.examId === latestExam.id)
      .map((r): RowData => {
        const canon = canonicalize(r.marker)
        const personal = canon ? targetByKey.get(canon.key) : undefined
        const hist = historyByMarker.get(r.marker.toLowerCase()) ?? []
        const idx = hist.findIndex((x) => x.id === r.id)
        const prev = idx > 0 ? hist[idx - 1] : undefined
        const delta = r.value !== undefined && prev?.value !== undefined ? r.value - prev.value : undefined
        const low = personal?.low ?? r.low ?? canon?.optimal?.low
        const high = personal?.high ?? r.high ?? canon?.optimal?.high
        return {
          raw: r.marker,
          canonicalKey: canon?.key,
          label: canon?.label ?? r.marker,
          panel: canon?.panel ?? 'Other',
          value: r.value,
          rawValue: r.rawValue,
          unit: r.unit ?? canon?.unit ?? personal?.unit,
          low, high, previous: prev?.value, delta,
        }
      })
    for (const row of rows) {
      const list = grouped.get(row.panel) ?? []
      list.push(row)
      grouped.set(row.panel, list)
    }
    return grouped
  }, [latestExam, results, historyByMarker, targetByKey])

  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined)
  const [showAddForm, setShowAddForm] = useState(false)

  // Topbar "Add result" button triggers this
  useEffect(() => {
    if (addOpen) { setShowAddForm(true); onAddClose?.() }
  }, [addOpen, onAddClose])
  const selectedHistory = useMemo(() => {
    if (!selectedKey) return []
    const matches = results.filter((r) => canonicalize(r.marker)?.key === selectedKey)
    if (matches.length === 0) return []
    return markerHistory(matches.map((m) => ({ ...m })), matches[0].marker)
  }, [results, selectedKey])

  // Manual add
  const [examName, setExamName] = useState('Blood panel')
  const [marker, setMarker] = useState('Total Testosterone')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('ng/dL')

  async function addManual() {
    const id = await db.exams.add({ name: examName || 'Blood panel', collectedAt: new Date().toISOString(), labName: 'Manual entry' })
    await db.results.add({ examId: id, marker, value: Number(value), rawValue: value, unit })
    setValue('')
  }

  // PDF review
  const latestFile = files.find((f) => f.status === 'Needs review')
  const extracted = latestFile?.extractedText ? extractMarkersFromText(latestFile.extractedText) : []

  async function saveExtracted(items: ExtractedMarker[]) {
    if (!latestFile?.id || items.length === 0) return
    const examId = await db.exams.add({
      name: latestFile.name.replace(/\.pdf$/i, ''),
      collectedAt: new Date().toISOString(),
      labName: 'PDF import',
      sourceFileId: latestFile.id,
    })
    await db.results.bulkAdd(items.map((item) => ({ examId, marker: item.marker, value: item.value, rawValue: String(item.value), unit: item.unit })))
    await db.files.update(latestFile.id, { status: 'Reviewed' })
  }

  const panelCount = PANEL_ORDER.filter((p) => groupedRows.has(p)).length

  return (
    <div className="content-grid">

      {/* ── Latest panel ──────────────────────────────────────────────────── */}
      <section className="surface col-12">
        <div className="panel-header">
          <div>
            <span className="section-label">Latest panel</span>
            <h3>
              {latestExam
                ? `${latestExam.name} · ${format(parseISO(latestExam.collectedAt), 'MMM d, yyyy')}`
                : 'No exams yet'}
            </h3>
          </div>
          {latestExam && (
            <span className="safety-chip">{results.filter((r) => r.examId === latestExam.id).length} markers</span>
          )}
        </div>

        {panelCount > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {PANEL_ORDER.map((panel) => {
              const rows = groupedRows.get(panel)
              if (!rows || rows.length === 0) return null
              return (
                <PanelSection
                  key={panel}
                  panel={panel}
                  rows={rows}
                  onSelectKey={setSelectedKey}
                  selectedKey={selectedKey}
                />
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={FlaskConical}
            title="No lab results yet"
            detail="Upload a PDF in Files or add markers manually below."
          />
        )}
      </section>

      {/* ── Marker history chart — full width, only when a marker is selected ── */}
      {selectedKey && (
        <section className="surface col-12">
          <div className="panel-header">
            <div>
              <span className="section-label">Trend</span>
              <h3>{metaForKey(selectedKey)?.label ?? selectedKey}</h3>
            </div>
            <button type="button" className="ghost-button" onClick={() => setSelectedKey(undefined)}>Close</button>
          </div>
          {selectedHistory.length > 1 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={selectedHistory} margin={{ top: 8, right: 10, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="#e7e5e4" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#a8a29e', fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#a8a29e', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 10, fontSize: 12 }} />
                <Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={2.5} dot />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="panel-note">Add results from at least 2 panels to see a trend.</p>
          )}
          {metaForKey(selectedKey)?.optimal?.note && (
            <p className="panel-note">{metaForKey(selectedKey)?.optimal?.note}</p>
          )}
        </section>
      )}

      {/* ── PDF pending banner — only when there's something to import ── */}
      {latestFile && extracted.length > 0 && (
        <section className="surface col-12" style={{ background: 'var(--accent-soft)', borderColor: 'rgba(15,118,110,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <FileText size={14} style={{ color: 'var(--accent-ink)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 13, color: 'var(--accent-ink)' }}>PDF ready to import</strong>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--accent-ink)', opacity: 0.8 }}>{latestFile.name} · {extracted.length} markers detected</span>
            </div>
            <button type="button" className="primary-button" style={{ background: 'var(--accent)', height: 30, fontSize: 12 }} onClick={() => saveExtracted(extracted)}>
              Import {extracted.length} markers
            </button>
          </div>
        </section>
      )}

      {/* ── Manual add form — shown only when triggered from topbar ── */}
      {showAddForm && (
        <section className="surface col-6">
          <div className="panel-header">
            <div><span className="section-label">Manual entry</span><h3>Add result</h3></div>
            <button type="button" className="ghost-button" onClick={() => setShowAddForm(false)}>Close</button>
          </div>
          <div className="form-grid">
            <label className="wide-field">
              Exam name
              <input value={examName} onChange={(e) => setExamName(e.target.value)} />
            </label>
            <label>
              Marker
              <input value={marker} onChange={(e) => setMarker(e.target.value)} />
            </label>
            <label>
              Value
              <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            </label>
            <label>
              Unit
              <input value={unit} onChange={(e) => setUnit(e.target.value)} />
            </label>
            <button type="button" className="primary-button wide-field" onClick={async () => { await addManual(); setShowAddForm(false) }} disabled={!value}>
              <Plus size={14} /> Save marker
            </button>
          </div>
        </section>
      )}

    </div>
  )
}

// ── Panel section ──────────────────────────────────────────────────────────

function PanelSection({
  panel,
  rows,
  onSelectKey,
  selectedKey,
}: {
  panel: LabPanel
  rows: RowData[]
  onSelectKey: (key: string | undefined) => void
  selectedKey?: string
}) {
  const [collapsed, setCollapsed] = useState(true)
  const outCount = rows.filter((r) => {
    if (r.value === undefined) return false
    return (r.high !== undefined && r.value > r.high) || (r.low !== undefined && r.value < r.low)
  }).length

  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', padding: '0 0 8px',
          cursor: 'pointer', width: '100%', textAlign: 'left',
        }}
      >
        {collapsed ? <ChevronRight size={13} style={{ color: 'var(--ink-mute)' }} /> : <ChevronDown size={13} style={{ color: 'var(--ink-mute)' }} />}
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>{panel}</span>
        {outCount > 0 && (
          <span className="chip" style={{ background: 'var(--bad-soft)', color: 'var(--bad)', fontSize: 10 }}>
            {outCount} out of range
          </span>
        )}
      </button>

      {!collapsed && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
          {rows.map((row) => {
            const out = (row.value !== undefined && row.high !== undefined && row.value > row.high) ||
              (row.value !== undefined && row.low !== undefined && row.value < row.low)
            const active = row.canonicalKey === selectedKey
            return (
              <div
                key={row.raw}
                className="range-bar-row"
                style={{
                  cursor: row.canonicalKey ? 'pointer' : 'default',
                  background: active ? 'var(--accent-soft)' : undefined,
                  borderRadius: active ? 'var(--radius-sm)' : undefined,
                }}
                onClick={() => row.canonicalKey && onSelectKey(active ? undefined : row.canonicalKey)}
              >
                <div className="marker">
                  {row.label}
                  {row.raw !== row.label && <small style={{ color: 'var(--ink-mute)', marginLeft: 4 }}>{row.raw}</small>}
                </div>
                <RangeBar value={row.value} previous={row.previous} low={row.low} high={row.high} />
                <div className="value">
                  <span className={out ? 'range-pill out' : 'range-pill ok'}>
                    {row.rawValue}{row.unit ? ` ${row.unit}` : ''}
                  </span>
                </div>
                <div className={`delta ${row.delta !== undefined ? (row.delta >= 0 ? 'good' : 'bad') : ''}`}>
                  {row.delta !== undefined ? `${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(1)}` : '—'}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
