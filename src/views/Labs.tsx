import { useMemo, useState } from 'react'
import { FileText, FlaskConical, Plus, UploadCloud } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { db, type Compound, type InjectionLog, type LabExam, type VitalLog } from '../lib/db'
import { extractMarkersFromText, type ExtractedMarker } from '../lib/pdf'
import { buildCorrelationInsights, markerHistory, type EnrichedResult } from '../lib/insights'
import { canonicalize, metaForKey } from '../lib/markers'
import { RangeBar } from '../components/RangeBar'
import { EmptyState } from '../components/EmptyState'

type Grouped = {
  examLabel: string
  examDate: Date
  rows: Array<{
    raw: string
    canonicalKey?: string
    label: string
    value?: number
    rawValue: string
    unit?: string
    low?: number
    high?: number
    previous?: number
    delta?: number
  }>
}

export function Labs({
  compounds,
  injections,
  vitals,
  exams,
  results,
  files,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  vitals: VitalLog[]
  exams: LabExam[]
  results: EnrichedResult[]
  files: Array<{ id?: number; name: string; status: string; extractedText?: string }>
}) {
  // Build a per-marker history map so we can compute prior-value deltas.
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

  const latestExam = exams[0]
  const latestRows: Grouped | undefined = useMemo(() => {
    if (!latestExam) return undefined
    const rows = results
      .filter((r) => r.examId === latestExam.id)
      .map((r) => {
        const canon = canonicalize(r.marker)
        const hist = historyByMarker.get(r.marker.toLowerCase()) ?? []
        const idx = hist.findIndex((x) => x.id === r.id)
        const prev = idx > 0 ? hist[idx - 1] : undefined
        const delta = r.value !== undefined && prev?.value !== undefined ? r.value - prev.value : undefined
        return {
          raw: r.marker,
          canonicalKey: canon?.key,
          label: canon?.label ?? r.marker,
          value: r.value,
          rawValue: r.rawValue,
          unit: r.unit ?? canon?.unit,
          low: r.low ?? canon?.optimal?.low,
          high: r.high ?? canon?.optimal?.high,
          previous: prev?.value,
          delta,
        }
      })
    return { examLabel: latestExam.name, examDate: parseISO(latestExam.collectedAt), rows }
  }, [latestExam, results, historyByMarker])

  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined)
  const selectedHistory = useMemo(() => {
    if (!selectedKey) return []
    const meta = metaForKey(selectedKey)
    if (!meta) return []
    // Match all raw names that canonicalize to this key
    const matches = results.filter((r) => canonicalize(r.marker)?.key === selectedKey)
    if (matches.length === 0) return []
    const rawName = matches[0].marker
    return markerHistory(matches.map((m) => ({ ...m })), rawName)
  }, [results, selectedKey])

  // PDF review
  const latestFile = files.find((f) => f.status === 'Needs review')
  const extracted = latestFile?.extractedText ? extractMarkersFromText(latestFile.extractedText) : []
  const [examName, setExamName] = useState('Blood panel')
  const [marker, setMarker] = useState('Total Testosterone')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('ng/dL')

  async function addManual() {
    const id = await db.exams.add({ name: examName || 'Blood panel', collectedAt: new Date().toISOString(), labName: 'Manual entry' })
    await db.results.add({ examId: id, marker, value: Number(value), rawValue: value, unit })
    setValue('')
  }

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

  const correlations = buildCorrelationInsights(compounds, injections, vitals, results)

  return (
    <div className="content-grid">
      {/* Latest panel with range bars */}
      <section className="surface col-12">
        <div className="panel-header">
          <div>
            <span className="section-label">Latest panel</span>
            <h3>{latestRows ? `${latestRows.examLabel} · ${format(latestRows.examDate, 'MMM d, yyyy')}` : 'No exams'}</h3>
          </div>
          <span className="safety-chip">Ranges blended with personal optimal where defined</span>
        </div>
        {latestRows && latestRows.rows.length > 0 ? (
          <div>
            {latestRows.rows.map((row) => {
              const out = (row.value !== undefined && row.high !== undefined && row.value > row.high) ||
                (row.value !== undefined && row.low !== undefined && row.value < row.low)
              return (
                <div
                  key={row.raw}
                  className="range-bar-row"
                  style={{ cursor: row.canonicalKey ? 'pointer' : 'default' }}
                  onClick={() => row.canonicalKey && setSelectedKey(row.canonicalKey)}
                >
                  <div className="marker">
                    {row.label}
                    <small>{row.raw !== row.label ? row.raw : row.unit ?? ''}</small>
                  </div>
                  <RangeBar value={row.value} previous={row.previous} low={row.low} high={row.high} />
                  <div className="value">
                    <span className={out ? 'range-pill out' : 'range-pill ok'}>{row.rawValue} {row.unit ?? ''}</span>
                  </div>
                  <div className={`delta ${row.delta !== undefined ? (row.delta >= 0 ? 'good' : 'bad') : ''}`}>
                    {row.delta !== undefined ? `${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(2)}` : '—'}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState icon={FlaskConical} title="No lab results yet" detail="Add a PDF in Files or log markers manually below." />
        )}
      </section>

      {/* Marker detail (history) */}
      <section className="surface col-7">
        <div className="panel-header">
          <div>
            <span className="section-label">Marker detail</span>
            <h3>{selectedKey ? metaForKey(selectedKey)?.label : 'Click a marker above'}</h3>
          </div>
        </div>
        {selectedHistory.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={selectedHistory} margin={{ top: 10, right: 10, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#1f242b" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#6b7480', fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#6b7480', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#13171c', border: '1px solid #2a313a', borderRadius: 8, color: '#e6ebf1' }} />
              <Line type="monotone" dataKey="value" stroke="#5eead4" strokeWidth={2.5} dot />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState icon={FlaskConical} title="No history" detail="Pick a row from the latest panel." />
        )}
        {selectedKey && metaForKey(selectedKey)?.optimal?.note && (
          <p className="panel-note">{metaForKey(selectedKey)?.optimal?.note}</p>
        )}
      </section>

      {/* Correlations */}
      <section className="surface col-5">
        <div className="panel-header">
          <div>
            <span className="section-label">Cross-signal</span>
            <h3>Correlations</h3>
          </div>
          <span className="safety-chip">Not causal</span>
        </div>
        <div className="stack">
          {correlations.map((c) => (
            <div className="row" key={c.title}>
              <FlaskConical size={14} />
              <div>
                <strong>{c.title}</strong>
                <span className="sub">{c.detail}</span>
              </div>
              <span className="chip">{c.value}</span>
              <span className="chip">{c.strength}</span>
            </div>
          ))}
        </div>
      </section>

      {/* PDF review */}
      <section className="surface col-7">
        <div className="panel-header">
          <div>
            <span className="section-label">PDF review</span>
            <h3>Extracted markers</h3>
          </div>
        </div>
        {latestFile ? (
          extracted.length > 0 ? (
            <>
              <p className="muted-copy">{latestFile.name}</p>
              <div className="stack">
                {extracted.map((m) => (
                  <div className="row" key={m.marker}>
                    <FlaskConical size={14} />
                    <div>
                      <strong>{m.marker}</strong>
                      <span className="sub">{m.value} {m.unit || ''}</span>
                    </div>
                    <span />
                    <span />
                  </div>
                ))}
              </div>
              <button type="button" className="primary-button" onClick={() => saveExtracted(extracted)}>
                Save reviewed
              </button>
            </>
          ) : (
            <EmptyState icon={FileText} title="Couldn't auto-detect markers" detail="Open the PDF and add markers manually below." />
          )
        ) : (
          <EmptyState icon={UploadCloud} title="No pending PDF" detail="Upload a file in Files to run local text extraction." />
        )}
      </section>

      {/* Manual add */}
      <section className="surface col-5">
        <div className="panel-header">
          <div>
            <span className="section-label">Manual</span>
            <h3>Add result</h3>
          </div>
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
          <button type="button" className="primary-button wide-field" onClick={addManual}><Plus size={15} /> Save</button>
        </div>
      </section>
    </div>
  )
}
