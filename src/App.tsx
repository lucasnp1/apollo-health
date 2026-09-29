import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Lock,
  Moon,
  Plus,
  Sun,
} from 'lucide-react'
import { BrandMark } from './components/BrandMark'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, seedIfEmpty } from './lib/db'
import type { ExtractedMarker, ReadProgress } from './lib/pdf'
import { takePendingRead, type PendingRead } from './lib/pendingRead'
import { ToastProvider, useToast } from './lib/toast'
import { useAuth } from './lib/useAuth'
import { useSync } from './lib/useSync'
import { colorFixes } from './lib/compounds'
import { dedupeInjections } from './lib/injections'
import { useTheme } from './lib/useTheme'
import { InstallPrompt } from './components/InstallPrompt'
import { Onboarding, ONBOARDED_KEY } from './components/Onboarding'
import { UpgradeDialog } from './components/UpgradeDialog'
import { PlanProvider, usePlan } from './lib/plan'
// Modals / add-pages are lazy — only loaded when first opened
const ExportPage       = lazy(() => import('./components/ExportSheet').then(m => ({ default: m.ExportPage })))
const PdfReviewSheet   = lazy(() => import('./components/PdfReviewSheet').then(m => ({ default: m.PdfReviewSheet })))
const ResetPassword    = lazy(() => import('./views/ResetPassword').then(m => ({ default: m.ResetPassword })))
const AddResultsSheet  = lazy(() => import('./components/AddResultsSheet').then(m => ({ default: m.AddResultsSheet })))
const ManualResultDialog = lazy(() => import('./components/ManualResultDialog').then(m => ({ default: m.ManualResultDialog })))
const RecoveryCodesScreen = lazy(() => import('./components/RecoveryCodes').then(m => ({ default: m.RecoveryCodesScreen })))
import { SignIn } from './views/SignIn'
import type { View } from './app/views'
// Overview (the launcher) is eager — everything else is lazy
import { Overview } from './views/Overview'
// AddWeight / AddBP are eager (not lazy): mounting them synchronously inside the
// launcher tap keeps the focus() in the same gesture, so mobile raises the
// keyboard on open. They're tiny, so the bundle cost is negligible.
import { AddWeight } from './views/AddWeight'
import { AddBP } from './views/AddBP'
const AddInjection = lazy(() => import('./views/AddInjection').then(m => ({ default: m.AddInjection })))
const Labs      = lazy(() => import('./views/Labs').then(m => ({ default: m.Labs })))
const Timeline  = lazy(() => import('./views/Timeline').then(m => ({ default: m.Timeline })))
const Files     = lazy(() => import('./views/Files').then(m => ({ default: m.Files })))
const Archive   = lazy(() => import('./views/Archive').then(m => ({ default: m.Archive })))
const Settings  = lazy(() => import('./views/Settings').then(m => ({ default: m.Settings })))
import './index.css'

