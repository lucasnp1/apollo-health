// One blood test as its own dated report: the header, what was being taken at
// the draw, every section of markers, then the actions on the test.

import { useState, type ReactNode } from 'react'
import { Archive, Check, ChevronDown, ChevronRight, FileText, Merge, Pencil, Share2, Syringe, TriangleAlert } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { db, type LabExam } from '../../lib/db'
import { SECTION_ABBR, SECTION_ORDER, type LabSection } from '../../lib/markers'
import { planMerge, type LabTest, type TestMarker } from '../../lib/labTests'
import { dayOf, fmtDay } from '../../lib/dates'
import type { DoseTiming } from '../../lib/protocolAtDraw'
import { setExamArchived } from '../../lib/archive'
import { mergeTests } from '../../lib/bloodTestsDb'
import { ensureBlobAvailable } from '../../lib/fileSync'
import { useUndoableDelete } from '../../lib/useUndoableDelete'
import { useToast } from '../../lib/toast'
import { unitLabel } from '../../lib/dose'
import { FeedChip, FeedList, FeedRow, type FeedFact, type FeedStatus } from '../../components/FeedList'
import { PanelCard } from '../../components/dashboard/PanelCard'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { fixOf, markerRowProps, mergeCandidates, phaseLabel, plural, printedValue, testRowProps, verdictLine } from './feed'
import { markerHash } from './route'

// ── Header ────────────────────────────────────────────────────────────────

const DATE_SOURCE: Partial<Record<LabTest['dateSource'], string>> = {
  report: 'Date from the report',
  'report-date': 'Report date, draw may be a day earlier',
  filename: 'Date from the file name',
  user: 'Date set by you',
}

/** "10 hours" under a day, else "3 days" (or "3.4 days" when `exact`). */
const sinceDose = (d: DoseTiming, exact = false) =>
  d.daysBefore < 1 ? plural(Math.max(1, Math.round(d.daysBefore * 24)), 'hour') : plural(exact ? d.daysBefore : Math.round(d.daysBefore), 'day')

/** "Drawn 3 days after Testosterone cypionate: trough", when a dose was logged. */
function timingLine(t: LabTest): string | undefined {
  const d = t.timing.find((x) => x.androgen) ?? t.timing[0]
  if (!d) return undefined
  // "Same day" only when the calendar day says so; a dose the evening before reads in hours.
  const when = d.phase === 'same-day' ? 'Drawn the same day as' : `Drawn ${sinceDose(d)} after`
  const phase = d.phase === 'same-day' ? undefined : phaseLabel(d.phase)
  return `${when} ${d.name}${phase ? `: ${phase.toLowerCase()}` : ''}`
}

function countsLine(t: LabTest, isPro: boolean): string {
  const c = t.counts
  const parts = [plural(c.total, 'marker')]
  if (isPro) {
    if (c.act) parts.push(`${c.act} to act on`)
    if (c.watch) parts.push(`${c.watch} to watch`)
  } else if (c.outOfLabRange) parts.push(`${c.outOfLabRange} outside the lab range`)
  return parts.join(' · ')
}

function Facts({ facts, onFix }: { facts: FeedFact[]; onFix?: (warning: string) => void }) {
  if (!facts.length) return null
  return (
    <p className="feed-facts mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {facts.map((f, i) => {
        const x = typeof f === 'string' ? { text: f } : f
        if (x.tone === 'warn' && onFix) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onFix(x.text)}
              className="-my-2 inline-flex min-h-10 items-center gap-0.5 rounded text-left text-amber-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:text-amber-400"
            >
              {x.text} · {fixOf(x.text) === 'merge' ? 'Merge' : 'Edit'}
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </button>
          )
        }
        return <span key={i} className={x.tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}>{x.text}</span>
      })}
    </p>
  )
}

/**
 * The test's header. `latest` is the tappable summary card on the Latest tab;
 * `detail` heads the test report.
 */
