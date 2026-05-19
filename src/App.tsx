import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Brain,
  CalendarClock,
  FileText,
  FlaskConical,
  HeartPulse,
  Home,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings as SettingsIcon,
  Syringe,
  Target,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { parseISO } from 'date-fns'
import { db, seedIfEmpty } from './lib/db'
import type { View } from './app/views'
import { Overview } from './views/Overview'
import { Protocols } from './views/Protocols'
import { Vitals } from './views/Vitals'
import { Labs } from './views/Labs'
import { Symptoms } from './views/Symptoms'
import { Targets } from './views/Targets'
import { Timeline } from './views/Timeline'
import { Files } from './views/Files'
import { Settings } from './views/Settings'
import './index.css'

const NAV: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'meds', label: 'Protocols', icon: Syringe },
  { id: 'vitals', label: 'Vitals', icon: HeartPulse },
  { id: 'labs', label: 'Labs', icon: FlaskConical },
  { id: 'symptoms', label: 'Symptoms', icon: Brain },
  { id: 'targets', label: 'Targets', icon: Target },
  { id: 'timeline', label: 'Timeline', icon: CalendarClock },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

function App() {
  const [activeView, setActiveView] = useState<View>('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    void seedIfEmpty()
  }, [])

  const compounds = useLiveQuery(async () => (await db.compounds.toArray()).filter((c) => !c.archived), [], [])
  const injections = useLiveQuery(() => db.injections.orderBy('takenAt').reverse().toArray(), [], [])
  const vitals = useLiveQuery(() => db.vitals.orderBy('measuredAt').reverse().toArray(), [], [])
  const exams = useLiveQuery(() => db.exams.orderBy('collectedAt').reverse().toArray(), [], [])
  const results = useLiveQuery(() => db.results.toArray(), [], [])
  const files = useLiveQuery(() => db.files.orderBy('addedAt').reverse().toArray(), [], [])

  const examMap = useMemo(() => new Map(exams.map((e) => [e.id, e])), [exams])
  const enrichedResults = useMemo(
    () => results.map((r) => ({ ...r, exam: examMap.get(r.examId) })),
    [results, examMap],
  )

  return (
    <div className={sidebarCollapsed ? 'app-shell sidebar-collapsed' : 'app-shell'}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand-row">
            <div className="brand-mark"><Activity size={16} /></div>
            <div>
              <strong>Apollo</strong>
              <span>Health · local</span>
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={sidebarCollapsed ? 'Expand' : 'Collapse'}
            onClick={() => setSidebarCollapsed((c) => !c)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>
        <nav className="nav-list" aria-label="Primary">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeView === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView(item.id)}
            >
              <item.icon size={15} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="quick-actions">
          <strong>Quick log</strong>
          <button type="button" onClick={() => setActiveView('meds')}><Plus size={13} /><span>Injection</span></button>
          <button type="button" onClick={() => setActiveView('vitals')}><Plus size={13} /><span>Blood pressure</span></button>
          <button type="button" onClick={() => setActiveView('symptoms')}><Plus size={13} /><span>Symptoms</span></button>
          <button type="button" onClick={() => setActiveView('files')}><Plus size={13} /><span>Upload PDF</span></button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyeline">Personal health record</p>
            <h1>{titleFor(activeView)}</h1>
          </div>
          <div className="topbar-actions">
            <span className="privacy-pill"><Lock size={12} /> Local only</span>
          </div>
        </header>

        {activeView === 'overview' && (
          <Overview
            compounds={compounds}
            injections={injections}
            vitals={vitals}
            exams={exams}
            results={enrichedResults}
            onNavigate={setActiveView}
          />
        )}
        {activeView === 'meds' && <Protocols compounds={compounds} injections={injections} />}
        {activeView === 'vitals' && <Vitals vitals={vitals} />}
        {activeView === 'labs' && (
          <Labs compounds={compounds} injections={injections} vitals={vitals} exams={exams} results={enrichedResults} files={files} />
        )}
        {activeView === 'symptoms' && <Symptoms />}
        {activeView === 'targets' && <Targets />}
        {activeView === 'timeline' && (
          <Timeline compounds={compounds} injections={injections} vitals={vitals} exams={exams} files={files} />
        )}
        {activeView === 'files' && <Files files={files} />}
        {activeView === 'settings' && <Settings />}
      </main>

      <nav className="mobile-tabs" aria-label="Mobile primary">
        {NAV.slice(0, 5).map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeView === item.id ? 'mobile-tab active' : 'mobile-tab'}
            onClick={() => setActiveView(item.id)}
          >
            <item.icon size={17} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function titleFor(view: View) {
  const map: Record<View, string> = {
    overview: 'Overview',
    meds: 'Protocols',
    vitals: 'Vitals',
    labs: 'Labs',
    symptoms: 'Symptoms',
    targets: 'Targets',
    timeline: 'Timeline',
    files: 'Files',
    settings: 'Settings',
  }
  return map[view]
}

// suppress unused import warning if parseISO becomes unused after refactor
void parseISO

export default App