function App() {
  const [activeView, setActiveView] = useState<View>('overview')
  const auth = useAuth()
  // First-run onboarding is tracked per ACCOUNT (user.onboarded), with a local
  // flag as an offline fallback. `dismissed` hides it for the current session
  // the moment it's finished, before the account refresh lands.
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)
  // Upgrade paywall — opened by any gated Pro feature.
  const [upgrade, setUpgrade] = useState<{ open: boolean; feature?: string }>({ open: false })
  const openUpgrade = useCallback((feature?: string) => setUpgrade({ open: true, feature }), [])
  // The emailed reset link lands on /reset?token=... It is handled before the
  // auth gate so it works whether or not a session exists on this device.
  const resetToken = useMemo(() => {
    if (!/^\/app\/reset\/?$/.test(window.location.pathname)) return null
    return new URLSearchParams(window.location.search).get('token')
  }, [])
  const [resetDone, setResetDone] = useState(false)

  useEffect(() => {
    if (auth.state.status !== 'loading') {
      void seedIfEmpty()
    }
  }, [auth.state.status])

  // A bare /app/reset (no token) is just the app.
  useEffect(() => {
    if (/^\/app\/reset\/?$/.test(window.location.pathname) && !resetToken) window.history.replaceState({}, '', '/app/')
  }, [resetToken])

  if (resetToken && !resetDone) {
    return (
      <ToastProvider>
        <Suspense fallback={null}>
          <ResetPassword
            auth={auth}
            token={resetToken}
            onDone={() => {
              window.history.replaceState({}, '', '/app/')
              setResetDone(true)
            }}
          />
        </Suspense>
      </ToastProvider>
    )
  }

  if (auth.state.status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
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

  // Only 'authed' reaches Shell now — an account is required, so every user's
  // data syncs to the server (local-first, but always backed up).

  const authedUser = auth.state.status === 'authed' ? auth.state.user : null

  // Right after sign-up: the one-time "save your recovery codes" step.
  if (auth.recoveryCodes) {
    return (
      <ToastProvider>
        <Suspense fallback={null}>
          <RecoveryCodesScreen codes={auth.recoveryCodes} email={authedUser?.email} onDone={auth.clearRecoveryCodes} />
        </Suspense>
      </ToastProvider>
    )
  }
  let localOnboarded = false
  try { localOnboarded = localStorage.getItem(ONBOARDED_KEY) === '1' } catch { /* ignore */ }
  const showOnboarding = !onboardingDismissed && authedUser != null && !authedUser.onboarded && !localOnboarded

  return (
    <ToastProvider>
      <PlanProvider value={{ isPro: auth.isPro, openUpgrade }}>
        <Shell
          activeView={activeView}
          setActiveView={setActiveView}
          auth={auth}
        />
      </PlanProvider>
      <UpgradeDialog open={upgrade.open} feature={upgrade.feature} onClose={() => setUpgrade({ open: false })} />
      {showOnboarding && <Onboarding onDone={() => setOnboardingDismissed(true)} />}
    </ToastProvider>
  )
}

type AuthBundle = ReturnType<typeof useAuth>

