import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CalendarClock,
  FlaskConical,
  HeartPulse,
  Home,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings as SettingsIcon,
  Syringe,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, seedIfEmpty } from './lib/db'
import { useAuth } from './lib/useAuth'
import { useSync } from './lib/useSync'
import { InstallPrompt } from './components/InstallPrompt'
import { QuickLog } from './components/QuickLog'
import { ProtocolWizard } from './components/ProtocolWizard'
import { SyncBanner } from './components/SyncBanner'
import { SignIn } from './views/SignIn'
import type { View } from './app/views'
import { Overview } from './views/Overview'
import { Protocols } from './views/Protocols'
import { Vitals } from './views/Vitals'
import { Labs } from './views/Labs'
import { Targets } from './views/Targets'
import { Timeline } from './views/Timeline'
import { Settings } from './views/Settings'
import './index.css'

const NAV: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'meds', label: 'Protocols', icon: Syringe },
  { id: 'vitals', label: 'Vitals', icon: HeartPulse },
  { id: 'labs', label: 'Labs', icon: FlaskConical },
  { id: 'timeline', label: 'Timeline', icon: CalendarClock },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

type QuickLogTab = 'injection' | 'bp'

export type QuickLogPrefill = {
  compoundId?: number
  dose?: number
  unit?: string
  protocolId?: number
  scheduledAt?: string
}

function App() {
  const [activeView, setActiveView] = useState<View>('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const auth = useAuth()

  useEffect(() => {
    if (auth.state.status !== 'loading') {
      void seedIfEmpty()
    }
  }, [auth.state.status])

  if (auth.state.status === 'loading') {
    return (
      <div className="lock-shell">
        <div className="lock-panel"><p className="lock-copy">Loading…</p></div>
      </div>
    )
  }

  if (auth.state.status === 'guest') {
    return <SignIn auth={auth} />
  }

  return (
    <Shell
      activeView={activeView}
      setActiveView={setActiveView}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
      auth={auth}
    />
  )
}

type AuthBundle = ReturnType<typeof useAuth>

function Shell({
  activeView,
  setActiveView,
  sidebarCollapsed,
  setSidebarCollapsed,
  auth,
}: {
  activeView: View
  setActiveView: (v: View) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (fn: (prev: boolean) => boolean) => void
  auth: AuthBundle
}) {
  const isAuthed = auth.state.status === 'authed'
  const sync = useSync(isAuthed)

  const [qlOpen, setQlOpen] = useState(false)
  const [qlTab, setQlTab] = useState<QuickLogTab>('injection')
  const [qlPrefill, setQlPrefill] = useState<QuickLogPrefill | undefined>(undefined)
  const [labAddOpen, setLabAddOpen] = useState(false)
  const [protocolWizardOpen, setProtocolWizardOpen] = useState(false)

  function openQuickLog(tab: QuickLogTab, prefill?: QuickLogPrefill) {
    setQlTab(tab)
    setQlPrefill(prefill)
    setQlOpen(true)
  }

  const compounds = useLiveQuery(async () => (await db.compounds.toArray()).filter((c) => !c.archived), [], [])
  const injections = useLiveQuery(
    async () => {
      const all = (await db.injections.orderBy('takenAt').reverse().toArray()).filter((i) => !i.deletedAtSync)
      // Deduplicate phantom sync duplicates: same compound + same dose + same minute bucket.
      // Sync can create copies with slightly different sub-second timestamps (all show "01:00"
      // in the UI). Keeping the one with the lowest Dexie id (oldest write).
      const seen = new Set<string>()
      return all
        .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))   // lowest id first so we keep the original
        .filter((i) => {
          const minuteBucket = Math.floor(Date.parse(i.takenAt) / 60_000)
          const key = `${i.compoundId}|${i.dose ?? ''}|${minuteBucket}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .sort((a, b) => b.takenAt.localeCompare(a.takenAt))   // restore newest-first order
    },
    [], [],
  )
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
              <span>Health</span>
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
          <button type="button" onClick={() => openQuickLog('injection')}>
            <Plus size={13} /><span>Injection</span>
          </button>
          <button type="button" onClick={() => openQuickLog('bp')}>
            <Plus size={13} /><span>Blood pressure</span>
          </button>
        </div>

        <div className="sidebar-footer">
          <SyncBanner syncing={sync.state === 'syncing'} />
          {isAuthed ? (
            <span className="sidebar-sync-pill" title={sync.lastError || ''}>
              <span className={`sidebar-sync-dot ${sync.state === 'error' ? 'error' : 'ok'}`} />
              <span className="sidebar-sync-label">
                {sync.state === 'error' ? 'Sync error' : 'Synced'}
                {sync.lastRunAt && sync.state === 'idle'
                  ? ` · ${new Date(sync.lastRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : ''}
              </span>
            </span>
          ) : (
            <span className="sidebar-sync-pill">
              <Lock size={11} />
              <span className="sidebar-sync-label">Local only</span>
            </span>
          )}
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyeline">Personal health record</p>
            <h1>{titleFor(activeView)}</h1>
          </div>
          <div className="topbar-actions">
            {activeView === 'labs' && (
              <button type="button" className="ghost-button" onClick={() => setLabAddOpen(true)}>
                <Plus size={12} /> Add result
              </button>
            )}
            {/* "Create protocol" hidden on mobile — accessible from the empty-state button */}
            {activeView === 'meds' && (
              <button type="button" className="primary-button hide-mobile" onClick={() => setProtocolWizardOpen(true)}>
                <Plus size={13} /> Create protocol
              </button>
            )}
            <button type="button" className="primary-button" onClick={() => openQuickLog('injection')}>
              <Plus size={13} /> Add
            </button>
            {/* Settings gear — mobile only, since Settings tab is #6 and hidden in bottom nav */}
            {activeView !== 'settings' && (
              <button
                type="button"
                className="icon-button show-mobile-only"
                onClick={() => setActiveView('settings')}
                aria-label="Settings"
                style={{ color: 'var(--ink-mute)' }}
              >
                <SettingsIcon size={16} />
              </button>
            )}
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
            onOpenQuickLog={openQuickLog}
          />
        )}
        {activeView === 'meds' && <Protocols compounds={compounds} injections={injections} onOpenQuickLog={openQuickLog} onOpenWizard={() => setProtocolWizardOpen(true)} />}
        {activeView === 'vitals' && <Vitals vitals={vitals} />}
        {activeView === 'labs' && (
          <Labs compounds={compounds} injections={injections} vitals={vitals} exams={exams} results={enrichedResults} files={files} addOpen={labAddOpen} onAddClose={() => setLabAddOpen(false)} />
        )}
        {/* symptoms + targets: no nav page, code kept */}
        {activeView === 'targets' && <Targets />}
        {activeView === 'timeline' && (
          <Timeline compounds={compounds} injections={injections} vitals={vitals} exams={exams} files={files} />
        )}
        {activeView === 'settings' && <Settings auth={auth} />}
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

      <QuickLog
        open={qlOpen}
        initialTab={qlTab}
        prefill={qlPrefill}
        compounds={compounds ?? []}
        onClose={() => { setQlOpen(false); setQlPrefill(undefined) }}
      />

      <ProtocolWizard
        open={protocolWizardOpen}
        onClose={() => setProtocolWizardOpen(false)}
        compounds={compounds ?? []}
      />

      <InstallPrompt />
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

export default App