export function TestHeader({ test: t, variant, isPro, onClick, onFix }: { test: LabTest; variant: 'latest' | 'detail'; isPro: boolean; onClick?: () => void; onFix?: (warning: string) => void }) {
  const warn: FeedFact[] = t.needsCheck.map((text) => ({ text, tone: 'warn' as const }))
  if (variant === 'latest') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="reveal block w-full rounded-xl border border-border bg-card p-5 text-left shadow-[var(--shadow-card)] transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:p-6"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="eyebrow block">Latest test</span>
            <span className="mt-1.5 block font-display text-xl font-semibold leading-tight">{t.title}</span>
          </span>
          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </span>
        <span className="feed-meta mt-1 block text-muted-foreground">
          {[fmtDay(t.date), t.provider, plural(t.counts.total, 'marker')].filter(Boolean).join(' · ')}
        </span>
        {timingLine(t) && <span className="feed-meta mt-0.5 block text-muted-foreground">{timingLine(t)}</span>}
        <span className="block"><Facts facts={warn} /></span>
        <span className="feed-note mt-3 block font-medium text-foreground">{verdictLine(t, isPro)}</span>
      </button>
    )
  }
  const src = DATE_SOURCE[t.dateSource]
  return (
    <PanelCard>
      <p className="eyebrow">{[t.provider, fmtDay(t.date)].filter(Boolean).join(' · ')}</p>
      <h2 className="mt-1.5 font-display text-xl font-semibold leading-tight">{t.title}</h2>
      <p className="feed-meta mt-1 text-muted-foreground">{countsLine(t, isPro)}</p>
      {timingLine(t) && <p className="feed-meta mt-0.5 text-muted-foreground">{timingLine(t)}</p>}
      <Facts facts={[...(src && !t.needsCheck.length ? [src] : []), ...warn]} onFix={onFix} />
    </PanelCard>
  )
}

// ── At the draw ───────────────────────────────────────────────────────────

const PHASE_TONE: Record<string, FeedStatus['tone']> = { 'near-peak': 'warn', missed: 'warn' }

function AtTheDraw({ test: t }: { test: LabTest }) {
  const meta = t.exam.meta
  const conditions = [
    meta?.fasted === true ? 'Fasted' : meta?.fasted === false ? 'Not fasted' : undefined,
    meta?.drawTime ? `Drawn at ${meta.drawTime}` : undefined,
    ...(meta?.conditions ?? []),
  ].filter(Boolean).join(' · ')
  return (
    <PanelCard title="At the draw" subtitle="What you logged in the 6 weeks before this test">
      {t.timing.length === 0 ? (
        <p className="feed-note text-muted-foreground">
          {t.baseline ? 'Before your protocol. This is your baseline.' : 'No doses logged in the 6 weeks before this test.'}
        </p>
      ) : (
        <FeedList>
          {t.timing.map((d) => {
            const unit = unitLabel(d.unit)
            const dose = d.dose !== undefined ? ` ${d.dose} ${unit}` : ''
            const every = d.everyDays ? ` every ${d.everyDays} days` : ''
            // The spec's chip here is "Same day"; lists elsewhere say "Dosed same day" to tell it from a same-day warning.
            const phase = d.phase === 'same-day' ? 'Same day' : phaseLabel(d.phase)
            const facts: FeedFact[] = [d.phase === 'same-day' ? 'Last dose on the draw day' : `Last dose ${sinceDose(d, true)} before`]
            if (d.phase === 'same-day') facts.push('Add the draw time to tell trough from peak.')
            return (
              <FeedRow
                key={d.group}
                icon={Syringe}
                title={`${d.name}${dose}${every}`}
                sub={[d.weekly !== undefined ? `${d.weekly} ${unit} a week` : undefined, `since ${fmtDay(d.since)}`].filter(Boolean).join(' · ')}
                status={phase ? { label: phase, tone: PHASE_TONE[d.phase!] ?? 'neutral' } : undefined}
                facts={facts}
              />
            )
          })}
        </FeedList>
      )}
      {(conditions || !meta?.drawTime) && (
        <p className="feed-facts mt-3 text-muted-foreground">
          {[conditions, meta?.drawTime ? undefined : 'Draw time not set, timing assumes 9 am'].filter(Boolean).join(' · ')}
        </p>
      )}
    </PanelCard>
  )
}