function Shell({
  activeView,
  setActiveView,
  auth,
}: {
  activeView: View
  setActiveView: (v: View) => void
  auth: AuthBundle
}) {
  const isAuthed = auth.state.status === 'authed'
  const sync = useSync(isAuthed)
  const { isPro, openUpgrade } = usePlan()
  const { theme, toggle: toggleTheme } = useTheme()

  // Ask the browser to keep our IndexedDB from being evicted under storage
  // pressure (matters most on iOS). Best-effort, prompts on no supported browser.
  useEffect(() => { void navigator.storage?.persist?.() }, [])

  // Bloods: the Add results sheet, the typed-in result dialog, and the one
  // hidden file input every import goes through.
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const labFileInput = useRef<HTMLInputElement>(null)
  const startLabImport = () => {
    setAddSheetOpen(false)
    if (isPro) labFileInput.current?.click()
    else openUpgrade('Lab PDF import')
  }
  const startManual = () => {
    setAddSheetOpen(false)
    setManualOpen(true)
  }
  // Bloods keeps its screen in the URL hash; leaving the view drops it.
  useEffect(() => {
    if (activeView !== 'labs' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [activeView])
  // Back onto a Bloods entry (left in history by pushed Bloods screens) returns
  // to Bloods on that screen. Never clear the hash here: Timeline's deep link
  // sets it before React commits 'labs', and clearing would wipe it.
  useEffect(() => {
    if (activeView === 'labs') return
    const onPop = () => { if (window.location.hash) setActiveView('labs') }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [activeView, setActiveView])
  // PDF upload pipeline state — parsing overlay + review sheet. Transient
  // messages now route through the shared toast context (snackbar UI lives
  // in ToastProvider so any view can fire one without prop drilling).
  const [pdfParsingName, setPdfParsingName] = useState<string | null>(null)
  const [pdfProgress, setPdfProgress] = useState<ReadProgress | null>(null)
  const [pdfReviewFileId, setPdfReviewFileId] = useState<number | null>(null)
  const { showToast } = useToast()

  // Someone who used the public /read tool and then signed up arrives with
  // their parsed panel already in hand. Import it instead of asking for the
  // same file a second time. Runs once, after auth, and clears itself.
  useEffect(() => {
    const pending = takePendingRead()
    if (!pending) return
    void (async () => {
      try {
        const examId = await db.exams.add({
          name: pending.exam.name,
          collectedAt: pending.exam.collectedAt,
          labName: pending.exam.labName,
        })
        await db.results.bulkAdd(pending.results.map((r: PendingRead['results'][number]) => ({ ...r, examId })))
        showToast({
          message: `Saved your read: ${pending.results.length} marker${pending.results.length === 1 ? '' : 's'} from ${pending.exam.name}.`,
        })
      } catch {
        showToast({ message: 'Could not save that read. Upload the file again from Bloods.' })
      }
    })()
  }, [showToast])

  // Returning from Stripe checkout: refresh the plan (webhook may lag a beat)
  // and strip the query flag from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('upgraded') === '1') {
      void auth.refresh()
      const t = setTimeout(() => void auth.refresh(), 4000)
      showToast({ message: 'Thanks for upgrading to Pro. Unlocking your features.' })
      window.history.replaceState({}, '', window.location.pathname)
      return () => clearTimeout(t)
    }
    if (params.get('upgrade_cancelled') === '1') {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [auth.refresh, showToast])

  async function handleLabPdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPdfParsingName(file.name)
    setPdfProgress(null)
    try {
      // The reader (pdf.js, parser catalog, OCR) stays out of the main bundle.
      const { readLabFile, extractMarkersFromText } = await import('./lib/pdf')
      const { text: extractedText, usedOcr } = await readLabFile(file, setPdfProgress)
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
          message: usedOcr
            ? `Read "${file.name}" with OCR but couldn't find any lab markers. Try a sharper photo, or type the results in under Add results.`
            : `Stored "${file.name}" but no recognized lab markers were found. You can type the results in under Add results.`,
        })
      } else {
        showToast({
          tone: 'warn',
          message: `Couldn't read any text in "${file.name}". Try a clearer scan or photo, or type the results in under Add results.`,
        })
      }
    } catch (err) {
      console.error('Lab file upload failed', err)
      showToast({
        tone: 'error',
        message: `Couldn't read "${file.name}". Try a different file or add results manually.`,
      })
    } finally {
      setPdfParsingName(null)
      setPdfProgress(null)
    }
  }

  const pdfReviewFile = useLiveQuery(
    async () => (pdfReviewFileId == null ? null : (await db.files.get(pdfReviewFileId)) ?? null),
    [pdfReviewFileId],
    null,
  )

  async function commitPdfImport(items: ExtractedMarker[], collectedAt: string) {
    if (!pdfReviewFile?.id || items.length === 0) return
    const examId = await db.exams.add({
      name: pdfReviewFile.name.replace(/\.(pdf|jpe?g|png|webp|heic|gif|bmp|tiff?)$/i, ''),
      collectedAt,
      labName: pdfReviewFile.type.startsWith('image/') ? 'Photo import' : 'PDF import',
      sourceFileId: pdfReviewFile.id,
    })
    await db.results.bulkAdd(items.map((item) => ({
      examId,
      marker: item.marker,
      value: item.value,
      rawValue: item.rawValue ?? String(item.value),
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

  const compounds = useLiveQuery(
    () => db.compounds.filter(c => !c.archived).toArray(),
    [], [],
  )
  const injections = useLiveQuery(
    async () => {
      // Fetch only the most recent 500 injections — enough for all UI needs
      const all = await db.injections
        .orderBy('takenAt').reverse()
        .filter(i => !i.deletedAtSync && !i.archivedAt)
        .limit(500)
        .toArray()
      return dedupeInjections(all)
    },
    [], [],
  )
  // Give every compound a colour of its own on the charts. Runs after a full
  // sync (so a fresh device has the injections that decide which compound
  // keeps its colour) and only when the compound list actually changed.
  const colorsChecked = useRef('')
  useEffect(() => {
    if (!sync.lastRunAt || !compounds.length) return
    const sig = compounds.map((c) => `${c.id}:${c.color}`).join()
    if (sig === colorsChecked.current) return
    colorsChecked.current = sig
    void (async () => {
      const [all, shots] = await Promise.all([
        db.compounds.filter((c) => !c.archived && !c.deletedAtSync).toArray(),
        db.injections.filter((i) => !i.deletedAtSync && !i.archivedAt).toArray(),
      ])
      for (const f of colorFixes(all, shots)) {
        for (const id of f.ids) await db.compounds.update(id, { color: f.color })
      }
    })()
  }, [sync.lastRunAt, compounds])
  // Vitals: cap at 200 — charts only show last 50, stats use last 14
  const vitals = useLiveQuery(
    () => db.vitals.orderBy('measuredAt').reverse().filter((v) => !v.archivedAt).limit(200).toArray(),
    [], [],
  )
  const exams = useLiveQuery(
    () => db.exams.orderBy('collectedAt').reverse().filter((e) => !e.deletedAtSync && !e.archivedAt).toArray(),
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
      ? `You already imported a PDF named "${pdfReviewFile.name}" on ${new Date(match.collectedAt).toLocaleDateString()}. Importing again will create a duplicate panel.`
      : undefined
  }, [pdfReviewFile, exams])
  const results = useLiveQuery(
    () => db.results.filter((r) => !r.deletedAtSync && !r.archivedAt).toArray(),
    [], [],
  )
  // Kept for Settings export; protocol scheduling UI was removed.
  const protocols = useLiveQuery(
    () => db.protocols.toArray(),
    [], [],
  )
  const bodyMetrics = useLiveQuery(() => db.bodyMetrics.orderBy('measuredAt').reverse().filter((b) => !b.archivedAt).limit(200).toArray(), [], [])
  const symptoms = useLiveQuery(() => db.symptoms.orderBy('recordedAt').reverse().filter((s) => !s.archivedAt).limit(200).toArray(), [], [])
  const files = useLiveQuery(() => db.files.orderBy('addedAt').reverse().filter((f) => !f.deletedAtSync && !f.archivedAt).toArray(), [], [])

  const examMap = useMemo(() => new Map(exams.map((e) => [e.id, e])), [exams])
  const enrichedResults = useMemo(
    () => results.map((r) => ({ ...r, exam: examMap.get(r.examId) })),
    [results, examMap],
  )

  return (
    <div className="min-h-dvh bg-background">
      {/* ── Main panel (no sidebar — navigation lives on the Home launcher) ── */}
      <main className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
          {/* Brand — always far-left, doubles as the Home button */}
          <button
            type="button"
            onClick={() => setActiveView('overview')}
            className="-mx-1 flex shrink-0 items-center gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Magno, go to Home"
          >
            <BrandMark size={30} />
            <span className="font-display text-[17px] font-semibold leading-none tracking-[-0.02em]">
              Magno
            </span>
          </button>
          {activeView !== 'overview' && (
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="text-border">/</span>
              <span className="truncate">{titleFor(activeView)}</span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {/* Sync / local-only status — moved here from the deleted sidebar */}
            {activeView === 'overview' && (
              isAuthed ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={sync.lastError || ''}>
                  <span className={cn('size-1.5 rounded-full', sync.state === 'error' ? 'bg-destructive' : sync.state === 'syncing' ? 'bg-amber-500' : 'bg-emerald-500')} />
                  <span className="hidden sm:inline">{sync.state === 'syncing' ? 'Syncing…' : sync.state === 'error' ? 'Sync error' : 'Synced'}</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3" /> <span className="hidden sm:inline">Local only</span>
                </span>
              )
            )}
            {activeView === 'labs' && (
              <Button onClick={() => setAddSheetOpen(true)} aria-label="Add results" className="size-10 p-0 sm:h-9 sm:w-auto sm:px-3">
                <Plus className="size-4" /> <span className="hidden sm:inline">Add results</span>
              </Button>
            )}
            <input ref={labFileInput} type="file" accept="application/pdf,image/*" hidden onChange={handleLabPdfUpload} />

            {/* Always-available theme toggle */}
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle light or dark theme" title="Toggle theme">
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
        </header>

        <div className="mx-auto w-full max-w-5xl px-4 py-5 pb-24 md:px-6">
        {activeView === 'overview' && (
          <Overview
            compounds={compounds ?? []}
            injections={injections ?? []}
            vitals={vitals ?? []}
            bodyMetrics={bodyMetrics ?? []}
            symptoms={symptoms ?? []}
            onNavigate={setActiveView}
          />
        )}
        <Suspense fallback={<div className="min-h-[40dvh]" />}>
          {activeView === 'add-injection' && <AddInjection compounds={compounds ?? []} injections={injections ?? []} onBack={() => setActiveView('overview')} />}
          {activeView === 'add-weight' && <AddWeight onBack={() => setActiveView('overview')} />}
          {activeView === 'add-bp' && <AddBP onBack={() => setActiveView('overview')} />}
          {activeView === 'labs' && (
            <Labs onImport={startLabImport} onManual={startManual} onReviewFile={(id) => setPdfReviewFileId(id)} />
          )}
          {activeView === 'timeline' && (
            <Timeline
              compounds={compounds} injections={injections} vitals={vitals} exams={exams} files={files} bodyMetrics={bodyMetrics}
              onOpenTest={(id) => { setActiveView('labs'); window.location.hash = `#test/${id}` }}
            />
          )}
          {activeView === 'files' && (
            <Files files={files ?? []} onReviewFile={(id) => setPdfReviewFileId(id)} />
          )}
          {activeView === 'export' && (
            <ExportPage
              compounds={compounds ?? []}
              injections={injections ?? []}
              vitals={vitals ?? []}
              exams={exams ?? []}
              results={enrichedResults ?? []}
              bodyMetrics={bodyMetrics ?? []}
              symptoms={symptoms ?? []}
            />
          )}
          {activeView === 'archive' && <Archive />}
          {activeView === 'settings' && (
            <Settings
              auth={auth}
              compounds={compounds}
              injections={injections}
              vitals={vitals}
              exams={exams}
              protocols={protocols}
              onExport={() => (isPro ? setActiveView('export') : openUpgrade('Doctor export'))}
              onOpenArchive={() => setActiveView('archive')}
            />
          )}
        </Suspense>
        </div>
      </main>

      <InstallPrompt />

      <Suspense fallback={null}>
        {addSheetOpen && <AddResultsSheet open isPro={isPro} onImport={startLabImport} onManual={startManual} onClose={() => setAddSheetOpen(false)} />}
        {manualOpen && <ManualResultDialog open onClose={() => setManualOpen(false)} />}
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
              <strong>
                {pdfProgress?.stage === 'ocr'
                  ? `Reading page ${pdfProgress.page} of ${pdfProgress.pages} with OCR${pdfProgress.pct ? ` · ${pdfProgress.pct}%` : '…'}`
                  : pdfProgress && pdfProgress.pages > 1
                    ? `Reading page ${pdfProgress.page} of ${pdfProgress.pages}…`
                    : 'Reading file…'}
              </strong>
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
    overview: 'Home',
    'add-injection': 'Add injection',
    'add-weight': 'Add weight',
    'add-bp': 'Add blood pressure',
    labs: 'Bloods',
    timeline: 'Timeline',
    files: 'Files',
    export: 'Export',
    archive: 'Archive',
    settings: 'Settings',
  }
  return map[view]
}

export default App
