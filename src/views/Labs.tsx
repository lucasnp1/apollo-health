import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileText, FlaskConical, Plus } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Compound, type InjectionLog, type LabExam, type VitalLog } from '../lib/db'
import { extractMarkersFromText, type ExtractedMarker } from '../lib/pdf'
import { markerHistory, type EnrichedResult } from '../lib/insights'
import { canonicalize, metaForKey, PANEL_ORDER, type LabPanel } from '../lib/markers'
import { EmptyState } from '../components/EmptyState'

// ── Types ──────────────────────────────────────────────────────────────────

type MarkerRow = {
  marker: string           // canonical display name
  key?: string             // canonical key (for trend click)
  panel: LabPanel
  // Values across exams, newest first.
  // undefined = this exam didn't include this marker.
  values: Array<{ value?: number; rawValue: string; unit?: string; low?: number; high?: number } | undefined>
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

  // Sort exams newest first (already done from App.tsx, but re-sort to be safe)
  const sortedExams = useMemo(
    () => [...exams].sort((a, b) => b.collectedAt.localeCompare(a.collectedAt)),
    [exams],
  )

  // Show up to 5 most recent exams as columns — deduplicate by id to prevent same-exam repeated columns
  const examColumns = useMemo(() => {
    const seen = new Set<number>()
    return sortedExams.filter((e) => {
      if (e.id === undefined || seen.has(e.id)) return false
      seen.add(e.id)
      return true
    }).slice(0, 5)
  }, [sortedExams])


  // Build the comparison table: unique markers × exam columns
  const groupedRows = useMemo<Map<LabPanel, MarkerRow[]>>(() => {
    if (examColumns.length === 0) return new Map()

    // Collect all unique marker names from results in these exams
    const examIdSet = new Set(examColumns.map((e) => e.id))
    const relevantResults = results.filter((r) => r.examId !== undefined && examIdSet.has(r.examId))

    // Deduplicate markers by canonical key (or raw name)
    const markerOrder: string[] = []
    const markerMap = new Map<string, string>() // raw name → canonical key or raw fallback

    for (const r of relevantResults) {
      const canon = canonicalize(r.marker)
      const key = canon?.key ?? r.marker.toLowerCase()
      if (!markerMap.has(key)) {
        markerOrder.push(key)
        markerMap.set(key, r.marker)
      }
    }

    // Build rows
    const grouped = new Map<LabPanel, MarkerRow[]>()
    for (const key of markerOrder) {
      const rawName = markerMap.get(key)!
      const canon = canonicalize(rawName)
      const panel = canon?.panel ?? 'Other'
      const personal = canon ? targetByKey.get(canon.key) : undefined

      const values = examColumns.map((exam) => {
        // Find result in this exam matching the marker
        const r = results.find(
          (x) => x.examId === exam.id && (
            x.marker.toLowerCase() === rawName.toLowerCase() ||
            (canon && canonicalize(x.marker)?.key === canon.key)
          ),
        )
        if (!r) return undefined
        const low = personal?.low ?? r.low ?? canon?.optimal?.low
        const high = personal?.high ?? r.high ?? canon?.optimal?.high
        return { value: r.value, rawValue: r.rawValue, unit: r.unit ?? canon?.unit ?? personal?.unit, low, high }
      })

      const row: MarkerRow = {
        marker: canon?.label ?? rawName,
        key: canon?.key,
        panel,
        values,
      }

      const list = grouped.get(panel) ?? []
      list.push(row)
      grouped.set(panel, list)
    }

    return grouped
  }, [examColumns, results, targetByKey])

  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined)
  const [showAddForm, setShowAddForm] = useState(false)
  const [collapsedPanels, setCollapsedPanels] = useState<Set<LabPanel>>(new Set())

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

  function togglePanel(panel: LabPanel) {
    setCollapsedPanels((prev) => {
      const next = new Set(prev)
      if (next.has(panel)) next.delete(panel)
      else next.add(panel)
      return next
    })
  }

  const hasData = examColumns.length > 0

  return (
    <div className="content-grid">

      {/* ── PDF pending banner ── */}
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

      {/* ── Marker trend chart — shown when a marker row is clicked ── */}
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
            <p className="panel-note">Add results from at least 2 exams to see a trend.</p>
          )}
          {metaForKey(selectedKey)?.optimal?.note && (
            <p className="panel-note" style={{ marginTop: 8 }}>{metaForKey(selectedKey)?.optimal?.note}</p>
          )}
        </section>
      )}

      {/* ── Main comparison table ── */}
      <section className="surface col-12">
        <div className="panel-header">
          <div>
            <span className="section-label">All exams</span>
            <h3>Marker comparison</h3>
          </div>
          <button type="button" className="ghost-button" onClick={() => setShowAddForm((v) => !v)}>
            <Plus size={12} /> Add result
          </button>
        </div>

        {!hasData ? (
          <EmptyState
            icon={FlaskConical}
            title="No lab results yet"
            detail="Upload a PDF in Files or add markers manually."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="labs-compare-table">
              <thead>
                <tr>
                  <th>Marker</th>
                  {examColumns.map((exam) => (
                    <th key={exam.id} style={{ textAlign: 'right' }}>
                      {exam.name}<br />
                      <span style={{ fontWeight: 400, opacity: 0.7 }}>{format(parseISO(exam.collectedAt), 'MMM d, yy')}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PANEL_ORDER.map((panel) => {
                  const rows = groupedRows.get(panel)
                  if (!rows || rows.length === 0) return null
                  const collapsed = collapsedPanels.has(panel)
                  const outCount = rows.reduce((n, row) => {
                    const latest = row.values[0]
                    if (!latest?.value) return n
                    const out = (latest.high !== undefined && latest.value > latest.high) ||
                      (latest.low !== undefined && latest.value < latest.low)
                    return out ? n + 1 : n
                  }, 0)
                  return (
                    <>
                      {/* Panel header row */}
                      <tr key={`panel-${panel}`} style={{ cursor: 'pointer' }} onClick={() => togglePanel(panel)}>
                        <td colSpan={examColumns.length + 1} style={{ padding: '12px 0 4px', borderTop: '2px solid var(--line)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {collapsed ? <ChevronRight size={12} style={{ color: 'var(--ink-mute)' }} /> : <ChevronDown size={12} style={{ color: 'var(--ink-mute)' }} />}
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>{panel}</span>
                            {outCount > 0 && (
                              <span className="chip" style={{ background: 'var(--bad-soft)', color: 'var(--bad)', fontSize: 10 }}>
                                {outCount} out
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Marker rows */}
                      {!collapsed && rows.map((row) => {
                        const latestVal = row.values[0]
                        const isSelected = row.key === selectedKey
                        const isOut = latestVal?.value !== undefined && (
                          (latestVal.high !== undefined && latestVal.value > latestVal.high) ||
                          (latestVal.low !== undefined && latestVal.value < latestVal.low)
                        )
                        return (
                          <tr
                            key={row.marker}
                            className={isSelected ? 'selected' : undefined}
                            onClick={() => row.key && setSelectedKey(isSelected ? undefined : row.key)}
                            style={{ cursor: row.key ? 'pointer' : 'default' }}
                          >
                            <td>
                              <span style={{ fontSize: 13, fontWeight: 600, color: isOut ? 'var(--bad)' : 'var(--ink)' }}>
                                {row.marker}
                              </span>
                            </td>
                            {row.values.map((cell, ci) => {
                              if (!cell) return <td key={ci} style={{ color: 'var(--ink-mute)', textAlign: 'right', fontSize: 12 }}>—</td>
                              const out = cell.value !== undefined && (
                                (cell.high !== undefined && cell.value > cell.high) ||
                                (cell.low !== undefined && cell.value < cell.low)
                              )
                              // Delta: compare with next column (older exam)
                              const nextCell = row.values[ci + 1]
                              const delta = cell.value !== undefined && nextCell?.value !== undefined
                                ? cell.value - nextCell.value
                                : undefined
                              return (
                                <td key={ci} style={{ textAlign: 'right' }}>
                                  <div className={`labs-val-cell${out ? ' out' : ''}`} style={{ justifyContent: 'flex-end' }}>
                                    <span>{cell.rawValue}{cell.unit ? ` ${cell.unit}` : ''}</span>
                                    {ci === 0 && delta !== undefined && Math.abs(delta) > 0.05 && (
                                      <span className={`labs-delta ${delta > 0 ? 'up' : 'down'}`}>
                                        {delta > 0 ? '↑' : '↓'}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Manual add form ── */}
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