// ── Sections ──────────────────────────────────────────────────────────────

const flagged = (m: TestMarker) => m.labFlag === 'high' || m.labFlag === 'low'

function sectionChip(ms: TestMarker[], isPro: boolean): FeedStatus | undefined {
  const n = (r: TestMarker['read']) => ms.filter((m) => m.read === r).length
  if (isPro) {
    if (n('act')) return { label: `${n('act')} to act on`, tone: 'bad' }
    if (n('watch')) return { label: `${n('watch')} to watch`, tone: 'warn' }
    if (n('expected')) return { label: 'Expected', tone: 'neutral' }
    return n('fine') ? { label: 'All fine', tone: 'good' } : undefined
  }
  // The same rule as the test chip: neutral when every one is expected on the protocol.
  const out = ms.filter(flagged)
  if (!out.length) return undefined
  const unexpected = out.some((m) => !m.expected)
  return { label: `${out.length} outside range`, tone: unexpected ? 'bad' : 'neutral', icon: unexpected ? TriangleAlert : undefined }
}

// Which sections were opened or closed, for this session, so going back from a marker keeps them.
const openSections = new Map<string, boolean>()

/** One clinical section of a test, open when anything in it needs a look. */
export function SectionCard({ section, markers, isPro, onOpen, memoKey }: { section: LabSection; markers: TestMarker[]; isPro: boolean; onOpen: (m: TestMarker) => void; memoKey: string }) {
  const needsLook = markers.some((m) => (isPro ? m.read === 'act' || m.read === 'watch' : false) || flagged(m))
  const [open, setOpen] = useState(() => openSections.get(memoKey) ?? needsLook)
  const toggle = () => {
    const next = !open
    openSections.set(memoKey, next)
    setOpen(next)
  }
  const chip = sectionChip(markers, isPro)
  const abbr = SECTION_ABBR[section]
  return (
    <PanelCard>
      <button
        type="button"
        className="-m-2 flex min-h-10 w-[calc(100%+1rem)] items-center gap-2 rounded-lg p-2 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onClick={toggle}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-base font-semibold">{section}</span>
            {abbr && <span className="eyebrow">{abbr}</span>}
          </span>
          <span className="feed-meta block text-muted-foreground">
            {plural(markers.length, 'marker')}{needsLook ? '' : isPro ? (chip?.label === 'All fine' ? ', all fine' : '') : markers.every((m) => m.labFlag === 'in') ? ', all in range' : ''}
          </span>
        </span>
        {chip && <FeedChip status={chip} />}
      </button>
      {open && (
        <FeedList className="mt-3">
          {markers.map((m) => (
            <FeedRow key={m.resultId} {...markerRowProps(m, isPro, { printed: true })} onClick={() => onOpen(m)} />
          ))}
        </FeedList>
      )}
    </PanelCard>
  )
}

// ── Actions ───────────────────────────────────────────────────────────────

