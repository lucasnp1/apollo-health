import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  Brain,
  CalendarClock,
  FlaskConical,
  HeartPulse,
  Home,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Calculator,
  Menu,
  Settings as SettingsIcon,
  Share2,
  Syringe,
  Upload,
  X,
} from 'lucide-react'
import { BrandMark } from './components/BrandMark'
import type { LucideIcon } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, seedIfEmpty } from './lib/db'
import { extractPdfText, extractMarkersFromText, type ExtractedMarker } from './lib/pdf'
import { ToastProvider, useToast } from './lib/toast'
import { useAuth } from './lib/useAuth'
import { useSync } from './lib/useSync'
import { useInjectionReminders } from './lib/useInjectionReminders'
import { InstallPrompt } from './components/InstallPrompt'
// Modals are lazy — only loaded when first opened
const QuickLog       = lazy(() => import('./components/QuickLog').then(m => ({ default: m.QuickLog })))
const ProtocolWizard = lazy(() => import('./components/ProtocolWizard').then(m => ({ default: m.ProtocolWizard })))
const ExportSheet      = lazy(() => import('./components/ExportSheet').then(m => ({ default: m.ExportSheet })))
const DoseCalculator   = lazy(() => import('./components/DoseCalculator').then(m => ({ default: m.DoseCalculator })))
const PdfReviewSheet   = lazy(() => import('./components/PdfReviewSheet').then(m => ({ default: m.PdfReviewSheet })))
import { SyncBanner } from './components/SyncBanner'
import { SignIn } from './views/SignIn'
import type { View } from './app/views'
// Overview is eager (first screen) — everything else is lazy
import { Overview } from './views/Overview'
const Protocols = lazy(() => import('./views/Protocols').then(m => ({ default: m.Protocols })))
const Vitals    = lazy(() => import('./views/Vitals').then(m => ({ default: m.Vitals })))
const Labs      = lazy(() => import('./views/Labs').then(m => ({ default: m.Labs })))
const Targets   = lazy(() => import('./views/Targets').then(m => ({ default: m.Targets })))
const Timeline  = lazy(() => import('./views/Timeline').then(m => ({ default: m.Timeline })))
const Symptoms  = lazy(() => import('./views/Symptoms').then(m => ({ default: m.Symptoms })))
const Settings  = lazy(() => import('./views/Settings').then(m => ({ default: m.Settings })))
import './index.css'

