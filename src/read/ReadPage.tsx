/**
 * Read my bloods: drop a lab PDF or photo, get the same written analysis the
 * app produces, without an account. The file is parsed on this device (pdf.js
 * and, for scans, tesseract), never uploaded, and forgotten on reload.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, CircleCheck, CircleDashed, Droplet, FileUp, Lock, RotateCcw, ScanText, TriangleAlert } from 'lucide-react'
import type { LabExam } from '../lib/db'
import type { EnrichedResult } from '../lib/insights'
import type { Confidence, ExtractedMarker, ReadProgress } from '../lib/pdf'
import { canonicalize } from '../lib/markers'
import { buildFindings, type Finding } from '../lib/labFindings'
import { labStats, rangeStatus, type LabStats } from '../lib/labStats'
import { captureRef, withRef } from '../lib/ref'
import { LabAnalysisCard, LabSummaryCard, ShareReadButton } from '../components/LabAnalysis'
import { FeedList, FeedRow, type FeedStatus } from '../components/FeedList'
import { PanelCard } from '../components/dashboard/PanelCard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MAX_BYTES = 25 * 1024 * 1024
const ACCEPT = 'application/pdf,image/*'

type State =
  | { kind: 'idle' }
  | { kind: 'reading'; name: string; progress?: ReadProgress }
  | { kind: 'done'; name: string; usedOcr: boolean; rows: ExtractedMarker[]; results: EnrichedResult[]; exam: LabExam; findings: Finding[]; stats: LabStats }
  | { kind: 'empty'; name: string; usedOcr: boolean; hadText: boolean }
  | { kind: 'error'; name: string; reason?: string }

const CONF_DOT: Record<Confidence, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-500',
  low: 'bg-destructive',
}

function progressText(p?: ReadProgress): string {
  if (!p) return 'Reading file…'
  if (p.stage === 'ocr') {
    if (!p.pct) return 'Downloading the OCR engine (about 6 MB, once)…'
    return `Reading page ${p.page} of ${p.pages} with OCR · ${p.pct}%`
  }
  return p.pages > 1 ? `Reading page ${p.page} of ${p.pages}…` : 'Reading file…'
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))
}

function rangeText(low?: number, high?: number): string {
  if (low !== undefined && high !== undefined) return `range ${fmtNum(low)} to ${fmtNum(high)}`
  if (high !== undefined) return `under ${fmtNum(high)}`
  if (low !== undefined) return `over ${fmtNum(low)}`
  return 'no reference range on the report'
}

export function ReadPage() {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { captureRef() }, [])

  const read = useCallback(async (file: File) => {
    if (file.size > MAX_BYTES) {
      setState({ kind: 'error', name: file.name, reason: 'That file is over 25 MB. Export a smaller PDF or take a photo of the page.' })
      return
    }
    setState({ kind: 'reading', name: file.name })
    try {
      const { readLabFile, extractMarkersFromText, extractCollectionDate } = await import('../lib/pdf')
      const { text, usedOcr } = await readLabFile(file, (progress) => setState({ kind: 'reading', name: file.name, progress }))
      const rows = text ? extractMarkersFromText(text) : []
      const kept = rows.filter((m) => Number.isFinite(m.value) && m.marker.trim().length > 0)
      if (kept.length === 0) {
        setState({ kind: 'empty', name: file.name, usedOcr, hadText: Boolean(text) })
        return
      }
      const exam: LabExam = {
        id: 1,
        name: file.name.replace(/\.(pdf|jpe?g|png|webp|heic|gif|bmp|tiff?)$/i, ''),
        collectedAt: extractCollectionDate(text) ?? new Date().toISOString(),
        labName: usedOcr ? 'Photo import' : 'PDF import',
      }
      // Same mapping the app uses when every review row is accepted.
      const results: EnrichedResult[] = kept.map((m, i) => ({
        id: i + 1,
        examId: 1,
        marker: canonicalize(m.marker)?.label ?? m.marker.trim(),
        value: m.value,
        rawValue: m.rawValue ?? String(m.value),
        unit: m.unit,
        low: m.low,
        high: m.high,
        exam,
      }))
      const findings = buildFindings(results, [exam])
      const counts = labStats(results, [exam])
      const stats: LabStats = { ...counts, lastTest: new Date(exam.collectedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
      setState({ kind: 'done', name: file.name, usedOcr, rows: kept, results, exam, findings, stats })
    } catch (err) {
      console.error('read failed', err)
      setState({ kind: 'error', name: file.name })
    }
  }, [])

  const onFiles = (files: FileList | null) => {
    const f = files?.[0]
    if (f) void read(f)
  }

  const signupHref = withRef('/app/?signup=1', 'read')
  const appHref = withRef('/app/', 'read')

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <a href="/" className="flex items-center gap-2.5">
            <img src="/logo-128.png" alt="" width="28" height="28" className="size-7 rounded-[8px]" />
            <span className="text-[15px] font-semibold tracking-[-0.01em]">Apollo <span className="text-muted-foreground">Health</span></span>
          </a>
          <a href={appHref} className="text-sm text-muted-foreground transition-colors hover:text-foreground">Open the app</a>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pb-24 pt-8">
        <section>
          <p className="eyebrow">Free · no account</p>
          <h1 className="font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[42px]">Read my bloods.</h1>
          <p className="feed-note mt-3 max-w-[560px] text-muted-foreground">
            Drop a lab PDF or a photo of the printout. Apollo reads every marker on this device and writes up what the numbers mean together, the way an experienced TRT user would: TRT-aware ranges, probable causes, and what people usually do about it.
          </p>
          <p className="feed-facts mt-3 inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-muted-foreground">
            <Lock className="size-3.5" /> Nothing leaves your browser. The file is read here and forgotten when you close the tab.
          </p>
        </section>

        {(state.kind === 'idle' || state.kind === 'error' || state.kind === 'empty') && (
          <section
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files) }}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
              dragging ? 'border-primary bg-primary/8' : 'border-border bg-card/60',
            )}
          >
            <span className="grid size-12 place-items-center rounded-full bg-primary/12 text-primary">
              <FileUp className="size-5" />
            </span>
            <p className="feed-title">Drop your lab report here</p>
            <p className="feed-meta text-muted-foreground">PDF from the lab, or a photo of the printed page. Medichecks, Thriva, Randox, NHS, LabCorp and Quest all read fine.</p>
            <Button size="lg" className="mt-2" onClick={() => inputRef.current?.click()}>Choose a file</Button>
            <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
            {state.kind === 'error' && (
              <p className="feed-meta mt-2 text-destructive" role="alert">
                {state.reason ?? `Couldn't read "${state.name}". Try a different file, or a clearer photo of the page.`}
              </p>
            )}
            {state.kind === 'empty' && (
              <p className="feed-meta mt-2 text-amber-700 dark:text-amber-400" role="alert">
                {!state.hadText
                  ? `Couldn't read any text in "${state.name}". Try a clearer scan or photo.`
                  : state.usedOcr
                    ? `Read "${state.name}" with OCR but couldn't find any lab markers. Try a sharper photo with the whole table in frame.`
                    : `No recognized lab markers in "${state.name}". Apollo looks for the marker name, value and unit on each line.`}
              </p>
            )}
          </section>
        )}

        {state.kind === 'reading' && (
          <section className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-5" role="status" aria-live="polite">
            <span className="size-6 shrink-0 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="feed-title truncate">{progressText(state.progress)}</p>
              <p className="feed-meta truncate text-muted-foreground">{state.name}</p>
            </div>
          </section>
        )}

        {state.kind === 'done' && (
          <>
            <LabSummaryCard
              stats={state.stats}
              findings={state.findings}
              subtitle={[state.exam.name, state.exam.labName, new Date(state.exam.collectedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })].filter(Boolean).join(' · ')}
              action={<ShareReadButton stats={state.stats} findings={state.findings} subtitle={state.exam.name} />}
            />
            <LabAnalysisCard findings={state.findings} />

            <PanelCard title="What Apollo read" subtitle={`${state.rows.length} marker${state.rows.length === 1 ? '' : 's'} from ${state.name}`}>
              {state.usedOcr && (
                <div className="mb-3 flex items-start gap-2 rounded-md border-l-2 border-l-amber-500 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                  <ScanText className="mt-0.5 size-3.5 shrink-0" />
                  <span>Read with OCR. Numbers can be misread, so compare the rows below against the report. In the app you can correct any row before it is saved.</span>
                </div>
              )}
              <FeedList>
                {state.results.map((r, i) => {
                  const status = rangeStatus(r.value, r.low, r.high)
                  const above = status === 'warn' && r.high !== undefined && r.value !== undefined && r.value > r.high
                  const chip: FeedStatus = status === 'good'
                    ? { label: 'In range', tone: 'good', icon: CircleCheck }
                    : status === 'warn'
                      ? { label: above ? 'High' : 'Low', tone: 'bad', icon: TriangleAlert }
                      : { label: 'No range', tone: 'neutral', icon: CircleDashed }
                  const conf = state.rows[i]?.confidence ?? 'high'
                  return (
                    <FeedRow
                      key={r.id}
                      icon={Droplet}
                      iconTone={status === 'warn' ? 'bad' : 'neutral'}
                      title={`${r.marker} ${r.rawValue}${r.unit ? ` ${r.unit}` : ''}`}
                      sub={status === 'warn' ? `${above ? 'above' : 'below'} ${rangeText(r.low, r.high)}` : rangeText(r.low, r.high)}
                      status={chip}
                      facts={[{ text: conf === 'high' ? 'read cleanly' : conf === 'medium' ? 'worth a glance' : 'check this one', tone: conf === 'high' ? 'good' : conf === 'medium' ? 'warn' : 'bad' }]}
                    />
                  )
                })}
              </FeedList>
              <p className="feed-facts mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                {(['high', 'medium', 'low'] as Confidence[]).map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5"><span className={cn('size-2 rounded-full', CONF_DOT[c])} />{c === 'high' ? 'read cleanly' : c === 'medium' ? 'worth a glance' : 'uncertain'}</span>
                ))}
              </p>
            </PanelCard>

            <section className="rounded-xl border border-primary/30 bg-primary/8 px-5 py-5">
              <p className="eyebrow text-primary">Keep it</p>
              <h2 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.01em]">Save this read and track the next one.</h2>
              <p className="feed-note mt-2 max-w-[560px] text-muted-foreground">
                In the app every marker gets its own history, the change since your last test, and the same read on your injections, blood pressure and weight. Free to log; the bloods read is part of Pro, with the first month free.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="lg">
                  <a href={signupHref}>Save it in Apollo <ArrowRight className="size-4" /></a>
                </Button>
                <Button variant="outline" size="lg" onClick={() => setState({ kind: 'idle' })}>
                  <RotateCcw className="size-4" /> Read another file
                </Button>
              </div>
            </section>
          </>
        )}

        <footer className="feed-facts mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/70 pt-4 text-muted-foreground">
          <span>Not medical advice. Check anything you act on with your doctor.</span>
          <a href="/" className="hover:text-foreground">About Apollo</a>
          <a href="/privacy" className="hover:text-foreground">Privacy</a>
          <a href="/terms" className="hover:text-foreground">Terms</a>
        </footer>
      </main>
    </div>
  )
}