function ShareTestButton({ test: t, isPro }: { test: LabTest; isPro: boolean }) {
  const [state, setState] = useState<'idle' | 'busy' | 'shared' | 'downloaded' | 'failed'>('idle')
  const share = async () => {
    if (state === 'busy') return
    setState('busy')
    try {
      void import('../../lib/track').then((m) => m.track('read-share')).catch(() => undefined)
      const { drawShareCard, shareOrDownload } = await import('../../lib/shareCard')
      // This test's markers only, the ones that need a look first.
      const rank = (m: TestMarker) => (isPro ? (m.read === 'act' ? 0 : m.read === 'watch' ? 1 : 2) : flagged(m) && !m.expected ? 0 : 1)
      const markers = [...t.markers].sort((a, b) => rank(a) - rank(b)).slice(0, 12).map((m) => ({
        label: m.label,
        value: `${printedValue(m)} ${m.unit}`.trim(),
        status: isPro
          ? (m.read === 'act' ? 'bad' as const : m.read === 'watch' ? 'warn' as const : m.read === 'fine' ? 'good' as const : 'none' as const)
          : (flagged(m) ? (m.expected ? 'none' as const : 'bad' as const) : m.labFlag === 'in' ? 'good' as const : 'none' as const),
      }))
      const blob = await drawShareCard({
        paragraphs: isPro ? [verdictLine(t, true)] : [],
        stats: { markers: t.counts.total, inRange: t.markers.filter((m) => m.labFlag === 'in').length, outOfRange: t.counts.outOfLabRange, lastTest: dayOf(t.date) ? format(parseISO(dayOf(t.date)), 'MMM d') : undefined },
        findings: [],
        markers,
        subtitle: `${t.provider ?? 'Blood test'} · ${fmtDay(t.date)}`,
      })
      setState(await shareOrDownload(blob, 'magno-bloods.png', 'My bloods'))
    } catch (err) {
      setState((err as { name?: string })?.name === 'AbortError' ? 'idle' : 'failed')
    }
    setTimeout(() => setState('idle'), 2500)
  }
  const label = state === 'busy' ? 'Drawing…' : state === 'shared' ? 'Shared' : state === 'downloaded' ? 'Saved' : state === 'failed' ? 'Could not share' : 'Share image'
  return (
    <ActionButton onClick={() => void share()} disabled={state === 'busy'} icon={state === 'shared' || state === 'downloaded' ? Check : Share2}>
      {label}
    </ActionButton>
  )
}

function ActionButton({ icon: Icon, children, ...rest }: { icon: typeof Share2; children: ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <Button variant="outline" className={cn('h-10 justify-start', rest.className)} onClick={rest.onClick} disabled={rest.disabled}>
      <Icon className="size-4" /> {children}
    </Button>
  )
}

