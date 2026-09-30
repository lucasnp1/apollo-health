// Compare (Pro): two tests side by side, one table per section. Every value is
// in the newer test's unit and judged on its own test's lab range; changes use
// the R6 thresholds, so small moves read "same".

import { useState, type ReactNode } from 'react'
import { ArrowUpDown, ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react'
import { SECTION_ABBR } from '../../lib/markers'
import { compareTests, defaultOlder, drawPhase, opOf, previousTest, type CompareRow, type LabTest, type TestMarker } from '../../lib/labTests'
import { daysBetween, fmtDay } from '../../lib/dates'
import { FeedList, FeedRow } from '../../components/FeedList'
import { PanelCard } from '../../components/dashboard/PanelCard'
import { cn } from '@/lib/utils'
import { flagChip, phaseLabel, plural, printedValue, rangeSub, SECTION_ICON, valueTitle } from './feed'
import { compareHash, markerHash } from './route'

type Go = (hash: string, replace?: boolean) => void

const num = (v: number) => String(Number(v.toPrecision(4)))
const SELECT = 'h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30'
const GRID = 'grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(4.75rem,0.9fr)] gap-x-2'

/** "Jun 28, 2026 · Medichecks · 19 markers" */
const optionLabel = (t: LabTest) => [fmtDay(t.date), t.provider, plural(t.counts.total, 'marker')].filter(Boolean).join(' · ')

function Chip({ children, pressed, onClick }: { children: ReactNode; pressed?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        pressed ? 'border-foreground/40 bg-secondary text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

const out = (m: TestMarker) => m.labFlag === 'high' || m.labFlag === 'low'

/** A value cell: mono, red with its H or L when outside its own range. */
function Value({ text, m, second, muted }: { text: string; m: TestMarker; second?: string; muted?: boolean }) {
  const flag = m.labFlag === 'high' ? 'H' : m.labFlag === 'low' ? 'L' : undefined
  return (
    <span className="min-w-0 text-right">
      <span className={cn('block font-mono text-sm tabular-nums', out(m) ? 'text-destructive' : muted && 'text-muted-foreground')}>
        {text}
        {flag && <span className="ml-0.5 text-xs font-bold" aria-label={flag === 'H' ? 'high' : 'low'}>{flag}</span>}
      </span>
      {second && <span className="block break-words font-mono text-xs tabular-nums text-muted-foreground">{second}</span>}
    </span>
  )
}

function Row({ r, go }: { r: CompareRow; go: Go }) {
  const printed = `${printedValue(r.older)}${r.older.unit ? ` ${r.older.unit}` : ''}`
  // No conversion: the older value stays in its own unit, muted, and there is no change.
  const noConv = r.olderValue === undefined && r.older.unit !== r.unit
  // Converted: keep the lab's < or >. Otherwise the lab's printed value, as in the Newer column.
  const olderText = r.olderConverted ? opOf(r.older.rawValue) + num(r.olderValue!) : noConv ? printed : printedValue(r.older)
  return (
    <button
      type="button"
      onClick={() => go(markerHash(r.key))}
      className={cn(GRID, 'w-full items-start rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50')}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-5">{r.label}</span>
        {r.unit && <span className="block font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{r.unit}</span>}
      </span>
      <Value text={olderText} m={r.older} muted={noConv} second={r.olderConverted ? printed : undefined} />
      <Value text={printedValue(r.newer)} m={r.newer} />
      <span className={cn('min-w-0 text-right font-mono text-xs leading-5 tabular-nums', r.change?.meaningful ? 'font-bold text-foreground' : 'text-muted-foreground')}>
        {r.change?.text ?? ''}
      </span>
    </button>
  )
}

function OnlyIn({ name, markers, go }: { name: string; markers: TestMarker[]; go: Go }) {
  const [open, setOpen] = useState(false)
  if (!markers.length) return null
  return (
    <PanelCard className="p-4 sm:p-6">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="-m-2 flex min-h-10 w-[calc(100%+1rem)] items-center gap-2 rounded-lg p-2 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">Only in {name}</span>
          <span className="feed-meta block text-muted-foreground">{plural(markers.length, 'marker')}</span>
        </span>
      </button>
      {open && (
        <FeedList className="mt-3">
          {markers.map((m) => (
            <FeedRow
              key={m.resultId}
              icon={SECTION_ICON[m.section]}
              title={valueTitle(m.label, printedValue(m), m.unit, m.labFlag, m.expected)}
              sub={rangeSub(m.low, m.high)}
              status={flagChip(m)}
              onClick={() => go(markerHash(m.key))}
            />
          ))}
        </FeedList>
      )}
    </PanelCard>
  )
}

export function ComparePage({ tests, newerId, olderId, go }: { tests: LabTest[]; newerId?: number; olderId?: number; go: Go }) {
  const newer = tests.find((t) => t.id === newerId) ?? tests[0]
  const older = tests.find((t) => t.id === olderId && t.id !== newer.id) ?? defaultOlder(tests, newer)
  if (!older) {
    return <PanelCard><p className="feed-note text-muted-foreground">Add a second test to compare two side by side.</p></PanelCard>
  }

  const plan = compareTests(newer, older)
  const prev = previousTest(tests, newer)
  // The last test before the first logged androgen dose.
  const baseline = tests.find((t) => t.baseline && t.id !== newer.id)
  const set = (n: number, o: number) => go(compareHash(n, o), true)
  const pick = (which: 'newer' | 'older', id: number) => {
    if (which === 'newer') set(id, id === older.id ? (defaultOlder(tests, tests.find((t) => t.id === id)!)?.id ?? newer.id) : older.id)
    else set(newer.id, id === newer.id ? older.id : id)
  }
  const reversed = daysBetween(older.date, newer.date) < 0
  const phases = [phaseLabel(drawPhase(older)), phaseLabel(drawPhase(newer))]
  // Two tests from one day share a date, so name them as the pickers do.
  const sameDay = plan.gapDays === 0
  const nameOf = (label: 'Newer' | 'Older', t: LabTest) => (sameDay ? (t.provider ? `${label} (${t.provider})` : label) : fmtDay(t.date))

  const summary = [
    `${plan.both} in both`,
    plan.onlyNewer.length ? `${plan.onlyNewer.length} only in ${nameOf('Newer', newer)}` : undefined,
    plan.onlyOlder.length ? `${plan.onlyOlder.length} only in ${nameOf('Older', older)}` : undefined,
    sameDay ? 'same day' : `${plural(plan.gapDays, 'day')} apart`,
  ].filter(Boolean).join(' · ')
  const warnings = [
    reversed ? 'Newer is dated before Older. Tap Swap to put them in order.' : undefined,
    sameDay ? 'These tests are from the same day, so small moves are noise.'
      : plan.gapDays < 14 ? `These tests are ${plural(plan.gapDays, 'day')} apart, so small moves are noise.` : undefined,
    plan.differentTiming ? `${phases[0]} vs ${phases[1]?.toLowerCase()}: hormone and hematocrit changes may be timing.` : undefined,
  ].filter((w): w is string => !!w)

  return (
    <div className="flex flex-col gap-4">
      <PanelCard className="p-4 sm:p-6">
        <p className="eyebrow">Compare</p>
        <h2 className="mt-1.5 font-display text-xl font-semibold leading-tight">Two tests side by side</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {([['newer', 'Newer', newer], ['older', 'Older', older]] as const).map(([which, label, t]) => (
            <label key={which} className="flex flex-col gap-1.5">
              <span className="eyebrow">{label}</span>
              <select className={SELECT} value={t.id} onChange={(e) => pick(which, Number(e.target.value))}>
                {tests.map((o) => <option key={o.id} value={o.id}>{optionLabel(o)}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {prev && <Chip pressed={prev.id === older.id} onClick={() => set(newer.id, prev.id)}>Previous test</Chip>}
          {baseline && <Chip pressed={baseline.id === older.id} onClick={() => set(newer.id, baseline.id)}>Before protocol</Chip>}
          <Chip onClick={() => set(older.id, newer.id)}><ArrowUpDown className="size-4" /> Swap</Chip>
        </div>
        <p className="feed-meta mt-3 text-muted-foreground">{summary}</p>
        {warnings.map((w) => (
          <p key={w} className="feed-note mt-2 flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {w}
          </p>
        ))}
      </PanelCard>

      {plan.sections.length === 0 && (
        <PanelCard><p className="feed-note text-muted-foreground">These two tests have no markers in common.</p></PanelCard>
      )}
      {plan.sections.map(({ section, rows }) => (
        <PanelCard
          key={section}
          className="p-4 sm:p-6"
          title={<span className="flex items-baseline gap-2">{section}{SECTION_ABBR[section] && <span className="eyebrow">{SECTION_ABBR[section]}</span>}</span>}
        >
          <div className={cn(GRID, 'eyebrow px-2 pb-1.5')} aria-hidden="true">
            <span>Marker</span><span className="text-right">Older</span><span className="text-right">Newer</span><span className="text-right">Change</span>
          </div>
          <div className="flex flex-col divide-y divide-border/60 border-t border-border/60">
            {rows.map((r) => <Row key={r.key} r={r} go={go} />)}
          </div>
        </PanelCard>
      ))}

      <OnlyIn name={nameOf('Newer', newer)} markers={plan.onlyNewer} go={go} />
      <OnlyIn name={nameOf('Older', older)} markers={plan.onlyOlder} go={go} />

      <p className="feed-facts px-1 text-muted-foreground">
        Values are in the newer test's units; a converted value shows the printed one below it; a value that cannot be converted keeps its own unit. Red is outside that test's own lab range.
      </p>
    </div>
  )
}
