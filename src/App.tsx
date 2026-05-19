import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Brain,
  CalendarClock,
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
  importBundledSeed,
  recordCounts,
  seedIfEmpty,
  type Compound,
  type InjectionLog,
  type LabExam,
  type LabResult,
  type TestosteroneEster,
  type Unit,
  type VitalLog,
} from './lib/db'
import { wipeLocalDatabase } from './lib/lock'
import { useLockState } from './lib/useLockState'
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
  { id: 'timeline', label: 'History', icon: CalendarClock },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const units: Unit[] = ['mg', 'mcg', 'iu', 'ml', 'tablet', 'capsule']
const compoundCategories: Compound['category'][] = ['Peptide', 'TRT', 'Ancillary', 'Supplement', 'Other']
const labExamTypes = ['Blood', 'GP', 'Urine', 'Imaging', 'Specialist', 'Other']
const labUnits = [
  'ng/dL',
  'nmol/L',
  'pmol/L',
  'pg/mL',
  'ng/mL',
  'mcg/L',
  'mg/L',
  'g/L',
  'mmol/L',
  'umol/L',
  'mIU/L',
  'IU/L',
  'U/L',
  'kU/L',
  '%',
  'bpm',
  'mmHg',
  'kg',
  'mL/min/1.73m2',
  'ratio',
  'other',
]
const injectionSites = ['Abdomen', 'Left abdomen', 'Right abdomen', 'Left thigh', 'Right thigh', 'Left glute', 'Right glute', 'Deltoid']
const todayInput = () => new Date().toISOString().slice(0, 16)