async function openOriginal(exam: LabExam): Promise<string | undefined> {
  const file = exam.sourceFileId !== undefined ? await db.files.get(exam.sourceFileId) : undefined
  const blob = file ? await ensureBlobAvailable(file) : undefined
  if (!blob) return 'The original file is not on this device.'
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// ── Merge ─────────────────────────────────────────────────────────────────

/** Pick the other report, confirm, merge (with undo). The test with more markers keeps its name and date. */
export function MergeDialog({ test, tests, go, onClose }: { test: LabTest; tests: LabTest[]; go: (hash: string, replace?: boolean) => void; onClose: () => void }) {
  const undo = useUndoableDelete()
  const near = mergeCandidates(test, tests)
  const [pick, setPick] = useState<LabTest | undefined>(near.length === 1 ? near[0] : undefined)
  const [busy, setBusy] = useState(false)
  // Ties keep the older record.
  const [src, dst] = !pick ? [] : pick.counts.total > test.counts.total || (pick.counts.total === test.counts.total && pick.id < test.id) ? [test, pick] : [pick, test]
  // Markers both reports hold with different values: dst keeps its own.
  const rowsOf = (t: LabTest) => t.markers.map((m) => ({ id: m.resultId, marker: m.printedName, unit: m.unit, value: m.value, rawValue: m.rawValue, high: m.high }))
  const differing = src && dst ? planMerge(rowsOf(src), rowsOf(dst)).differing : 0

  async function merge() {
    if (!src || !dst || busy) return
    setBusy(true)
    let restore: (() => Promise<void>) | undefined
    await undo({
      label: `Merged into ${dst.title}`,
      remove: async () => { restore = await mergeTests(src.id, dst.id) },
      restore: async () => restore?.(),
      errorMessage: 'Could not merge these tests. Please try again.',
    })
    onClose()
    if (restore) go(`#test/${dst.id}`, true)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose() }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>Merge with another report</DialogTitle>
          <DialogDescription>
            {near.length === 0 ? 'No other test is within 14 days of this one.' : !pick ? 'Pick the report from the same blood draw.' : 'Two reports of one blood draw become one test.'}
          </DialogDescription>
        </DialogHeader>
        {!pick ? (
          <FeedList>
            {near.map((o) => <FeedRow key={o.id} {...testRowProps(o, false)} onClick={() => setPick(o)} />)}
          </FeedList>
        ) : src && dst && (
          <p className="feed-note">
            The {plural(src.counts.total, 'marker')} from {src.title} ({fmtDay(src.date)}) move into {dst.title} ({fmtDay(dst.date)}).
            {dayOf(src.date) !== dayOf(dst.date) && ` The merged test keeps the ${fmtDay(dst.date)} date.`}
            {differing > 0
              ? ` ${plural(differing, 'marker')} it already has keep${differing === 1 ? 's its value' : ' their values'}. The other report's readings go to the archive, and so does the emptied report. You can undo this.`
              : ' Values already in it are archived, and the emptied report goes to the archive. You can undo this.'}
          </p>
        )}
        <DialogFooter className="gap-2">
          {pick && near.length > 1 && <Button variant="outline" className="h-10" onClick={() => setPick(undefined)} disabled={busy}>Back</Button>}
          <Button variant={pick ? 'outline' : 'default'} className="h-10" onClick={onClose} disabled={busy}>Cancel</Button>
          {pick && <Button className="h-10" onClick={() => void merge()} disabled={busy}><Merge className="size-4" /> {busy ? 'Merging…' : 'Merge'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────

export function TestReport({ test: t, tests, isPro, go, onEdit, onMerge }: {
  test: LabTest
  tests: LabTest[]
  isPro: boolean
  go: (hash: string, replace?: boolean) => void
  onEdit: (id: number) => void
  onMerge: (id: number) => void
}) {
  const undo = useUndoableDelete()
  const { showToast } = useToast()
  const sections = SECTION_ORDER
    .map((s) => ({ section: s, markers: t.markers.filter((m) => m.section === s) }))
    .filter((s) => s.markers.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <TestHeader test={t} variant="detail" isPro={isPro} onFix={(w) => (fixOf(w) === 'merge' ? onMerge(t.id) : onEdit(t.id))} />
      <AtTheDraw test={t} />
      {sections.map((s) => (
        <SectionCard key={s.section} memoKey={`${t.id}:${s.section}`} section={s.section} markers={s.markers} isPro={isPro} onOpen={(m) => go(markerHash(m.key, t.id))} />
      ))}
      <div className="grid gap-2 sm:grid-cols-2">
        {t.exam.sourceFileId !== undefined && (
          <ActionButton
            icon={FileText}
            onClick={() => void openOriginal(t.exam)
              .then((err) => err && showToast({ tone: 'warn', message: err }))
              .catch(() => showToast({ tone: 'error', message: 'Could not open the original report.' }))}
          >
            View original report
          </ActionButton>
        )}
        <ActionButton icon={Pencil} onClick={() => onEdit(t.id)}>Edit</ActionButton>
        {mergeCandidates(t, tests).length > 0 && <ActionButton icon={Merge} onClick={() => onMerge(t.id)}>Merge with another report</ActionButton>}
        <ShareTestButton test={t} isPro={isPro} />
        <ActionButton
          icon={Archive}
          className="text-muted-foreground"
          onClick={() => {
            go('#tests', true)
            void undo({ label: 'Test archived', remove: () => setExamArchived(t.id, true), restore: () => setExamArchived(t.id, false) })
          }}
        >
          Archive this test
        </ActionButton>
      </div>
    </div>
  )
}
