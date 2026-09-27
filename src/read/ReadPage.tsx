/**
 * Read my bloods: drop a lab PDF or photo, get the same written analysis the
 * app produces, without an account. The file is parsed on this device (pdf.js
 * and, for scans, tesseract), never uploaded, and forgotten on reload.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, CircleCheck, CircleDashed, ClipboardPaste, Droplet, FileUp, Lock, RotateCcw, ScanText, TriangleAlert } from 'lucide-react'
import type { LabExam } from '../lib/db'
import type { EnrichedResult } from '../lib/insights'
import type { Confidence, ExtractedMarker, ReadProgress } from '../lib/pdf'
import { canonicalize } from '../lib/markers'
import { guideUrl } from '../lib/guides'
import { buildFindings, type Finding } from '../lib/labFindings'
import { labStats, rangeStatus, type LabStats } from '../lib/labStats'
import { captureRef, withRef } from '../lib/ref'
import { stashPendingRead } from '../lib/pendingRead'
import { track } from '../lib/track'
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
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasted, setPasted] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { captureRef() }, [])

  // The parse from here on is identical whether the text came out of a PDF, a
  // photo via OCR, or was pasted straight in, so it lives in one place.
  const analyseText = useCallback(async (text: string, name: string, usedOcr: boolean) => {
    const { extractMarkersFromText, extractCollectionDate } = await import('../lib/pdf')
    const rows = text ? extractMarkersFromText(text) : []
    const kept = rows.filter((m) => Number.isFinite(m.value) && m.marker.trim().length > 0)
    if (kept.length === 0) {
      track('read-empty')
      setState({ kind: 'empty', name, usedOcr, hadText: Boolean(text) })
      return
    }
    const exam: LabExam = {
      id: 1,
      name: name.replace(/\.(pdf|jpe?g|png|webp|heic|gif|bmp|tiff?)$/i, ''),
      collectedAt: extractCollectionDate(text) ?? new Date().toISOString(),
      labName: usedOcr ? 'Photo import' : 'PDF import',
    }
    // Same mapping the app uses when every review row is accepted.
    const results: EnrichedResult[] = kept.map((m, i) => ({
      id: i + 1,
      examId: 1,
      marker: canonicalize(m.marker)?.label ?? m.marker.trim(),
      markerKey: canonicalize(m.marker)?.key,
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
    track('read-completed')
    setState({ kind: 'done', name, usedOcr, rows: kept, results, exam, findings, stats })
  }, [])

  const read = useCallback(async (file: File) => {
    if (file.size > MAX_BYTES) {
      setState({ kind: 'error', name: file.name, reason: 'That file is over 25 MB. Export a smaller PDF or take a photo of the page.' })
      return
    }
    track('read-started')
    setState({ kind: 'reading', name: file.name })
    try {
      const { readLabFile } = await import('../lib/pdf')
      const { text, usedOcr } = await readLabFile(file, (progress) => setState({ kind: 'reading', name: file.name, progress }))
      await analyseText(text, file.name, usedOcr)
    } catch (err) {
      console.error('read failed', err)
      track('read-failed')
      setState({ kind: 'error', name: file.name })
    }
  }, [analyseText])

  // Plenty of people never have a PDF: results arrive in an email, a clinic
  // portal, or a text message. Pasting skips the parse entirely.
  const readPasted = useCallback(async (text: string) => {
    if (!text.trim()) return
    track('read-started')
    setState({ kind: 'reading', name: 'Pasted results' })
    try {
      await analyseText(text, 'Pasted results', false)
    } catch (err) {
      console.error('paste read failed', err)
      track('read-failed')
      setState({ kind: 'error', name: 'Pasted results' })
    }
  }, [analyseText])

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
            <span className="text-[15px] font-semibold tracking-[-0.01em]">Magno</span>
          </a>
          <a href={appHref} className="text-sm text-muted-foreground transition-colors hover:text-foreground">Open the app</a>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pb-24 pt-8">
        <section>
          <p className="eyebrow">Free · no account</p>
          <h1 className="font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[42px]">Read my bloods.</h1>
          <p className="feed-note mt-3 max-w-[560px] text-muted-foreground">
            Drop a lab PDF or a photo of the printout. Magno reads every marker on this device and writes up what the numbers mean together: how they relate, what moves them, and what people usually do about it.
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
                    : `No recognized lab markers in "${state.name}". Magno looks for the marker name, value and unit on each line.`}
              </p>
            )}
          </section>
        )}

        {(state.kind === 'idle' || state.kind === 'error' || state.kind === 'empty') && (
          <section className="rounded-xl border border-border bg-card/60 p-5">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 text-left"
              onClick={() => setPasteOpen((o) => !o)}
              aria-expanded={pasteOpen}
            >
              <span>
                <span className="feed-title block">No PDF? Paste your results instead.</span>
                <span className="feed-meta block text-muted-foreground">
                  From an email, a clinic portal or a text. One marker per line, with the value and unit.
                </span>
              </span>
              <ClipboardPaste className="size-4 shrink-0 text-muted-foreground" />
            </button>
            {pasteOpen && (
              <div className="mt-4 flex flex-col gap-3">
                <textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  rows={8}
                  spellCheck={false}
                  placeholder={'Haemoglobin 152 g/L (130 - 170)\nHaematocrit 0.47 L/L (0.40 - 0.50)\nTestosterone 24.1 nmol/L (8.6 - 29.0)\nHbA1c 34 mmol/mol (20 - 41)'}
                  className="w-full rounded-md border border-input bg-transparent p-3 font-mono text-xs leading-relaxed shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  aria-label="Paste your lab results"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => void readPasted(pasted)} disabled={!pasted.trim()}>
                    Read these results <ArrowRight className="size-4" />
                  </Button>
                  <span className="feed-facts text-muted-foreground">
                    Read on this device, same as a file. Nothing is sent anywhere.
                  </span>
                </div>
              </div>
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
              action={
                <ShareReadButton
                  stats={state.stats}
                  findings={state.findings}
                  subtitle={state.exam.name}
                  markers={state.results.map((r) => {
                    const st = rangeStatus(r.value, r.low, r.high)
                    return {
                      label: r.marker,
                      value: `${r.rawValue}${r.unit ? ` ${r.unit}` : ''}`,
                      status: st === 'good' ? 'good' as const : st === 'warn' ? 'bad' as const : 'none' as const,
                    }
                  })}
                />
              }
            />
            <LabAnalysisCard findings={state.findings} />

            <PanelCard title="What Magno read" subtitle={`${state.rows.length} marker${state.rows.length === 1 ? '' : 's'} from ${state.name}`}>
              {state.usedOcr && (
                <div className="mb-3 flex items-start gap-2 rounded-md border-l-2 border-l-amber-500 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                  <ScanText className="mt-0.5 size-3.5 shrink-0" />
                  <span>Read with OCR. Numbers can be misread, so compare the rows below against the report. In the app you can correct any row before it is saved.</span>
                </div>
              )}
              <FeedList>
                {[...state.results]
                  .map((r, i) => ({ r, conf: state.rows[i]?.confidence ?? 'high' as Confidence }))
                  // Flagged markers first. Someone who just got a read wants the
                  // out-of-range ones explained, not an alphabetical list.
                  .sort((a, b) => {
                    const rank = (x: typeof a) => (rangeStatus(x.r.value, x.r.low, x.r.high) === 'warn' ? 0 : 1)
                    return rank(a) - rank(b)
                  })
                  .map(({ r, conf }) => {
                  const status = rangeStatus(r.value, r.low, r.high)
                  const above = status === 'warn' && r.high !== undefined && r.value !== undefined && r.value > r.high
                  const chip: FeedStatus = status === 'good'
                    ? { label: 'In range', tone: 'good', icon: CircleCheck }
                    : status === 'warn'
                      ? { label: above ? 'High' : 'Low', tone: 'bad', icon: TriangleAlert }
                      : { label: 'No range', tone: 'neutral', icon: CircleDashed }
                  const href = guideUrl((r as { markerKey?: string }).markerKey)
                  return (
                    <FeedRow
                      key={r.id}
                      icon={Droplet}
                      iconTone={status === 'warn' ? 'bad' : 'neutral'}
                      title={`${r.marker} ${r.rawValue}${r.unit ? ` ${r.unit}` : ''}`}
                      sub={status === 'warn' ? `${above ? 'above' : 'below'} ${rangeText(r.low, r.high)}` : rangeText(r.low, r.high)}
                      status={chip}
                      facts={[{ text: conf === 'high' ? 'read cleanly' : conf === 'medium' ? 'worth a glance' : 'check this one', tone: conf === 'high' ? 'good' : conf === 'medium' ? 'warn' : 'bad' }]}
                    >
                      {href && (
                        <a
                          href={href}
                          className="feed-facts inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                        >
                          What {r.marker} means <ArrowRight className="size-3" />
                        </a>
                      )}
                    </FeedRow>
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
                  <a
                    href={signupHref}
                    onClick={() => {
                      track('read-save')
                      // Hand the parsed read over so sign-up does not ask for
                      // the same file twice. Best effort: if storage is blocked
                      // the link still works and they re-upload.
                      stashPendingRead({
                        exam: { name: state.exam.name, collectedAt: state.exam.collectedAt, labName: state.exam.labName },
                        results: state.results.map((r) => ({
                          marker: r.marker, value: r.value, rawValue: r.rawValue,
                          unit: r.unit, low: r.low, high: r.high,
                        })),
                      })
                    }}
                  >
                    Save it in Magno <ArrowRight className="size-4" /></a>
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
          <a href="/" className="hover:text-foreground">About Magno</a>
          <a href="/privacy" className="hover:text-foreground">Privacy</a>
          <a href="/terms" className="hover:text-foreground">Terms</a>
        </footer>
      </main>
    </div>
  )
}