const NAV: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'meds', label: 'Protocols', icon: Syringe },
  { id: 'vitals', label: 'Vitals', icon: HeartPulse },
  { id: 'labs', label: 'Labs', icon: FlaskConical },
  { id: 'symptoms', label: 'Symptoms', icon: Brain },
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
    return (
      <ToastProvider>
        <SignIn auth={auth} />
      </ToastProvider>
    )
  }

  // 'local' = user explicitly chose local-only mode — show full app, no sync
  // 'authed' = signed in — show full app with sync

  return (
    <ToastProvider>
      <Shell
        activeView={activeView}
        setActiveView={setActiveView}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        auth={auth}
      />
    </ToastProvider>
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
  // local-only users see no sync UI, but the same Shell
  const sync = useSync(isAuthed)

  const [qlOpen, setQlOpen] = useState(false)
  const [qlTab, setQlTab] = useState<QuickLogTab>('injection')
  const [qlPrefill, setQlPrefill] = useState<QuickLogPrefill | undefined>(undefined)
  const [labAddOpen, setLabAddOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [calcOpen,   setCalcOpen]   = useState(false)
  const [menuOpen,   setMenuOpen]   = useState(false)
  const [protocolWizardOpen, setProtocolWizardOpen] = useState(false)
  // PDF upload pipeline state — parsing overlay + review sheet. Transient
  // messages now route through the shared toast context (snackbar UI lives
  // in ToastProvider so any view can fire one without prop drilling).
  const [pdfParsingName, setPdfParsingName] = useState<string | null>(null)
  const [pdfReviewFileId, setPdfReviewFileId] = useState<number | null>(null)
  const { showToast } = useToast()

  async function handleLabPdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPdfParsingName(file.name)
    try {
      const extractedText = await extractPdfText(file)
      const markers = extractedText ? extractMarkersFromText(extractedText) : []
      const id = await db.files.add({
        name: file.name,
        type: file.type || 'application/pdf',
        size: file.size,
        addedAt: new Date().toISOString(),
        status: markers.length > 0 ? 'Needs review' : 'Stored',
        extractedText,
        blob: file,
      })
      setActiveView('labs')
      if (markers.length > 0) {
        setPdfReviewFileId(id as number)
      } else if (extractedText) {
        showToast({
          tone: 'warn',
          message: `Stored "${file.name}" but no recognized lab markers were found. You can add results manually under Add result.`,
        })
      } else {
        showToast({
          tone: 'warn',
          message: `Couldn't read text from "${file.name}" — it may be a scanned image. Add the results manually under Add result.`,
        })
      }
    } catch (err) {
      console.error('PDF upload failed', err)
      showToast({
        tone: 'error',
        message: `Couldn't read "${file.name}". Try a different PDF or add results manually.`,
      })
    } finally {
      setPdfParsingName(null)
    }
  }

  const pdfReviewFile = useLiveQuery(
    async () => (pdfReviewFileId == null ? null : (await db.files.get(pdfReviewFileId)) ?? null),
    [pdfReviewFileId],
    null,
  )

  async function commitPdfImport(items: ExtractedMarker[]) {
    if (!pdfReviewFile?.id || items.length === 0) return
    const examId = await db.exams.add({
      name: pdfReviewFile.name.replace(/\.pdf$/i, ''),
      collectedAt: new Date().toISOString(),
      labName: 'PDF import',
      sourceFileId: pdfReviewFile.id,
    })
    await db.results.bulkAdd(items.map((item) => ({
      examId,
      marker: item.marker,
      value: item.value,
      rawValue: String(item.value),
      unit: item.unit,
      // Persist the reference range from the PDF so the Labs view can
      // show HIGH/LOW status. Without these the row falls through to
      // "no range known" and stops contributing OK / out-of-range counts.
      low: item.low,
      high: item.high,
    })))
    await db.files.update(pdfReviewFile.id, { status: 'Reviewed' })
    showToast({
      message: `Imported ${items.length} marker${items.length === 1 ? '' : 's'} from ${pdfReviewFile.name}.`,
    })
  }

  const [editingProtocol, setEditingProtocol] = useState<(import('./lib/db').Protocol & { id: number }) | undefined>(undefined)

  function openQuickLog(tab: QuickLogTab, prefill?: QuickLogPrefill) {
    setQlTab(tab)
    setQlPrefill(prefill)
    setQlOpen(true)
  }

  const compounds = useLiveQuery(
    () => db.compounds.filter(c => !c.archived).toArray(),
    [], [],
  )
  const injections = useLiveQuery(
    async () => {
      // Fetch only the most recent 500 injections — enough for all UI needs
      const all = await db.injections
        .orderBy('takenAt').reverse()
        .filter(i => !i.deletedAtSync)
        .limit(500)
        .toArray()
      // Deduplicate sync phantoms: same compound + dose + minute bucket
      const seen = new Set<string>()
      return all
        .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
        .filter((i) => {
          const bucket = Math.floor(Date.parse(i.takenAt) / 60_000)
          const key = `${i.compoundId}|${i.dose ?? ''}|${bucket}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
    },
    [], [],
  )
  // Vitals: cap at 200 — charts only show last 50, stats use last 14
  const vitals = useLiveQuery(
    () => db.vitals.orderBy('measuredAt').reverse().limit(200).toArray(),
    [], [],
  )
  const exams = useLiveQuery(
    () => db.exams.orderBy('collectedAt').reverse().toArray(),
    [], [],
  )
  // Duplicate detection: if an exam with the same source filename already
  // exists, warn the user in the review sheet so they can decide whether
  // to import. Depends on `exams` so it's declared after that live query.
  const pdfDuplicateWarning = useMemo(() => {
    if (!pdfReviewFile) return undefined
    const base = pdfReviewFile.name.replace(/\.pdf$/i, '').toLowerCase()
    const match = exams.find(
      (e) => e.name.toLowerCase() === base && e.sourceFileId !== pdfReviewFile.id,
    )
    return match
      ? `You already imported a PDF named "${pdfReviewFile.name}" on ${new Date(match.collectedAt).toLocaleDateString()}. Importing again will create a duplicate exam.`
      : undefined
  }, [pdfReviewFile, exams])
  const results = useLiveQuery(
    () => db.results.toArray(),
    [], [],
  )
  const protocols = useLiveQuery(
    () => db.protocols.toArray(),
    [], [],
  )
  const protocolDoses = useLiveQuery(
    () => db.protocolDoses.toArray(),
    [], [],
  )

  // Injection reminders — fires notifications before upcoming doses
  useInjectionReminders(protocols, protocolDoses, compounds ?? [])
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
            <BrandMark size={32} />
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
          {/* Hamburger sits as a direct topbar flex-child so it aligns with the gear on the right */}
          <button
            type="button"
            className="icon-button show-mobile-only"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="eyeline">Personal health record</p>
            <h1>{titleFor(activeView)}</h1>
          </div>
          <div className="topbar-actions">
            {/* Dose calculator — Protocols page only */}
            {activeView === 'meds' && (
              <button type="button" className="icon-button" onClick={() => setCalcOpen(true)} aria-label="Dose calculator" title="Dose calculator">
                <Calculator size={15} />
              </button>
            )}
            {/* Share/export — shown on data-rich views */}
            {(activeView === 'meds' || activeView === 'labs' || activeView === 'vitals') && (
              <button type="button" className="icon-button" onClick={() => setExportOpen(true)} aria-label="Export for doctor" title="Share with doctor">
                <Share2 size={15} />
              </button>
            )}

            {/* Labs actions — Upload PDF + Add result (icon-only on mobile) */}
            {activeView === 'labs' && (<>
              <label className="ghost-button topbar-labelled" style={{ cursor: 'pointer' }} title="Upload PDF">
                <input type="file" accept="application/pdf" hidden onChange={handleLabPdfUpload} />
                <Upload size={14} /> <span className="btn-label">Upload</span>
              </label>
              <button type="button" className="primary-button topbar-labelled" onClick={() => setLabAddOpen(true)} title="Add result">
                <Plus size={14} /> <span className="btn-label">Add result</span>
              </button>
            </>)}

            {/* Create protocol — Protocols page */}
            {activeView === 'meds' && (
              <button type="button" className="primary-button topbar-labelled" onClick={() => setProtocolWizardOpen(true)} title="Create protocol">
                <Plus size={14} /> <span className="btn-label">New protocol</span>
              </button>
            )}

            {/* Generic quick-log Add — skipped on Labs, Meds, Settings */}
            {activeView !== 'labs' && activeView !== 'meds' && activeView !== 'settings' && (
              <button
                type="button"
                className="primary-button topbar-labelled"
                onClick={() => openQuickLog(activeView === 'vitals' ? 'bp' : 'injection')}
                title={activeView === 'vitals' ? 'Log reading' : 'Add'}
              >
                <Plus size={14} /> <span className="btn-label">{activeView === 'vitals' ? 'Log reading' : 'Add'}</span>
              </button>
            )}
            {/* Settings is accessible via the hamburger menu — no duplicate icon needed */}
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
            onOpenWizard={() => setProtocolWizardOpen(true)}
          />
        )}
        <Suspense fallback={<div className="view-loading" />}>
          {activeView === 'meds' && <Protocols compounds={compounds} injections={injections} onOpenQuickLog={openQuickLog} onOpenWizard={() => setProtocolWizardOpen(true)} onEditProtocol={(p) => { setEditingProtocol(p); setProtocolWizardOpen(true) }} />}
          {activeView === 'vitals' && <Vitals vitals={vitals} />}
          {activeView === 'labs' && (
            <Labs compounds={compounds} injections={injections} vitals={vitals} exams={exams} results={enrichedResults} files={files} addOpen={labAddOpen} onAddClose={() => setLabAddOpen(false)} onReviewFile={(id) => setPdfReviewFileId(id)} />
          )}
          {activeView === 'symptoms' && <Symptoms />}
          {activeView === 'targets' && <Targets />}
          {activeView === 'timeline' && (
            <Timeline compounds={compounds} injections={injections} vitals={vitals} exams={exams} files={files} />
          )}
          {activeView === 'settings' && (
            <Settings
              auth={auth}
              compounds={compounds}
              injections={injections}
              vitals={vitals}
              exams={exams}
              protocols={protocols}
            />
          )}
        </Suspense>
      </main>

      {/* Mobile hamburger drawer — replaces bottom tabs */}
      {menuOpen && (
        <div
          className="mobile-drawer-overlay"
          onClick={() => setMenuOpen(false)}
        >
          <nav
            className="mobile-drawer"
            onClick={e => e.stopPropagation()}
            aria-label="Mobile navigation"
          >
            {/* Drawer header */}
            <div className="mobile-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BrandMark size={26} />
                <strong style={{ fontSize: 15 }}>Apollo Health</strong>
              </div>
              <button type="button" className="icon-button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <X size={16} />
              </button>
            </div>
            {/* Nav items — all pages */}
            <div className="mobile-drawer-nav">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={activeView === item.id ? 'mobile-drawer-item active' : 'mobile-drawer-item'}
                  onClick={() => { setActiveView(item.id); setMenuOpen(false) }}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
            {/* Quick actions at bottom of drawer */}
            <div className="mobile-drawer-footer">
              <button type="button" className="primary-button" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { openQuickLog('injection'); setMenuOpen(false) }}>
                <Plus size={14} /> Log injection
              </button>
            </div>
          </nav>
        </div>
      )}

      <QuickLog
        open={qlOpen}
        initialTab={qlTab}
        prefill={qlPrefill}
        compounds={compounds ?? []}
        onClose={() => { setQlOpen(false); setQlPrefill(undefined) }}
      />

      <ProtocolWizard
        open={protocolWizardOpen}
        onClose={() => { setProtocolWizardOpen(false); setEditingProtocol(undefined) }}
        compounds={compounds ?? []}
        editProtocol={editingProtocol}
      />

      <InstallPrompt />

      <Suspense fallback={null}>
        {calcOpen && <DoseCalculator onClose={() => setCalcOpen(false)} />}
        {exportOpen && (
          <ExportSheet
            compounds={compounds ?? []}
            injections={injections ?? []}
            vitals={vitals ?? []}
            exams={exams ?? []}
            results={enrichedResults ?? []}
            onClose={() => setExportOpen(false)}
          />
        )}
        {pdfReviewFile && (
          <PdfReviewSheet
            file={pdfReviewFile}
            duplicateWarning={pdfDuplicateWarning}
            onImport={commitPdfImport}
            onClose={() => setPdfReviewFileId(null)}
          />
        )}
      </Suspense>

      {pdfParsingName && (
        <div className="pdf-parse-overlay" role="status" aria-live="polite">
          <div className="pdf-parse-card">
            <div className="pdf-parse-spinner" aria-hidden="true" />
            <div className="pdf-parse-card-text">
              <strong>Reading PDF…</strong>
              <span>{pdfParsingName}</span>
            </div>
          </div>
        </div>
      )}

      {/* Snackbar UI lives in <ToastProvider> — see src/lib/toast.tsx */}
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
