import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Brain,
  CalendarClock,
  Check,
  ChevronRight,
  Database,
  FileText,
  FlaskConical,
  Gauge,
  GitCompare,
  HeartPulse,
  Home,
  Lock,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  ShieldCheck,
  Syringe,
  TrendingDown,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import {
  db,
  seedIfEmpty,
  type Compound,
  type InjectionLog,
  type LabExam,
  type LabResult,
  type TestosteroneEster,
  type Unit,
  type VitalLog,
} from './lib/db'
import { extractMarkersFromText, extractPdfText, type ExtractedMarker } from './lib/pdf'
import {
  buildCorrelationInsights,
  buildTestosteroneCurve,
  buildWeightDoseSeries,
  esterProfiles,
  flagLatestResults,
  inferEster,
  labStatus,
  latestResult,
  markerHistory,
  weightSummary,
  type EnrichedResult,
} from './lib/insights'
import './index.css'

type View = 'overview' | 'meds' | 'vitals' | 'labs' | 'timeline' | 'files' | 'settings'

const navItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'meds', label: 'Protocols', icon: Syringe },
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

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
  const recentInjections = injections.slice(0, 3)
  const examMap = useMemo(() => new Map(exams.map((exam) => [exam.id, exam])), [exams])
  const enrichedResults = useMemo(
    () => results.map((result) => ({ ...result, exam: examMap.get(result.examId) })),
    [examMap, results],
  )
  const recentResults = useMemo(() => {
    return enrichedResults
      .filter((result) => result.exam)
      .sort((a, b) => parseISO(b.exam!.collectedAt).getTime() - parseISO(a.exam!.collectedAt).getTime())
      .slice(0, 8)
  }, [enrichedResults])

  return (
    <div className={sidebarCollapsed ? 'app-shell sidebar-collapsed' : 'app-shell'}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand-row">
            <div className="brand-mark">
              <Activity size={18} />
            </div>
            <div>
              <strong>Apollo Health</strong>
              <span>Local-first tracker</span>
            </div>
          </div>
          <button
            type="button"
            className="icon-button sidebar-toggle"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
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
            injections={injections}
            vitals={vitals}
            exams={exams}
            results={enrichedResults}
            onNavigate={setActiveView}
          />
        )}
        {activeView === 'meds' && <Meds compounds={compounds} injections={injections} />}
        {activeView === 'vitals' && <Vitals vitals={vitals} />}
        {activeView === 'labs' && <Labs compounds={compounds} injections={injections} vitals={vitals} exams={exams} results={enrichedResults} files={files} />}
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
  injections,
  vitals,
  exams,
  results,
  onNavigate,
}: {
  compounds: Compound[]
  latestBp?: { systolic: number; diastolic: number; pulse?: number; measuredAt: string }
  recentInjections: Array<{ id?: number; compoundId: number; takenAt: string; dose?: number; unit: Unit; site?: string; rawDose?: string }>
  recentResults: Array<LabResult & { exam?: { collectedAt: string; name: string } }>
  injections: InjectionLog[]
  vitals: VitalLog[]
  exams: LabExam[]
  results: EnrichedResult[]
  onNavigate: (view: View) => void
}) {
  const compoundMap = new Map(compounds.map((compound) => [compound.id, compound]))
  const weightSeries = buildWeightDoseSeries(compounds, injections)
  const weightStats = weightSummary(weightSeries)
  const testosteroneCurve = buildTestosteroneCurve(compounds, injections)
  const correlationInsights = buildCorrelationInsights(compounds, injections, vitals, results)
  const labFlags = flagLatestResults(results)
  const progesterone = latestResult(results, ['progesterone'])
  const shbg = latestResult(results, ['sex hormone binding globulin', 'shbg'])
  const latestExam = exams[0]
  const bpChart = [...vitals]
    .reverse()
    .slice(-8)
    .map((vital) => ({
      date: format(parseISO(vital.measuredAt), 'MMM d'),
      systolic: vital.systolic,
      diastolic: vital.diastolic,
    }))
  const latestWeight = weightStats.latest ? `${weightStats.latest.toFixed(1)} kg` : 'No weight'
  const weightDelta = weightStats.delta !== undefined ? `${weightStats.delta.toFixed(1)} kg total` : 'Add weight to reta log'

  return (
    <div className="content-grid overview-grid">
      <section className="panel summary-panel full-panel">
        <div className="summary-header">
          <div>
            <span className="section-label">Today</span>
            <h2>Your health at a glance</h2>
          </div>
          <button type="button" className="primary-button" onClick={() => onNavigate('meds')}>
            <Plus size={17} />
            Add injection
          </button>
        </div>
        <div className="summary-grid">
          <SummaryCard icon={Syringe} label="Protocols" value={String(compounds.length)} detail="Active compounds" />
          <SummaryCard
            icon={HeartPulse}
            label="Blood pressure"
            value={latestBp ? `${latestBp.systolic}/${latestBp.diastolic}` : 'No data'}
            detail={latestBp ? `${latestBp.pulse ?? '--'} bpm latest` : 'Add first reading'}
          />
          <SummaryCard icon={TrendingDown} label="Weight" value={latestWeight} detail={weightDelta} tone="green" />
          <SummaryCard
            icon={FlaskConical}
            label="Lab watch"
            value={String(labFlags.length)}
            detail={latestExam ? `Latest ${format(parseISO(latestExam.collectedAt), 'MMM d')}` : 'No exams yet'}
            tone={labFlags.length ? 'amber' : 'green'}
          />
        </div>
      </section>

      <section className="panel dashboard-large">
        <RetatrutideWeightChart compounds={compounds} injections={injections} />
      </section>

      <section className="panel dashboard-medium">
        <TestosteroneCurvePanel compounds={compounds} injections={injections} compact />
      </section>

      <section className="panel dashboard-small">
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
        <div className="stack-list compact-list">
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

      <section className="panel import-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Watch list</span>
            <h3>Latest lab flags</h3>
          </div>
          <Brain size={20} />
        </div>
        {labFlags.length > 0 ? (
          <div className="stack-list compact-list">
            {labFlags.slice(0, 5).map((result) => (
              <div className="data-row" key={result.id}>
                <AlertTriangle size={17} />
                <div>
                  <strong>{result.marker}</strong>
                  <span>{labStatus(result)} · {result.rawValue} {result.unit ?? ''}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <Database size={24} />
            <strong>No latest flags.</strong>
            <span>Current imported results have no range flags available.</span>
          </div>
        )}
      </section>

      <section className="panel insight-panel full-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Intelligence</span>
            <h3>Pattern cards</h3>
          </div>
          <span className="safety-chip">Pattern, not diagnosis</span>
        </div>
        <div className="insight-grid">
          <InsightCard
            icon={TrendingDown}
            title="Retatrutide response"
            value={weightStats.delta !== undefined ? `${weightStats.delta.toFixed(1)} kg` : 'Need weight'}
            detail={weightStats.percent !== undefined ? `${weightStats.percent.toFixed(1)}% from first logged weight` : 'Log weight with each dose to track response.'}
          />
          <InsightCard
            icon={Gauge}
            title={`${testosteroneCurve.ester} load`}
            value={testosteroneCurve.activeNow ? `${testosteroneCurve.activeNow} mg est.` : 'No estimate'}
            detail={testosteroneCurve.lastInjection ? `Last dose ${format(parseISO(testosteroneCurve.lastInjection.takenAt), 'MMM d, HH:mm')}` : 'Select a testosterone compound and ester.'}
          />
          <InsightCard
            icon={AlertTriangle}
            title="Progesterone"
            value={progesterone ? labStatus(progesterone) : 'No data'}
            detail={progesterone ? `${progesterone.rawValue} ${progesterone.unit ?? ''}; compare with SHBG ${shbg?.rawValue ?? '--'}` : 'Import hormone markers to analyze.'}
          />
          <InsightCard
            icon={GitCompare}
            title="Best next view"
            value="Correlations"
            detail="Cross-check timing between protocol changes, BP, weight, and lab shifts before drawing conclusions."
          />
        </div>
      </section>

      <section className="panel wide-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Correlations</span>
            <h3>What moved together</h3>
          </div>
          <span className="safety-chip">Correlation only</span>
        </div>
        <div className="correlation-grid">
          {correlationInsights.map((insight) => (
            <div className="correlation-card" key={insight.title}>
              <span>{insight.title}</span>
              <strong>{insight.value}</strong>
              <small>{insight.strength}</small>
              <p>{insight.detail}</p>
            </div>
          ))}
        </div>
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
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'teal',
}: {
  icon: typeof Home
  label: string
  value: string
  detail: string
  tone?: 'teal' | 'green' | 'amber'
}) {
  return (
    <div className="summary-card">
      <div className={`summary-icon ${tone}`}>
        <Icon size={18} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </div>
  )
}

function InsightCard({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: typeof Home
  title: string
  value: string
  detail: string
}) {
  return (
    <div className="insight-card">
      <div className="insight-icon">
        <Icon size={17} />
      </div>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </div>
  )
}

function RetatrutideWeightChart({ compounds, injections }: { compounds: Compound[]; injections: InjectionLog[] }) {
  const series = buildWeightDoseSeries(compounds, injections)
  const stats = weightSummary(series)
  const chartData = series.filter((point) => point.weight !== undefined || point.dose !== undefined).slice(-24)

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Retatrutide</span>
          <h3>Dose vs weight response</h3>
        </div>
        <div className="header-metrics">
          <span>{stats.latest ? `${stats.latest.toFixed(1)} kg` : 'No weight'}</span>
          <strong>{stats.delta !== undefined ? `${stats.delta.toFixed(1)} kg` : 'n/a'}</strong>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="#eef1f2" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#75808a', fontSize: 12 }} />
          <YAxis yAxisId="weight" tickLine={false} axisLine={false} tick={{ fill: '#75808a', fontSize: 12 }} />
          <YAxis yAxisId="dose" orientation="right" tickLine={false} axisLine={false} tick={{ fill: '#75808a', fontSize: 12 }} />
          <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#e7ecef' }} />
          <Bar yAxisId="dose" dataKey="dose" name="Dose" fill="#dbeafe" radius={[4, 4, 0, 0]} />
          <Line yAxisId="weight" type="monotone" dataKey="weight" name="Weight" stroke="#0f8f84" strokeWidth={3} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="panel-note">
        Use this to spot response timing after dose changes. It is a trend view, not a dosing recommendation.
      </p>
    </>
  )
}

function TestosteroneCurvePanel({
  compounds,
  injections,
  compact = false,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  compact?: boolean
}) {
  const testosterone = compounds.find((compound) => compound.name.toLowerCase().includes('testosterone'))
  const [esterChoice, setEsterChoice] = useState<TestosteroneEster | ''>('')
  const ester = esterChoice || inferEster(testosterone)
  const curve = buildTestosteroneCurve(compounds, injections, ester)
  const profile = esterProfiles[ester]
  const lastDoseDate = curve.lastInjection ? format(parseISO(curve.lastInjection.takenAt), 'MMM d') : undefined

  async function updateEster(next: TestosteroneEster) {
    setEsterChoice(next)
    if (testosterone?.id) {
      await db.compounds.update(testosterone.id, {
        ester: next,
        halfLifeDays: esterProfiles[next].halfLifeDays,
        peakHours: esterProfiles[next].peakHours,
      })
    }
  }

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Testosterone model</span>
          <h3>{compact ? 'Active curve' : 'Estimated active amount and peak/trough'}</h3>
        </div>
        <select className="mini-select" value={ester} onChange={(event) => updateEster(event.target.value as TestosteroneEster)}>
          {(Object.keys(esterProfiles) as TestosteroneEster[]).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <div className="protocol-summary">
        <Metric label="Active now" value={curve.activeNow ? `${curve.activeNow} mg` : 'n/a'} detail="Estimated ester-weighted load" />
        <Metric label="Half-life" value={`${profile.halfLifeDays}d`} detail={`Peak model ${profile.peakHours}h`} />
      </div>
      <ResponsiveContainer width="100%" height={compact ? 210 : 300}>
        <AreaChart data={curve.points} margin={{ top: 12, right: 10, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="testFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.24} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eef1f2" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#75808a', fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: '#75808a', fontSize: 12 }} />
          <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#e7ecef' }} />
          {lastDoseDate && <ReferenceLine x={lastDoseDate} stroke="#94a3b8" strokeDasharray="4 4" />}
          <Area type="monotone" dataKey="active" name="Estimated active mg" stroke="#2563eb" strokeWidth={3} fill="url(#testFill)" />
        </AreaChart>
      </ResponsiveContainer>
      <p className="panel-note">{profile.note} The curve is useful for timing patterns around symptoms, BP, and labs.</p>
    </>
  )
}

function Meds({
  compounds,
  injections,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
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
        <TestosteroneCurvePanel compounds={compounds} injections={injections} />
      </section>

      <section className="panel wide-panel">
        <RetatrutideWeightChart compounds={compounds} injections={injections} />
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
  const [examName, setExamName] = useState('Blood panel')
  const [marker, setMarker] = useState('Total Testosterone')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('ng/dL')
  const [selectedExamId, setSelectedExamId] = useState('')
  const [selectedMarker, setSelectedMarker] = useState('Progesterone')

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

  const markerOptions = Array.from(new Set(results.map((result) => result.marker))).sort((a, b) => a.localeCompare(b))
  const effectiveMarker = markerOptions.includes(selectedMarker) ? selectedMarker : markerOptions[0] ?? ''
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
        <MarkerDetail results={results} marker={effectiveMarker} onMarkerChange={setSelectedMarker} markerOptions={markerOptions} />
      </section>

      <section className="panel wide-panel">
        <CorrelationExplorer compounds={compounds} injections={injections} vitals={vitals} results={results} />
      </section>

      <section className="panel wide-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Comparison</span>
            <h3>Biomarkers over time</h3>
          </div>
        </div>
        <ResultsTable results={results} />
      </section>
    </div>
  )
}

function MarkerDetail({
  results,
  marker,
  markerOptions,
  onMarkerChange,
}: {
  results: EnrichedResult[]
  marker: string
  markerOptions: string[]
  onMarkerChange: (marker: string) => void
}) {
  const history = markerHistory(results, marker)
  const current = [...results]
    .filter((result) => result.marker === marker && result.exam)
    .sort((a, b) => parseISO(b.exam!.collectedAt).getTime() - parseISO(a.exam!.collectedAt).getTime())[0]
  const previous = [...results]
    .filter((result) => result.marker === marker && result.exam)
    .sort((a, b) => parseISO(b.exam!.collectedAt).getTime() - parseISO(a.exam!.collectedAt).getTime())[1]
  const related = relatedMarkersFor(marker)
    .map((relatedMarker) => latestResult(results, [relatedMarker]))
    .filter((result): result is EnrichedResult => Boolean(result))
    .filter((result, index, rows) => rows.findIndex((row) => row.id === result.id) === index)
  const delta = current?.value !== undefined && previous?.value !== undefined ? current.value - previous.value : undefined

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Marker detail</span>
          <h3>{marker || 'Select a marker'}</h3>
        </div>
        <select className="mini-select marker-select" value={marker} onChange={(event) => onMarkerChange(event.target.value)}>
          {markerOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
      <div className="marker-detail-grid">
        <div className="marker-main">
          <span className={`range-pill ${labStatus(current) === 'High' || labStatus(current) === 'Low' ? 'out' : 'ok'}`}>
            {labStatus(current)}
          </span>
          <strong>{current ? `${current.rawValue} ${current.unit ?? ''}` : 'No value'}</strong>
          <p>
            {delta !== undefined
              ? `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} from previous result.`
              : 'Not enough repeated values to calculate a trend.'}
          </p>
          <p className="panel-note">{markerExplanation(marker)}</p>
        </div>
        <div className="marker-chart">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#eef1f2" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#75808a', fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#75808a', fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#e7ecef' }} />
              <Line type="monotone" dataKey="value" stroke="#0f8f84" strokeWidth={3} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="relation-list">
        {related.map((result) => (
          <div className="relation-row" key={result.id}>
            <span>{result.marker}</span>
            <strong>{result.rawValue} {result.unit ?? ''}</strong>
            <small>{labStatus(result)}</small>
          </div>
        ))}
      </div>
      <p className="panel-note">Apollo shows nearby signals so you can ask better questions. It does not decide cause.</p>
    </>
  )
}

function CorrelationExplorer({
  compounds,
  injections,
  vitals,
  results,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  vitals: VitalLog[]
  results: EnrichedResult[]
}) {
  const insights = buildCorrelationInsights(compounds, injections, vitals, results)

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Explorer</span>
          <h3>Cross-signal correlations</h3>
        </div>
        <span className="safety-chip">Never causal by itself</span>
      </div>
      <div className="correlation-grid">
        {insights.map((insight) => (
          <div className="correlation-card" key={insight.title}>
            <span>{insight.title}</span>
            <strong>{insight.value}</strong>
            <small>{insight.strength}</small>
            <p>{insight.detail}</p>
          </div>
        ))}
      </div>
    </>
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

function relatedMarkersFor(marker: string) {
  const key = marker.toLowerCase()
  if (key.includes('progesterone')) return ['Testosterone', 'Oestradiol', 'Estradiol', 'Sex Hormone Binding Globulin', 'Prolactin']
  if (key.includes('testosterone')) return ['Oestradiol', 'Estradiol', 'Sex Hormone Binding Globulin', 'Prolactin', 'Haematocrit']
  if (key.includes('creatinine') || key.includes('egfr')) return ['Urea', 'Uric Acid', 'Sodium', 'Total Protein']
  if (key.includes('cholesterol') || key.includes('triglycerides')) return ['HDL Cholesterol', 'LDL Cholesterol', 'Triglycerides', 'HbA1c', 'Glucose']
  if (key.includes('haematocrit') || key.includes('hematocrit')) return ['Haemoglobin', 'Red blood cell count', 'Testosterone', 'Ferritin']
  return ['Testosterone', 'Oestradiol', 'SHBG', 'Creatinine']
}

function markerExplanation(marker: string) {
  const key = marker.toLowerCase()
  if (key.includes('progesterone')) return 'Useful to review beside testosterone, estradiol/oestradiol, SHBG, and prolactin before assuming a cause.'
  if (key.includes('testosterone')) return 'Review with ester timing, dose history, SHBG, estradiol/oestradiol, symptoms, and draw timing.'
  if (key.includes('creatinine')) return 'Often shifts with hydration, muscle mass, training, supplements, and kidney filtration markers such as eGFR and urea.'
  if (key.includes('blood') || key.includes('haematocrit') || key.includes('hematocrit')) return 'Review with testosterone load, hydration, blood pressure, iron status, and repeated trend.'
  return 'Apollo compares this marker with nearby protocol, BP, weight, and related lab signals. Treat it as a question generator.'
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
    meds: 'Protocols',
    vitals: 'Vitals',
    labs: 'Lab results',
    timeline: 'Timeline',
    files: 'Files',
    settings: 'Settings',
  }
  return labels[view]
}

export default App