function App() {
  const [activeView, setActiveView] = useState<View>('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const lockState = useLockState()

  useEffect(() => {
    void seedIfEmpty()
  }, [])

  useEffect(() => {
    if (lockState.mode === 'unlocked') {
      void seedIfEmpty()
    }
  }, [lockState.mode])

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

  if (lockState.isLocked) {
    return <LockScreen lockState={lockState} />
  }

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
        {activeView === 'labs' && <Labs compounds={compounds} injections={injections} vitals={vitals} exams={exams} results={enrichedResults} />}
        {activeView === 'timeline' && (
          <Timeline compounds={compounds} injections={injections} vitals={vitals} exams={exams} files={files} />
        )}
        {activeView === 'files' && <Files files={files} />}
        {activeView === 'settings' && <SettingsView lockState={lockState} />}
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

function LockScreen({ lockState }: { lockState: ReturnType<typeof useLockState> }) {
  const [passphrase, setPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const isSetup = lockState.mode === 'setup'

  async function submit() {
    if (busy || lockState.mode === 'loading') return
    if (isSetup && passphrase !== confirmPassphrase) return

    setBusy(true)
    try {
      const ok = isSetup ? await lockState.setup(passphrase) : await lockState.unlock(passphrase)
      if (ok) {
        setPassphrase('')
        setConfirmPassphrase('')
      }
    } finally {
      setBusy(false)
    }
  }

  async function resetLocalData() {
    const confirmed = window.confirm('This permanently wipes Apollo data stored in this browser. Continue?')
    if (!confirmed) return
    await wipeLocalDatabase()
    window.location.reload()
  }

  return (
    <main className="lock-shell">
      <section className="lock-panel">
        <div className="brand-mark">
          <Activity size={18} />
        </div>
        <div>
          <p className="eyeline">{isSetup ? 'Secure this browser' : 'Apollo locked'}</p>
          <h1>{isSetup ? 'Create your passphrase' : 'Enter passphrase'}</h1>
        </div>
        <p className="lock-copy">
          {isSetup
            ? 'This passphrase unlocks Apollo on this device. It cannot be recovered if you forget it.'
            : 'Apollo locks after inactivity so local health records stay gated when the device is handed off.'}
        </p>
        <form
          className="form-grid lock-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <input className="visually-hidden" autoComplete="username" value="apollo-local" readOnly />
          <label className="wide-field">
            Passphrase
            <input
              autoFocus
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </label>
          {isSetup && (
            <label className="wide-field">
              Confirm passphrase
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassphrase}
                onChange={(event) => setConfirmPassphrase(event.target.value)}
              />
            </label>
          )}
          {isSetup && passphrase !== confirmPassphrase && confirmPassphrase && (
            <p className="form-error wide-field">Passphrases do not match.</p>
          )}
          {lockState.error && <p className="form-error wide-field">{lockState.error}</p>}
          <button
            type="submit"
            className="primary-button wide-field"
            disabled={busy || !passphrase || (isSetup && passphrase !== confirmPassphrase)}
          >
            <Lock size={17} />
            {isSetup ? 'Save passphrase' : 'Unlock'}
          </button>
        </form>
        {!isSetup && (
          <button type="button" className="link-button" onClick={resetLocalData}>
            Forgot passphrase? Wipe local data
          </button>
        )}
      </section>
    </main>
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
  const [compoundName, setCompoundName] = useState('')
  const [dose, setDose] = useState('')
  const [unit, setUnit] = useState<Unit>('mg')
  const [site, setSite] = useState('Abdomen')
  const [category, setCategory] = useState<Compound['category']>('Peptide')
  const [takenAt, setTakenAt] = useState(todayInput())
  const [newCompound, setNewCompound] = useState({
    name: '',
    dose: '',
    unit: 'mg' as Unit,
    schedule: '',
    category: 'Peptide' as Compound['category'],
  })
  const compoundMap = new Map(compounds.map((compound) => [compound.id, compound]))
  const selectedCompound = compounds.find((compound) => compound.name.toLowerCase() === compoundName.trim().toLowerCase())
  const protocolGroups = [
    {
      title: 'Steroids',
      detail: 'TRT and androgen compounds',
      compounds: compounds.filter(isSteroidCompound),
    },
    {
      title: 'Peptides',
      detail: 'Metabolic and peptide protocols',
      compounds: compounds.filter((compound) => compound.category === 'Peptide'),
    },
    {
      title: 'Support',
      detail: 'Ancillary, supplement, and other items',
      compounds: compounds.filter((compound) => !isSteroidCompound(compound) && compound.category !== 'Peptide'),
    },
  ]

  async function addInjection() {
    const name = compoundName.trim()
    const effectiveDose = dose || String(selectedCompound?.defaultDose ?? '')
    if (!name || !effectiveDose) return

    const numericDose = Number(effectiveDose)
    const compoundId = selectedCompound?.id ?? await db.compounds.add({
      name,
      category,
      defaultDose: Number.isFinite(numericDose) ? numericDose : 0,
      unit,
      schedule: 'As needed',
      color: colorForCategory(category),
    })

    await db.injections.add({
      compoundId,
      takenAt: new Date(takenAt).toISOString(),
      dose: Number.isFinite(numericDose) ? numericDose : undefined,
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
      category: newCompound.category,
      defaultDose: Number(newCompound.dose),
      unit: newCompound.unit,
      schedule: newCompound.schedule || 'As needed',
      color: colorForCategory(newCompound.category),
    })
    setNewCompound({ name: '', dose: '', unit: 'mg', schedule: '', category: 'Peptide' })
  }

  return (
    <div className="content-grid protocols-grid">
      <section className="panel protocol-quick-add">
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
            <input
              list="compound-options"
              placeholder="Compound name"
              value={compoundName}
              onChange={(event) => {
                const nextName = event.target.value
                const selected = compounds.find((compound) => compound.name.toLowerCase() === nextName.trim().toLowerCase())
                setCompoundName(nextName)
                if (selected) {
                  setDose(String(selected.defaultDose))
                  setUnit(selected.unit)
                  setCategory(selected.category)
                }
              }}
            />
            <datalist id="compound-options">
              {compounds.map((compound) => (
                <option value={compound.name} key={compound.id} />
              ))}
            </datalist>
          </label>
          <label>
            Type
            <select value={category} onChange={(event) => setCategory(event.target.value as Compound['category'])}>
              {compoundCategories.map((option) => <option value={option} key={option}>{protocolTypeLabel(option)}</option>)}
            </select>
          </label>
          <label>
            Dose
            <input placeholder={String(selectedCompound?.defaultDose ?? '')} value={dose} onChange={(event) => setDose(event.target.value)} inputMode="decimal" />
          </label>
          <label>
            Unit
            <select value={unit} onChange={(event) => setUnit(event.target.value as Unit)}>
              {units.map((unitOption) => <option key={unitOption}>{unitOption}</option>)}
            </select>
          </label>
          <label>
            Site
            <input list="injection-site-options" value={site} onChange={(event) => setSite(event.target.value)} />
            <datalist id="injection-site-options">
              {injectionSites.map((option) => <option value={option} key={option} />)}
            </datalist>
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

      <section className="panel protocol-board-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Protocol</span>
            <h3>Active compounds by type</h3>
          </div>
        </div>
        <div className="protocol-mix" aria-label="Protocol mix">
          {protocolGroups.map((group) => (
            <span
              key={group.title}
              className={`protocol-mix-segment ${group.title.toLowerCase()}`}
              style={{ flexGrow: Math.max(group.compounds.length, 1) }}
              title={`${group.title}: ${group.compounds.length}`}
            />
          ))}
        </div>
        <div className="protocol-board">
          {protocolGroups.map((group) => (
            <div className="protocol-column" key={group.title}>
              <div className="protocol-column-header">
                <div>
                  <strong>{group.title}</strong>
                  <span>{group.detail}</span>
                </div>
                <em>{group.compounds.length}</em>
              </div>
              <div className="protocol-card-list">
                {group.compounds.map((compound) => {
                  const count = injections.filter((entry) => entry.compoundId === compound.id).length
                  return (
                    <div className="protocol-card" key={compound.id}>
                      <span className="dot" style={{ background: compound.color }} />
                      <div>
                        <strong>{compound.name}</strong>
                        <span>{compound.defaultDose} {compound.unit} · {compound.schedule}</span>
                      </div>
                      <small>{count} logs</small>
                    </div>
                  )
                })}
                {group.compounds.length === 0 && <p className="muted-copy">Nothing logged here yet.</p>}
              </div>
            </div>
          ))}
        </div>
        <div className="inline-add protocol-inline-add">
          <input placeholder="New compound" value={newCompound.name} onChange={(event) => setNewCompound({ ...newCompound, name: event.target.value })} />
          <input placeholder="Dose" value={newCompound.dose} onChange={(event) => setNewCompound({ ...newCompound, dose: event.target.value })} />
          <select value={newCompound.unit} onChange={(event) => setNewCompound({ ...newCompound, unit: event.target.value as Unit })}>
            {units.map((unitOption) => <option key={unitOption}>{unitOption}</option>)}
          </select>
          <select value={newCompound.category} onChange={(event) => setNewCompound({ ...newCompound, category: event.target.value as Compound['category'] })}>
            {compoundCategories.map((option) => <option value={option} key={option}>{protocolTypeLabel(option)}</option>)}
          </select>
          <input placeholder="Schedule" value={newCompound.schedule} onChange={(event) => setNewCompound({ ...newCompound, schedule: event.target.value })} />
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

type VitalsChartPoint = {
  date: string
  measuredAt: string
  systolic: number
  diastolic: number
  pulse?: number
  notes?: string
}

function VitalsTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: VitalsChartPoint }>
}) {
  if (!active || !payload?.[0]) return null
  const point = payload[0].payload

  return (
    <div className="chart-tooltip">
      <strong>{format(parseISO(point.measuredAt), 'MMM d, HH:mm')}</strong>
      <span>{point.systolic}/{point.diastolic} mmHg{point.pulse ? ` · ${point.pulse} bpm` : ''}</span>
      {point.notes && <p>{point.notes}</p>}
    </div>
  )
}

function Vitals({ vitals }: { vitals: Array<{ id?: number; measuredAt: string; systolic: number; diastolic: number; pulse?: number; notes?: string }> }) {
  const [form, setForm] = useState({ systolic: '', diastolic: '', pulse: '', measuredAt: todayInput(), notes: '' })
  const chart = [...vitals].reverse().map((vital) => ({
    date: format(parseISO(vital.measuredAt), 'MMM d'),
    measuredAt: vital.measuredAt,
    systolic: vital.systolic,
    diastolic: vital.diastolic,
    pulse: vital.pulse,
    notes: vital.notes,
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
    <div className="content-grid vitals-grid">
      <section className="panel vitals-quick-panel">
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
          <label className="wide-field">
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

      <section className="panel chart-panel vitals-chart-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Trend BP</span>
            <h3>Blood pressure</h3>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={340}>
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
            <Tooltip content={<VitalsTooltip />} />
            <Area type="monotone" dataKey="systolic" stroke="#0f8f84" strokeWidth={3} fill="url(#bpFill)" />
            <Line type="monotone" dataKey="diastolic" stroke="#64748b" strokeWidth={3} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
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
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  vitals: VitalLog[]
  exams: LabExam[]
  results: EnrichedResult[]
}) {
  const [examName, setExamName] = useState('Blood panel')
  const [examType, setExamType] = useState('Blood')
  const [examDate, setExamDate] = useState(todayInput())
  const [location, setLocation] = useState('')
  const [company, setCompany] = useState('')
  const [marker, setMarker] = useState('Total Testosterone')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('ng/dL')
  const [selectedMarker, setSelectedMarker] = useState('Progesterone')

  async function addResult() {
    if (!marker.trim() || !value.trim()) return
    const collectedAt = new Date(examDate).toISOString()
    const cleanName = examName.trim() || `${examType} result`
    const cleanCompany = company.trim()
    const existingExam = exams.find((exam) => (
      exam.name === cleanName
      && exam.collectedAt === collectedAt
      && (exam.labName ?? exam.company ?? '') === cleanCompany
    ))
    const examId = existingExam?.id ?? await db.exams.add({
      name: cleanName,
      collectedAt,
      examType,
      location: location.trim() || undefined,
      company: cleanCompany || undefined,
      labName: cleanCompany || undefined,
      notes: location.trim() ? `Location: ${location.trim()}` : undefined,
    })
    const numericValue = Number(value.replaceAll(',', ''))
    await db.results.add({
      examId,
      marker: marker.trim(),
      value: Number.isFinite(numericValue) ? numericValue : undefined,
      rawValue: value,
      unit,
      source: 'Manual entry',
    })
    setValue('')
  }

  const markerOptions = Array.from(new Set(results.map((result) => result.marker))).sort((a, b) => a.localeCompare(b))
  const effectiveMarker = markerOptions.includes(selectedMarker) ? selectedMarker : markerOptions[0] ?? ''

  return (
    <div className="content-grid labs-layout">
      <section className="panel lab-entry-panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Manual</span>
            <h3>Add lab result</h3>
          </div>
        </div>
        <div className="form-grid lab-form-grid">
          <label>
            Exam name
            <input value={examName} onChange={(event) => setExamName(event.target.value)} />
          </label>
          <label>
            Type
            <select value={examType} onChange={(event) => setExamType(event.target.value)}>
              {labExamTypes.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            Date of exam
            <input type="datetime-local" value={examDate} onChange={(event) => setExamDate(event.target.value)} />
          </label>
          <label>
            Location
            <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Clinic, city, or room" />
          </label>
          <label>
            Company
            <input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Lab or provider" />
          </label>
          <span className="lab-form-break" />
          <label>
            Marker
            <input list="marker-options" value={marker} onChange={(event) => setMarker(event.target.value)} />
            <datalist id="marker-options">
              {markerOptions.map((option) => <option value={option} key={option} />)}
            </datalist>
          </label>
          <label>
            Value
            <input value={value} onChange={(event) => setValue(event.target.value)} />
          </label>
          <label>
            Unit
            <select value={unit} onChange={(event) => setUnit(event.target.value)}>
              {labUnits.map((unitOption) => <option key={unitOption}>{unitOption}</option>)}
            </select>
          </label>
          <button type="button" className="primary-button wide-field" onClick={addResult}>
            <Plus size={17} />
            Save marker
          </button>
        </div>
      </section>

      <aside className="lab-side-column">
        <section className="panel compact-panel">
          <MarkerDetail results={results} marker={effectiveMarker} onMarkerChange={setSelectedMarker} markerOptions={markerOptions} compact />
        </section>
        <section className="panel compact-panel">
          <CorrelationExplorer compounds={compounds} injections={injections} vitals={vitals} results={results} compact />
        </section>
      </aside>

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
  compact = false,
}: {
  results: EnrichedResult[]
  marker: string
  markerOptions: string[]
  onMarkerChange: (marker: string) => void
  compact?: boolean
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
        <select className="mini-select marker-select" value={marker} disabled={markerOptions.length === 0} onChange={(event) => onMarkerChange(event.target.value)}>
          {markerOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
      <div className={compact ? 'marker-detail-grid compact-marker-grid' : 'marker-detail-grid'}>
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
          {!compact && <p className="panel-note">{markerExplanation(marker)}</p>}
        </div>
        <div className="marker-chart">
          <ResponsiveContainer width="100%" height={compact ? 132 : 180}>
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
      <div className={compact ? 'relation-list compact-relations' : 'relation-list'}>
        {related.map((result) => (
          <div className="relation-row" key={result.id}>
            <span>{result.marker}</span>
            <strong>{result.rawValue} {result.unit ?? ''}</strong>
            <small>{labStatus(result)}</small>
          </div>
        ))}
      </div>
      {!compact && <p className="panel-note">Apollo shows nearby signals so you can ask better questions. It does not decide cause.</p>}
    </>
  )
}

function CorrelationExplorer({
  compounds,
  injections,
  vitals,
  results,
  compact = false,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  vitals: VitalLog[]
  results: EnrichedResult[]
  compact?: boolean
}) {
  const insights = buildCorrelationInsights(compounds, injections, vitals, results)
  const visibleInsights = compact ? insights.slice(0, 3) : insights

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Explorer</span>
          <h3>{compact ? 'Signal summary' : 'Cross-signal correlations'}</h3>
        </div>
        {!compact && <span className="safety-chip">Never causal by itself</span>}
      </div>
      <div className={compact ? 'correlation-grid compact-correlation-grid' : 'correlation-grid'}>
        {visibleInsights.map((insight) => (
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
  return (
    <div className="content-grid">
      <section className="panel files-coming-soon full-panel">
        <div className="coming-soon-icon">
          <FileText size={28} />
        </div>
        <div>
          <span className="section-label">Coming soon</span>
          <h3>Files and automatic extraction</h3>
          <p>
            This page is parked until Apollo can reliably read lab PDFs, extract markers, and attach them to the right result.
            For now, add lab results manually from the Labs page.
          </p>
        </div>
        <div className="coming-soon-stats">
          <Metric label="Stored locally" value={String(files.length)} detail="Existing browser files kept hidden from the workflow" />
          <Metric label="Next step" value="PDF OCR" detail="Automatic marker extraction and review queue" />
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
          <h3>Health history</h3>
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

function SettingsView({ lockState }: { lockState: ReturnType<typeof useLockState> }) {
  const [importStatus, setImportStatus] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [counts, setCounts] = useState({ compounds: 0, injections: 0, vitals: 0, exams: 0, results: 0, files: 0 })

  useEffect(() => {
    void recordCounts().then(setCounts)
  }, [])

  async function importSeedData(force = false) {
    setImportBusy(true)
    setImportStatus('')
    try {
      const result = await importBundledSeed(force)
      const nextCounts = await recordCounts()
      setCounts(nextCounts)
      if (result.status === 'missing') {
        setImportStatus('Bundled data file was not available in this deployment.')
      } else if (result.status === 'skipped') {
        setImportStatus('Bundled data is already imported on this browser.')
      } else {
        setImportStatus(`Imported ${nextCounts.injections} injections, ${nextCounts.vitals} vitals, and ${nextCounts.results} lab results.`)
      }
    } finally {
      setImportBusy(false)
    }
  }

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
            <span className="section-label">Data</span>
            <h3>Bundled health data</h3>
          </div>
          <Database size={20} />
        </div>
        <div className="settings-list">
          <div>
            <strong>{counts.injections} injections · {counts.vitals} vitals · {counts.results} lab results</strong>
            <span>Data is stored in this browser after Cloudflare login and Apollo unlock.</span>
          </div>
          <button type="button" className="primary-button" disabled={importBusy} onClick={() => importSeedData(false)}>
            <UploadCloud size={17} />
            Import bundled data
          </button>
          <button type="button" className="ghost-button" disabled={importBusy} onClick={() => importSeedData(true)}>
            Replace with bundled data
          </button>
          {importStatus && <p className="panel-note">{importStatus}</p>}
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="section-label">Security</span>
            <h3>Passphrase lock</h3>
          </div>
          <ShieldCheck size={20} />
        </div>
        <div className="settings-list">
          <div>
            <strong>Enabled on this browser</strong>
            <span>Apollo asks for the passphrase on cold open and after inactivity.</span>
          </div>
          <label>
            Idle timeout
            <select value={lockState.idleMinutes} onChange={(event) => lockState.setIdleMinutes(Number(event.target.value))}>
              <option value={1}>1 minute</option>
              <option value={5}>5 minutes</option>
              <option value={10}>10 minutes</option>
              <option value={30}>30 minutes</option>
            </select>
          </label>
          <button type="button" className="ghost-button" onClick={lockState.lock}>
            <Lock size={17} />
            Lock now
          </button>
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

function isSteroidCompound(compound: Compound) {
  const name = compound.name.toLowerCase()
  return compound.category === 'TRT' || name.includes('testosterone') || name.includes('nandrolone') || name.includes('masteron')
}

function protocolTypeLabel(category: Compound['category']) {
  if (category === 'TRT') return 'Steroid'
  return category
}

function colorForCategory(category: Compound['category']) {
  if (category === 'TRT') return '#2563eb'
  if (category === 'Peptide') return '#0f8f84'
  if (category === 'Ancillary') return '#a855f7'
  if (category === 'Supplement') return '#16a34a'
  return '#64748b'
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
    timeline: 'History',
    files: 'Files',
    settings: 'Settings',
  }
  return labels[view]
}

export default App
