import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Lock,
  Plus,
  Share2,
  Upload,
} from 'lucide-react'
import { BrandMark } from './components/BrandMark'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, seedIfEmpty } from './lib/db'
import { extractPdfText, extractMarkersFromText, type ExtractedMarker } from './lib/pdf'
import { ToastProvider, useToast } from './lib/toast'
import { useAuth } from './lib/useAuth'
import { useSync } from './lib/useSync'
import { InstallPrompt } from './components/InstallPrompt'
import { Onboarding, ONBOARDED_KEY } from './components/Onboarding'
import { UpgradeDialog } from './components/UpgradeDialog'
import { PlanProvider, usePlan } from './lib/plan'
// Modals / add-pages are lazy — only loaded when first opened
const ExportSheet      = lazy(() => import('./components/ExportSheet').then(m => ({ default: m.ExportSheet })))
const PdfReviewSheet   = lazy(() => import('./components/PdfReviewSheet').then(m => ({ default: m.PdfReviewSheet })))
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
const Targets   = lazy(() => import('./views/Targets').then(m => ({ default: m.Targets })))
const Timeline  = lazy(() => import('./views/Timeline').then(m => ({ default: m.Timeline })))
const Files     = lazy(() => import('./views/Files').then(m => ({ default: m.Files })))
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

  useEffect(() => {
    if (auth.state.status !== 'loading') {
      void seedIfEmpty()
    }
  }, [auth.state.status])

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

  // Ask the browser to keep our IndexedDB from being evicted under storage
  // pressure (matters most on iOS). Best-effort, prompts on no supported browser.
  useEffect(() => { void navigator.storage?.persist?.() }, [])

  const [labAddOpen, setLabAddOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  // PDF upload pipeline state — parsing overlay + review sheet. Transient
  // messages now route through the shared toast context (snackbar UI lives
  // in ToastProvider so any view can fire one without prop drilling).
  const [pdfParsingName, setPdfParsingName] = useState<string | null>(null)
  const [pdfReviewFileId, setPdfReviewFileId] = useState<number | null>(null)
  const { showToast } = useToast()

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
          message: `Couldn't read text from "${file.name}". It may be a scanned image, so add the results manually under Add result.`,
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

  async function commitPdfImport(items: ExtractedMarker[], collectedAt: string) {
    if (!pdfReviewFile?.id || items.length === 0) return
    const examId = await db.exams.add({
      name: pdfReviewFile.name.replace(/\.pdf$/i, ''),
      collectedAt,
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
    () => db.exams.orderBy('collectedAt').reverse().filter((e) => !e.deletedAtSync).toArray(),
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
    () => db.results.filter((r) => !r.deletedAtSync).toArray(),
    [], [],
  )
  // Kept for Settings export; protocol scheduling UI was removed.
  const protocols = useLiveQuery(
    () => db.protocols.toArray(),
    [], [],
  )
  const bodyMetrics = useLiveQuery(() => db.bodyMetrics.orderBy('measuredAt').reverse().limit(200).toArray(), [], [])
  const symptoms = useLiveQuery(() => db.symptoms.orderBy('recordedAt').reverse().limit(200).toArray(), [], [])
  const files = useLiveQuery(() => db.files.orderBy('addedAt').reverse().filter((f) => !f.deletedAtSync).toArray(), [], [])

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
            aria-label="Apollo Health, go to Home"
          >
            <BrandMark size={30} />
            <span className="font-display text-[17px] font-semibold leading-none tracking-[-0.02em]">
              Apollo <span className="font-medium text-muted-foreground">Health</span>
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
              <Button variant="ghost" size="icon" onClick={() => (isPro ? setExportOpen(true) : openUpgrade('Doctor export'))} aria-label="Export for doctor" title="Share with doctor">
                <Share2 className="size-4" />
              </Button>
            )}

            {activeView === 'labs' && (
              <>
                {isPro ? (
                  <Button asChild variant="outline" size="sm">
                    <label className="cursor-pointer" title="Upload PDF">
                      <input type="file" accept="application/pdf" hidden onChange={handleLabPdfUpload} />
                      <Upload className="size-4" /> <span className="hidden sm:inline">Upload</span>
                    </label>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => openUpgrade('Lab PDF import')} title="Upload PDF (Pro)">
                    <Upload className="size-4" /> <span className="hidden sm:inline">Upload</span>
                  </Button>
                )}
                <Button size="sm" onClick={() => setLabAddOpen(true)} title="Add result">
                  <Plus className="size-4" /> <span className="hidden sm:inline">Add result</span>
                </Button>
              </>
            )}
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
            <Labs compounds={compounds} injections={injections} vitals={vitals} exams={exams} results={enrichedResults} files={files} addOpen={labAddOpen} onAddClose={() => setLabAddOpen(false)} onReviewFile={(id) => setPdfReviewFileId(id)} />
          )}
          {activeView === 'targets' && <Targets />}
          {activeView === 'timeline' && (
            <Timeline compounds={compounds} injections={injections} vitals={vitals} exams={exams} files={files} bodyMetrics={bodyMetrics} />
          )}
          {activeView === 'files' && (
            <Files files={files ?? []} onReviewFile={(id) => setPdfReviewFileId(id)} />
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
        </div>
      </main>

      <InstallPrompt />

      <Suspense fallback={null}>
        {exportOpen && (
          <ExportSheet
            compounds={compounds ?? []}
            injections={injections ?? []}
            vitals={vitals ?? []}
            exams={exams ?? []}
            results={enrichedResults ?? []}
            bodyMetrics={bodyMetrics ?? []}
            symptoms={symptoms ?? []}
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
    overview: 'Home',
    'add-injection': 'Add injection',
    'add-weight': 'Add weight',
    'add-bp': 'Add blood pressure',
    labs: 'Labs',
    targets: 'Targets',
    timeline: 'Timeline',
    files: 'Files',
    settings: 'Settings',
  }
  return map[view]
}

export default App
