import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CalendarClock,
  Check,
  ChevronRight,
  Database,
  FileText,
  FlaskConical,
  HeartPulse,
  Home,
  Lock,
  MoreHorizontal,
  Plus,
  Settings,
  ShieldCheck,
  Syringe,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { db, seedIfEmpty, type Compound, type LabResult, type Unit } from './lib/db'
import { extractMarkersFromText, extractPdfText, type ExtractedMarker } from './lib/pdf'
import './index.css'

type View = 'overview' | 'meds' | 'vitals' | 'labs' | 'timeline' | 'files' | 'settings'

const navItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'meds', label: 'Meds', icon: Syringe },
  { id: 'vitals', label: 'Vitals', icon: HeartPulse },
  { id: 'labs', label: 'Labs', icon: FlaskConical },
  { id: 'timeline', label: 'Timeline', icon: CalendarClock },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const units: Unit[] = ['mg', 'mcg', 'iu', 'ml', 'tablet', 'capsule']
const todayInput = () => new Date().toISOString().slice(0, 16)

function App() {
  const [activeView, setActiveView] = useState<View>('overview')

  useEffect(() => {
    void seedIfEmpty()
  }, [])

  const compounds = useLiveQuery(async () => {
    const rows = await db.compounds.toArray()
    return rows.filter((compound) => !compound.archived)
  }, [], [])
  const injections = useLiveQuery(() => db.injections.orderBy('takenAt').reverse().toArray(), [], [])
  const vitals = useLiveQuery(() => db.vitals.orderBy('measuredAt').reverse().toArray(), [], [])
  const exams = useLiveQuery(() => db.exams.orderBy('collectedAt').reverse().toArray(), [], [])
  const results = useLiveQuery(() => db.results.toArray(), [], [])
  const files = useLiveQuery(() => db.files.orderBy('addedAt').reverse().toArray(), [], [])

  const latestBp = vitals[0]
  const recentInjections = injections.slice(0, 6)
  const recentResults = useMemo(() => {
    const examMap = new Map(exams.map((exam) => [exam.id, exam]))
    return results
      .map((result) => ({ ...result, exam: examMap.get(result.examId) }))
      .filter((result) => result.exam)
      .sort((a, b) => parseISO(b.exam!.collectedAt).getTime() - parseISO(a.exam!.collectedAt).getTime())
      .slice(0, 8)
  }, [exams, results])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">
            <Activity size={18} />
          </div>
          <div>
            <strong>Apollo Health</strong>
            <span>Local-first tracker</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {navItems.map((item) => (
            <button
              type="button"
              className={activeView === item.id ? 'nav-item active' : 'nav-item'}
              key={item.id}
              onClick={() => setActiveView(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="local-card">
          <ShieldCheck size={20} />
          <div>
            <strong>Zero cloud by default</strong>
            <span>Everything is stored in this browser’s local database.</span>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyeline">Personal health record</p>
            <h1>{titleFor(activeView)}</h1>
          </div>
          <div className="topbar-actions">
            <span className="privacy-pill">
              <Lock size={15} />
              Local only
            </span>
            <button type="button" className="icon-button" aria-label="More options">
              <MoreHorizontal size={18} />
            </button>
          </div>
        </header>

        {activeView === 'overview' && (
          <Overview
            compounds={compounds}
            latestBp={latestBp}
            recentInjections={recentInjections}
            recentResults={recentResults}
            vitals={vitals}
            files={files}
            onNavigate={setActiveView}
          />
        )}
        {activeView === 'meds' && <Meds compounds={compounds} injections={injections} />}
        {activeView === 'vitals' && <Vitals vitals={vitals} />}
        {activeView === 'labs' && <Labs exams={exams} results={results} files={files} />}
        {activeView === 'timeline' && (
          <Timeline compounds={compounds} injections={injections} vitals={vitals} exams={exams} files={files} />
        )}
        {activeView === 'files' && <Files files={files} />}
        {activeView === 'settings' && <SettingsView />}
      </main>

      <nav className="mobile-tabs" aria-label="Mobile primary">
        {navItems.slice(0, 5).map((item) => (
          <button
            type="button"
            className={activeView === item.id ? 'mobile-tab active' : 'mobile-tab'}
            key={item.id}
            onClick={() => setActiveView(item.id)}
          >
            <item.icon size={19} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function Overview({
  compounds,
  latestBp,
  recentInjections,
  recentResults,
  vitals,
  files,
  onNavigate,
}: {
  compounds: Compound[]
  latestBp?: { systolic: number; diastolic: number; pulse?: number; measuredAt: string }
  recentInjections: Array<{ id?: number; compoundId: number; takenAt: string; dose?: number; unit: Unit; site?: string; rawDose?: string }>
  recentResults: Array<LabResult & { exam?: { collectedAt: string; name: string } }>
  vitals: Array<{ systolic: number; diastolic: number; measuredAt: string }>
  files: Array<{ name: string; status: string; addedAt: string }>
  onNavigate: (view: View) => void
}) {
  const compoundMap = new Map(compounds.map((compound) => [compound.id, compound]))
  const bpChart = [...vitals]
    .reverse()
    .slice(-8)
    .map((vital) => ({
      date: format(parseISO(vital.measuredAt), 'MMM d'),
      systolic: vital.systolic,
      diastolic: vital.diastolic,
    }))
  const pendingFiles = files.filter((file) => file.status === 'Needs review')

  return (
    <div className="content-grid overview-grid">
      <section className="panel hero-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Today</span>
            <h2>Keep the record clean.</h2>
          </div>
          <button type="button" className="primary-button" onClick={() => onNavigate('meds')}>
            <Plus size={17} />
            Add injection
          </button>
        </div>
        <div className="metrics-row">
          <Metric label="Compounds" value={String(compounds.length)} detail="Active protocols" />
          <Metric
            label="Blood pressure"
            value={latestBp ? `${latestBp.systolic}/${latestBp.diastolic}` : 'No data'}
            detail={latestBp ? `${latestBp.pulse ?? '--'} bpm latest` : 'Add first reading'}
          />
          <Metric label="PDF review" value={String(pendingFiles.length)} detail="Local imports pending" />
        </div>
      </section>

      <section className="panel schedule-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Schedule</span>
            <h3>Recent injections</h3>
          </div>
          <button type="button" className="ghost-button" onClick={() => onNavigate('meds')}>
            View all
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="stack-list">
          {recentInjections.map((entry) => {
            const compound = compoundMap.get(entry.compoundId)
            return (
              <div className="data-row" key={entry.id}>
                <span className="dot" style={{ background: compound?.color ?? '#0f8f84' }} />
                <div>
                  <strong>{compound?.name ?? 'Unknown compound'}</strong>
                  <span>{doseLabel(entry)} · {entry.site || 'No site'}</span>
                </div>
                <time>{format(parseISO(entry.takenAt), 'MMM d')}</time>
              </div>
            )
          })}
        </div>
      </section>

      <section className="panel chart-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Vitals</span>
            <h3>Blood pressure trend</h3>
          </div>
          <button type="button" className="ghost-button" onClick={() => onNavigate('vitals')}>Log BP</button>
        </div>
        <ResponsiveContainer width="100%" height={210}>
          <LineChart data={bpChart} margin={{ top: 14, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#eef1f2" vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#75808a', fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: '#75808a', fontSize: 12 }} />
            <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#e7ecef' }} />
            <Line type="monotone" dataKey="systolic" stroke="#0f8f84" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="diastolic" stroke="#94a3b8" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="panel wide-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Labs</span>
            <h3>Recent biomarkers</h3>
          </div>
          <button type="button" className="ghost-button" onClick={() => onNavigate('labs')}>
            Open labs
            <ChevronRight size={16} />
          </button>
        </div>
        <ResultsTable results={recentResults} />
      </section>

      <section className="panel import-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">PDFs</span>
            <h3>Local import queue</h3>
          </div>
          <UploadCloud size={20} />
        </div>
        {pendingFiles.length > 0 ? (
          <div className="stack-list">
            {pendingFiles.slice(0, 3).map((file) => (
              <div className="data-row" key={file.addedAt}>
                <FileText size={17} />
                <div>
                  <strong>{file.name}</strong>
                  <span>{formatDistanceToNow(parseISO(file.addedAt), { addSuffix: true })}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Database size={24} />
            <strong>No files waiting.</strong>
            <span>Upload a lab PDF and review extracted markers before saving.</span>
          </div>
        )}
      </section>
    </div>
  )
}

function Meds({
  compounds,
  injections,
}: {
  compounds: Compound[]
  injections: Array<{ id?: number; compoundId: number; takenAt: string; dose?: number; unit: Unit; route: string; site?: string; notes?: string; rawDose?: string }>
}) {
  const [compoundId, setCompoundId] = useState('')
  const [dose, setDose] = useState('')
  const [unit, setUnit] = useState<Unit>('mg')
  const [site, setSite] = useState('Abdomen')
  const [takenAt, setTakenAt] = useState(todayInput())
  const [newCompound, setNewCompound] = useState({ name: '', dose: '', unit: 'mg' as Unit, schedule: '' })
  const compoundMap = new Map(compounds.map((compound) => [compound.id, compound]))

  const effectiveCompoundId = compoundId || String(compounds[0]?.id ?? '')

  async function addInjection() {
    const selected = compounds.find((compound) => String(compound.id) === effectiveCompoundId)
    const effectiveDose = dose || String(selected?.defaultDose ?? '')
    if (!selected || !effectiveDose) return

    await db.injections.add({
      compoundId: selected.id!,
      takenAt: new Date(takenAt).toISOString(),
      dose: Number(effectiveDose),
      unit,
      route: 'SubQ',
      site,
      rawDose: `${effectiveDose} ${unit}`,
    })
  }

  async function addCompound() {
    if (!newCompound.name || !newCompound.dose) return
    await db.compounds.add({
      name: newCompound.name,
      category: 'Other',
      defaultDose: Number(newCompound.dose),
      unit: newCompound.unit,
      schedule: newCompound.schedule || 'As needed',
      color: '#0f8f84',
    })
    setNewCompound({ name: '', dose: '', unit: 'mg', schedule: '' })
  }

  return (
    <div className="content-grid two-column">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Quick add</span>
            <h3>Injection log</h3>
          </div>
          <Syringe size={20} />
        </div>
        <div className="form-grid">
          <label>
            Compound
            <select value={effectiveCompoundId} onChange={(event) => {
              const id = event.target.value
              const selected = compounds.find((compound) => String(compound.id) === id)
              setCompoundId(id)
              if (selected) {
                setDose(String(selected.defaultDose))
                setUnit(selected.unit)
              }
            }}>
              {compounds.map((compound) => (
                <option value={compound.id} key={compound.id}>{compound.name}</option>
              ))}
            </select>
          </label>
          <label>
            Dose
            <input placeholder={String(compounds.find((compound) => String(compound.id) === effectiveCompoundId)?.defaultDose ?? '')} value={dose} onChange={(event) => setDose(event.target.value)} inputMode="decimal" />
          </label>
          <label>
            Unit
            <select value={unit} onChange={(event) => setUnit(event.target.value as Unit)}>
              {units.map((unitOption) => <option key={unitOption}>{unitOption}</option>)}
            </select>
          </label>
          <label>
            Site
            <input value={site} onChange={(event) => setSite(event.target.value)} />
          </label>
          <label className="wide-field">
            Taken at
            <input type="datetime-local" value={takenAt} onChange={(event) => setTakenAt(event.target.value)} />
          </label>
          <button type="button" className="primary-button wide-field" onClick={addInjection}>
            <Plus size={17} />
            Save injection
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Protocol</span>
            <h3>Compounds</h3>
          </div>
        </div>
        <div className="stack-list">
          {compounds.map((compound) => (
            <div className="compound-card" key={compound.id}>
              <span className="dot" style={{ background: compound.color }} />
              <div>
                <strong>{compound.name}</strong>
                <span>{compound.defaultDose} {compound.unit} · {compound.schedule}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="inline-add">
          <input placeholder="New compound" value={newCompound.name} onChange={(event) => setNewCompound({ ...newCompound, name: event.target.value })} />
          <input placeholder="Dose" value={newCompound.dose} onChange={(event) => setNewCompound({ ...newCompound, dose: event.target.value })} />
          <button type="button" className="icon-button" onClick={addCompound} aria-label="Add compound">
            <Plus size={18} />
          </button>
        </div>
      </section>

      <section className="panel wide-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">History</span>
            <h3>Recent doses</h3>
          </div>
        </div>
        <div className="stack-list">
          {injections.map((entry) => {
            const compound = compoundMap.get(entry.compoundId)
            return (
              <div className="data-row" key={entry.id}>
                <span className="dot" style={{ background: compound?.color ?? '#0f8f84' }} />
                <div>
                  <strong>{compound?.name ?? 'Unknown compound'}</strong>
                  <span>{doseLabel(entry)} · {entry.route} · {entry.site || 'No site'}</span>
                </div>
                <time>{format(parseISO(entry.takenAt), 'MMM d, HH:mm')}</time>
                <button type="button" className="icon-button danger" onClick={() => db.injections.delete(entry.id!)} aria-label="Delete injection">
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function Vitals({ vitals }: { vitals: Array<{ id?: number; measuredAt: string; systolic: number; diastolic: number; pulse?: number; notes?: string }> }) {
  const [form, setForm] = useState({ systolic: '', diastolic: '', pulse: '', measuredAt: todayInput(), notes: '' })
  const chart = [...vitals].reverse().map((vital) => ({
    date: format(parseISO(vital.measuredAt), 'MMM d'),
    systolic: vital.systolic,
    diastolic: vital.diastolic,
  }))

  async function addVital() {
    if (!form.systolic || !form.diastolic) return
    await db.vitals.add({
      measuredAt: new Date(form.measuredAt).toISOString(),
      systolic: Number(form.systolic),
      diastolic: Number(form.diastolic),
      pulse: form.pulse ? Number(form.pulse) : undefined,
      notes: form.notes,
    })
    setForm({ systolic: '', diastolic: '', pulse: '', measuredAt: todayInput(), notes: '' })
  }

  return (
    <div className="content-grid two-column">
      <section className="panel chart-panel wide-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Trend</span>
            <h3>Blood pressure</h3>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chart} margin={{ top: 16, right: 16, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="bpFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0f8f84" stopOpacity={0.24} />
                <stop offset="95%" stopColor="#0f8f84" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#eef1f2" vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#75808a', fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: '#75808a', fontSize: 12 }} />
            <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#e7ecef' }} />
            <Area type="monotone" dataKey="systolic" stroke="#0f8f84" strokeWidth={3} fill="url(#bpFill)" />
            <Line type="monotone" dataKey="diastolic" stroke="#64748b" strokeWidth={3} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Quick add</span>
            <h3>New reading</h3>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Systolic
            <input inputMode="numeric" value={form.systolic} onChange={(event) => setForm({ ...form, systolic: event.target.value })} />
          </label>
          <label>
            Diastolic
            <input inputMode="numeric" value={form.diastolic} onChange={(event) => setForm({ ...form, diastolic: event.target.value })} />
          </label>
          <label>
            Pulse
            <input inputMode="numeric" value={form.pulse} onChange={(event) => setForm({ ...form, pulse: event.target.value })} />
          </label>
          <label>
            Measured
            <input type="datetime-local" value={form.measuredAt} onChange={(event) => setForm({ ...form, measuredAt: event.target.value })} />
          </label>
          <label className="wide-field">
            Notes
            <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
          <button type="button" className="primary-button wide-field" onClick={addVital}>
            <Plus size={17} />
            Save reading
          </button>
        </div>
      </section>

      <section className="panel wide-panel">
        <div className="stack-list">
          {vitals.map((vital) => (
            <div className="data-row" key={vital.id}>
              <HeartPulse size={18} />
              <div>
                <strong>{vital.systolic}/{vital.diastolic}</strong>
                <span>{vital.pulse ? `${vital.pulse} bpm` : 'Pulse not set'} · {vital.notes || 'No notes'}</span>
              </div>
              <time>{format(parseISO(vital.measuredAt), 'MMM d, HH:mm')}</time>
              <button type="button" className="icon-button danger" onClick={() => db.vitals.delete(vital.id!)} aria-label="Delete reading">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Labs({
  exams,
  results,
  files,
}: {
  exams: Array<{ id?: number; name: string; collectedAt: string; labName?: string }>
  results: LabResult[]
  files: Array<{ id?: number; name: string; status: string; extractedText?: string }>
}) {
  const [examName, setExamName] = useState('Blood panel')
  const [marker, setMarker] = useState('Total Testosterone')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('ng/dL')
  const [selectedExamId, setSelectedExamId] = useState('')

  const effectiveExamId = selectedExamId || String(exams[0]?.id ?? '')

  async function createExam() {
    const id = await db.exams.add({
      name: examName || 'Blood panel',
      collectedAt: new Date().toISOString(),
      labName: 'Manual entry',
    })
    setSelectedExamId(String(id))
  }

  async function addResult() {
    if (!effectiveExamId || !marker || !value) return
    await db.results.add({
      examId: Number(effectiveExamId),
      marker,
      value: Number(value),
      rawValue: value,
      unit,
    })
    setValue('')
  }

  const examMap = new Map(exams.map((exam) => [exam.id, exam]))
  const enriched = results.map((result) => ({ ...result, exam: examMap.get(result.examId) }))
  const latestFile = files.find((file) => file.status === 'Needs review')
  const extracted = latestFile?.extractedText ? extractMarkersFromText(latestFile.extractedText) : []

  async function saveExtractedMarkers(markers: ExtractedMarker[]) {
    if (!latestFile?.id || markers.length === 0) return
    const examId = await db.exams.add({
      name: latestFile.name.replace(/\.pdf$/i, ''),
      collectedAt: new Date().toISOString(),
      labName: 'PDF import',
      sourceFileId: latestFile.id,
    })
    await db.results.bulkAdd(markers.map((item) => ({
      examId,
      marker: item.marker,
      value: item.value,
      rawValue: String(item.value),
      unit: item.unit,
    })))
    await db.files.update(latestFile.id, { status: 'Reviewed' })
  }

  return (
    <div className="content-grid two-column">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Manual</span>
            <h3>Add lab result</h3>
          </div>
        </div>
        <div className="form-grid">
          <label className="wide-field">
            Exam
            <select value={effectiveExamId} onChange={(event) => setSelectedExamId(event.target.value)}>
              {exams.map((exam) => <option value={exam.id} key={exam.id}>{exam.name}</option>)}
            </select>
          </label>
          <label className="wide-field">
            New exam name
            <input value={examName} onChange={(event) => setExamName(event.target.value)} />
          </label>
          <button type="button" className="ghost-button wide-field" onClick={createExam}>Create exam</button>
          <label>
            Marker
            <input value={marker} onChange={(event) => setMarker(event.target.value)} />
          </label>
          <label>
            Value
            <input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} />
          </label>
          <label>
            Unit
            <input value={unit} onChange={(event) => setUnit(event.target.value)} />
          </label>
          <button type="button" className="primary-button wide-field" onClick={addResult}>
            <Plus size={17} />
            Save marker
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="section-label">PDF review</span>
            <h3>Extracted markers</h3>
          </div>
        </div>
        {latestFile ? (
          <>
            <p className="muted-copy">{latestFile.name}</p>
            {extracted.length > 0 ? (
              <div className="stack-list">
                {extracted.map((item) => (
                  <div className="data-row compact" key={item.marker}>
                    <FlaskConical size={16} />
                    <div>
                      <strong>{item.marker}</strong>
                      <span>{item.value} {item.unit || 'unit not detected'}</span>
                    </div>
                  </div>
                ))}
                <button type="button" className="primary-button" onClick={() => saveExtractedMarkers(extracted)}>
                  <Check size={17} />
                  Save reviewed markers
                </button>
              </div>
            ) : (
              <div className="empty-state">
                <FileText size={24} />
                <strong>No clear markers found.</strong>
                <span>The text is stored locally. Add results manually from the PDF.</span>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <UploadCloud size={24} />
            <strong>No pending PDF.</strong>
            <span>Upload a file in Files to run local text extraction.</span>
          </div>
        )}
      </section>

      <section className="panel wide-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Comparison</span>
            <h3>Biomarkers over time</h3>
          </div>
        </div>
        <ResultsTable results={enriched} />
      </section>
    </div>
  )
}

function Files({ files }: { files: Array<{ id?: number; name: string; type: string; size: number; addedAt: string; status: string; extractedText?: string }> }) {
  const [busy, setBusy] = useState(false)

  async function onFileUpload(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    setBusy(true)
    try {
      const extractedText = file.type === 'application/pdf' ? await extractPdfText(file) : ''
      await db.files.add({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        addedAt: new Date().toISOString(),
        status: extractedText ? 'Needs review' : 'Stored',
        extractedText,
        blob: file,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="content-grid two-column">
      <section className="panel upload-panel">
        <UploadCloud size={28} />
        <h3>Upload exam PDF</h3>
        <p>PDF text extraction runs in the browser. Nothing is uploaded to a server.</p>
        <label className="file-drop">
          <input type="file" accept="application/pdf,image/*" onChange={(event) => onFileUpload(event.target.files)} />
          <span>{busy ? 'Reading locally...' : 'Choose file'}</span>
        </label>
      </section>

      <section className="panel wide-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Storage</span>
            <h3>Local files</h3>
          </div>
        </div>
        <div className="stack-list">
          {files.map((file) => (
            <div className="data-row" key={file.id}>
              <FileText size={18} />
              <div>
                <strong>{file.name}</strong>
                <span>{Math.round(file.size / 1024)} KB · {file.status}</span>
              </div>
              <time>{format(parseISO(file.addedAt), 'MMM d')}</time>
              <button type="button" className="icon-button danger" onClick={() => db.files.delete(file.id!)} aria-label="Delete file">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Timeline({
  compounds,
  injections,
  vitals,
  exams,
  files,
}: {
  compounds: Compound[]
  injections: Array<{ id?: number; compoundId: number; takenAt: string; dose?: number; unit: Unit; rawDose?: string }>
  vitals: Array<{ id?: number; measuredAt: string; systolic: number; diastolic: number }>
  exams: Array<{ id?: number; collectedAt: string; name: string }>
  files: Array<{ id?: number; addedAt: string; name: string; status: string }>
}) {
  const compoundMap = new Map(compounds.map((compound) => [compound.id, compound]))
  const events = [
    ...injections.map((entry) => ({
      id: `i-${entry.id}`,
      date: entry.takenAt,
      icon: Syringe,
      title: compoundMap.get(entry.compoundId)?.name ?? 'Injection',
      detail: doseLabel(entry),
    })),
    ...vitals.map((entry) => ({
      id: `v-${entry.id}`,
      date: entry.measuredAt,
      icon: HeartPulse,
      title: 'Blood pressure',
      detail: `${entry.systolic}/${entry.diastolic}`,
    })),
    ...exams.map((entry) => ({
      id: `e-${entry.id}`,
      date: entry.collectedAt,
      icon: FlaskConical,
      title: entry.name,
      detail: 'Lab exam',
    })),
    ...files.map((entry) => ({
      id: `f-${entry.id}`,
      date: entry.addedAt,
      icon: FileText,
      title: entry.name,
      detail: entry.status,
    })),
  ].sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())

  return (
    <section className="panel timeline-panel">
      <div className="panel-header">
        <div>
          <span className="section-label">All activity</span>
          <h3>Medical timeline</h3>
        </div>
      </div>
      <div className="timeline-list">
        {events.map((event) => (
          <div className="timeline-item" key={event.id}>
            <div className="timeline-icon">
              <event.icon size={17} />
            </div>
            <div>
              <strong>{event.title}</strong>
              <span>{event.detail}</span>
            </div>
            <time>{format(parseISO(event.date), 'MMM d, yyyy')}</time>
          </div>
        ))}
      </div>
    </section>
  )
}

function SettingsView() {
  return (
    <div className="content-grid two-column">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Privacy</span>
            <h3>Local-first mode</h3>
          </div>
          <Lock size={20} />
        </div>
        <div className="settings-list">
          <div>
            <strong>No user account</strong>
            <span>The app does not require sign-up or identity.</span>
          </div>
          <div>
            <strong>No cloud database</strong>
            <span>Data is saved in IndexedDB on this device/browser.</span>
          </div>
          <div>
            <strong>No analytics added</strong>
            <span>There are no tracking scripts in this build.</span>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Future</span>
            <h3>App Store path</h3>
          </div>
        </div>
        <p className="muted-copy">
          This PWA can later be wrapped with Capacitor for iOS and Android while preserving the local database model.
          Before selling it, add encrypted export/import, explicit privacy policy text, and medical-disclaimer language.
        </p>
      </section>
    </div>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function doseLabel(entry: { dose?: number; unit?: string; rawDose?: string }) {
  if (entry.rawDose) return entry.rawDose
  if (entry.dose !== undefined) return `${entry.dose} ${entry.unit ?? ''}`.trim()
  return 'Dose not set'
}

function ResultsTable({ results }: { results: Array<LabResult & { exam?: { collectedAt: string; name: string } }> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Marker</th>
            <th>Value</th>
            <th>Range</th>
            <th>Exam</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => {
            const status = result.status === 'Cancelled'
              ? 'out'
              : result.value !== undefined && result.low !== undefined && result.high !== undefined
              ? result.value < result.low || result.value > result.high
                ? 'out'
                : 'ok'
              : 'neutral'
            const displayValue = `${result.rawValue ?? result.value ?? '--'}${result.unit ? ` ${result.unit}` : ''}`
            return (
              <tr key={result.id}>
                <td>{result.marker}</td>
                <td>
                  <span className={`range-pill ${status}`}>{displayValue}</span>
                </td>
                <td>{result.low ?? '--'} - {result.high ?? '--'}</td>
                <td>{result.exam ? format(parseISO(result.exam.collectedAt), 'MMM d, yyyy') : 'Manual'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function titleFor(view: View) {
  const labels: Record<View, string> = {
    overview: 'Overview',
    meds: 'Medication log',
    vitals: 'Vitals',
    labs: 'Lab results',
    timeline: 'Timeline',
    files: 'Files',
    settings: 'Settings',
  }
  return labels[view]
}

export default App
