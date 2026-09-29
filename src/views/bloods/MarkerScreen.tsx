// One marker across every test: the newest value against its own range, a
// real-time chart, every test's reading, what the marker is, and a personal
// target. Each reading is judged on its own test's lab range.

import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, XAxis, YAxis } from 'recharts'
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import { Archive, Lock } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type MarkerTarget } from '../../lib/db'
import { markerSeries, type LabTest, type TestMarker } from '../../lib/labTests'
import { fmtRange } from '../../lib/labRules'
import { toUnit } from '../../lib/labUnits'
import { dayOf, fmtDay } from '../../lib/dates'
import { archiveRow, restoreRow } from '../../lib/archive'
import { useUndoableDelete } from '../../lib/useUndoableDelete'
import type { MarkerCopy } from '../../lib/labCopy'
import { FeedChip, FeedList, FeedRow, type FeedFact } from '../../components/FeedList'
import { RangeBar } from '../../components/RangeBar'
import { PanelCard } from '../../components/dashboard/PanelCard'
import { ChartCard } from '../../components/dashboard/ChartCard'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePlan } from '../../lib/plan'
import { changeFact, flagChip, markerChip, phaseLabel, plural, printedValue, SECTION_ICON } from './feed'

const num = (v: number) => String(Number(v.toPrecision(4)))
const FLAG_COLOR = { high: 'var(--destructive)', low: 'var(--destructive)', in: 'oklch(0.72 0.14 158)', none: 'var(--muted-foreground)' }
// Lines people act at, in the unit they are written in.
const ACT_LINE: Record<string, [number, string]> = { hematocrit: [52, '%'], psa: [4, 'µg/L'] }

// Guide copy says "TRT" for search; inside the app it is "a protocol".
function deTrt(s: string): string {
  return s
    .replace(/\b([Oo]n) TRT\b/g, '$1 a protocol')
    .replace(/\bin TRT circles\b/g, 'in protocol circles')
    .replace(/\bthe TRT\b/g, 'the protocol')
    .replace(/(^|[.!?]\s+)TRT\b/g, '$1A protocol')
    .replace(/\bTRT\b/g, 'a protocol')
}

type Point = ReturnType<typeof markerSeries>['points'][number]

function Tip({ active, payload, unit }: { active?: boolean; payload?: Array<{ payload: Point }>; unit: string }) {
  const p = active ? payload?.[0]?.payload : undefined
  if (!p || p.value === undefined) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-mono text-sm font-semibold tabular-nums">{num(p.value)} {unit}</p>
      <p className="text-muted-foreground">{[fmtDay(p.date), p.provider, phaseLabel(p.phase as never)].filter(Boolean).join(' · ')}</p>
    </div>
  )
}

function TargetEditor({ markerKey, target, unit, low, high }: { markerKey: string; target?: MarkerTarget; unit: string; low?: number; high?: number }) {
  const show = (v?: number) => (v === undefined || !target ? '' : String(toUnit(markerKey, v, target.unit, unit) !== undefined ? num(toUnit(markerKey, v, target.unit, unit)!) : v))
  const [lo, setLo] = useState<string | null>(null)
  const [hi, setHi] = useState<string | null>(null)
  const loV = lo ?? show(target?.low)
  const hiV = hi ?? show(target?.high)
  const parse = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? undefined : Number(s))

  async function save() {
    const data = { marker: markerKey, low: parse(loV), high: parse(hiV), unit }
    if (target?.id) await db.markerTargets.update(target.id, data)
    else await db.markerTargets.add(data)
    setLo(null); setHi(null)
  }
  async function remove() {
    await db.markerTargets.where('marker').equals(markerKey).delete()
    setLo(null); setHi(null)
  }

  return (
    <PanelCard title="Your target" subtitle="Reads this marker against your own range instead of the lab's.">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="target-low" className="text-xs">Low</Label>
          <Input id="target-low" inputMode="decimal" className="h-10 w-24 font-mono" placeholder={low !== undefined ? num(low) : ''} value={loV} onChange={(e) => setLo(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="target-high" className="text-xs">High</Label>
          <Input id="target-high" inputMode="decimal" className="h-10 w-24 font-mono" placeholder={high !== undefined ? num(high) : ''} value={hiV} onChange={(e) => setHi(e.target.value)} />
        </div>
        <span className="feed-meta pb-2.5 font-mono text-muted-foreground">{unit}</span>
        <div className="flex gap-2">
          <Button variant="outline" className="h-10" disabled={parse(loV) === undefined && parse(hiV) === undefined} onClick={() => void save()}>Save</Button>
          {target && <Button variant="ghost" className="h-10 text-muted-foreground" onClick={() => void remove()}>Remove</Button>}
        </div>
      </div>
    </PanelCard>
  )
}

function WhatItIs({ markerKey }: { markerKey: string }) {
  const { isPro, openUpgrade } = usePlan()
  const [copy, setCopy] = useState<MarkerCopy | null>(null)
  useEffect(() => {
    let live = true
    void import('../../lib/labCopy').then(({ MARKER_COPY }) => {
      if (live) setCopy(MARKER_COPY[markerKey] ?? (markerKey === 'hs_crp' ? MARKER_COPY.crp : undefined) ?? null)
    })
    return () => { live = false }
  }, [markerKey])
  if (!copy) return null
  return (
    <PanelCard title="What it is">
      <p className="feed-note text-foreground/90">{deTrt(copy.what)}</p>
      <p className="feed-note mt-2 text-foreground/90">{deTrt(copy.range)}</p>
      <details className="group mt-3 border-t border-border/60 pt-2">
        <summary className="flex min-h-10 cursor-pointer items-center text-sm font-medium">Why it moves on a protocol</summary>
        <ul className="feed-note mt-1 list-disc space-y-1 pl-5 text-foreground/85 marker:text-muted-foreground/60">
          {copy.whyMoves.map((s, i) => <li key={i}>{deTrt(s)}</li>)}
        </ul>
      </details>
      {isPro ? (
        <details className="mt-1 border-t border-border/60 pt-2">
          <summary className="flex min-h-10 cursor-pointer items-center text-sm font-medium">What people usually do · not a recommendation</summary>
          <ul className="feed-note mt-1 list-disc space-y-1 pl-5 text-foreground/85 marker:text-muted-foreground/60">
            {copy.practices.map((s, i) => <li key={i}>{deTrt(s)}</li>)}
          </ul>
        </details>
      ) : (
        <button type="button" onClick={() => openUpgrade('Bloods read')} className="mt-1 flex min-h-10 w-full items-center gap-2 border-t border-border/60 pt-2 text-left text-sm font-medium text-muted-foreground">
          <Lock className="size-3.5" /> What people usually do · Pro
        </button>
      )}
    </PanelCard>
  )
}

// 1, 2, 2.5 or 5 times a power of ten: axis steps a person reads at a glance.
function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw || 1))
  const f = raw / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}

export function MarkerScreen({ markerKey, focusExamId, tests, isPro, go }: {
  markerKey: string
  focusExamId?: number
  tests: LabTest[]
  isPro: boolean
  go: (hash: string, replace?: boolean) => void
}) {
  // Every test that has this marker, newest first.
  const rows = useMemo(() => tests.flatMap((t) => {
    const m = t.markers.find((x) => x.key === markerKey)
    return m ? [{ t, m }] : []
  }), [tests, markerKey])
  const series = useMemo(() => markerSeries(tests, markerKey), [tests, markerKey])
  const target = useLiveQuery(() => db.markerTargets.where('marker').equals(markerKey).first(), [markerKey])
  const undo = useUndoableDelete()

  if (rows.length === 0) {
    return <PanelCard><p className="feed-note text-muted-foreground">No results for this marker yet.</p></PanelCard>
  }

  const newest = rows.find((r) => r.m.value !== undefined) ?? rows[0]
  const nm: TestMarker = newest.m
  const unit = series.unit
  const plotted = series.points.filter((p) => p.value !== undefined)
  const last = series.points[series.points.length - 1]
  const notLatest = newest.t.id !== tests[0]?.id
  const droppedUnits = [...new Set(series.points.filter((p) => p.value === undefined && p.raw).map((p) => p.unit || 'another unit'))]

  // A personal target as dashed lines, in the chart's unit.
  const targetLines = [target?.low, target?.high]
    .map((v) => (v === undefined ? undefined : toUnit(markerKey, v, target?.unit, unit)))
    .filter((v): v is number => v !== undefined)
  const act = ACT_LINE[markerKey] ? toUnit(markerKey, ACT_LINE[markerKey][0], ACT_LINE[markerKey][1], unit) : undefined
  const values = plotted.map((p) => p.value!)
  const lo = Math.min(...values, last?.low ?? Infinity, act ?? Infinity, ...targetLines)
  const hi = Math.max(...values, last?.high ?? -Infinity, act ?? -Infinity, ...targetLines)
  const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1
  // Round ticks (40, 45, 50), not the raw padded bounds (43.03, 48.03).
  const step = niceStep((hi - lo + 2 * pad) / 4)
  const domain: [number, number] = [Math.max(0, Math.floor((lo - pad) / step) * step), Math.ceil((hi + pad) / step) * step]
  const ticks: number[] = []
  for (let v = domain[0]; v <= domain[1] + step / 2; v += step) ticks.push(Number(v.toFixed(6)))

  const facts: FeedFact[] = [[fmtDay(newest.t.date), newest.t.provider].filter(Boolean).join(' · ')]
  if (notLatest) facts.push({ text: `Not in your latest test (last checked ${formatDistanceToNowStrict(parseISO(dayOf(newest.t.date)))} ago)`, tone: 'warn' })

  return (
    <div className="flex flex-col gap-4">
      <PanelCard>
        <p className="eyebrow">{nm.section} · {plural(rows.length, 'test')}</p>
        <h2 className="mt-1.5 font-display text-xl font-semibold leading-tight">{nm.label}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="font-mono text-3xl font-semibold tabular-nums leading-none">
            {printedValue(nm)}
            {nm.unit && <span className="ml-1.5 text-base font-normal text-muted-foreground">{nm.unit}</span>}
            {(nm.labFlag === 'high' || nm.labFlag === 'low') && (
              <span className={`ml-1.5 text-base font-bold ${nm.expected ? 'text-muted-foreground' : 'text-destructive'}`}>{nm.labFlag === 'high' ? 'H' : 'L'}</span>
            )}
          </p>
          {markerChip(nm, isPro) && <FeedChip status={markerChip(nm, isPro)!} />}
        </div>
        <p className="feed-facts mt-2 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
          {facts.map((f, i) => {
            const x = typeof f === 'string' ? { text: f } : f
            return <span key={i} className={x.tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : undefined}>{x.text}</span>
          })}
        </p>
        {isPro && nm.reason && <p className="feed-note mt-2 text-foreground/85">{nm.reason}{nm.next ? `. ${nm.next}` : ''}</p>}
        <RangeBar value={nm.value} low={nm.low} high={nm.high} previous={isPro ? nm.prev?.value : undefined} className="mt-4" />
        <p className="feed-facts mt-1.5 text-muted-foreground">{nm.low !== undefined && nm.high !== undefined ? `Lab range ${fmtRange(nm.low, nm.high)}` : fmtRange(nm.low, nm.high)}{nm.unit ? ` ${nm.unit}` : ''}</p>
      </PanelCard>

      <ChartCard title="Over time" subtitle={unit ? `In ${unit}, each dot colored by its own test's lab flag` : "Each dot colored by its own test's lab flag"}>
        {plotted.length < 2 ? (
          <p className="feed-note text-muted-foreground">One test so far.</p>
        ) : (
          <ChartContainer config={{ value: { label: 'Value', color: 'var(--muted-foreground)' } } satisfies ChartConfig} className="h-[220px] w-full">
            <LineChart data={plotted} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              {last && (last.low !== undefined || last.high !== undefined) && (
                <ReferenceArea
                  y1={last.low ?? domain[0]}
                  y2={last.high ?? domain[1]}
                  fill="oklch(0.72 0.14 158)"
                  fillOpacity={0.1}
                  ifOverflow="hidden"
                  label={{ value: `Lab range (${fmtDay(last.date)} test)`, position: 'insideBottomLeft', fontSize: 11, fill: 'var(--muted-foreground)' }}
                />
              )}
              {act !== undefined && <ReferenceLine y={act} stroke="var(--destructive)" strokeDasharray="4 4" strokeOpacity={0.6} />}
              {targetLines.map((y, i) => <ReferenceLine key={i} y={y} stroke="var(--muted-foreground)" strokeDasharray="2 4" />)}
              <XAxis
                type="number"
                dataKey="t"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(t: number) => format(t, 'MMM yy')}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 11 }}
                minTickGap={28}
              />
              <YAxis domain={domain} ticks={ticks} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11 }} tickFormatter={(v: number) => num(v)} />
              <ChartTooltip content={<Tip unit={unit} />} />
              <Line
                type="linear"
                dataKey="value"
                stroke="var(--muted-foreground)"
                strokeOpacity={0.6}
                strokeWidth={1.5}
                isAnimationActive={false}
                dot={(p: { cx?: number; cy?: number; index?: number; payload?: Point }) => (
                  <circle key={p.index} cx={p.cx} cy={p.cy} r={4} fill={FLAG_COLOR[p.payload?.labFlag ?? 'none']} stroke="var(--card)" strokeWidth={1.5} />
                )}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ChartContainer>
        )}
        {droppedUnits.length > 0 && (
          <p className="feed-facts mt-2 text-muted-foreground">
            {plural(series.dropped, 'older result')} in {droppedUnits.join(', ')} not plotted
          </p>
        )}
      </ChartCard>

      <PanelCard title="Every test">
        <FeedList>
          {rows.map(({ t, m }) => {
            const p = series.points.find((x) => x.examId === t.id)
            const conv = p?.converted && p.value !== undefined ? ` = ${num(p.value)} ${unit}` : ''
            const facts: FeedFact[] = []
            const phase = phaseLabel(t.timing.find((d) => d.androgen)?.phase)
            if (phase) facts.push(phase)
            if (isPro) {
              const c = changeFact(m)
              if (c) facts.push(c)
            }
            return (
              <FeedRow
                key={t.id}
                icon={SECTION_ICON[m.section]}
                title={<span className="font-mono tabular-nums">{printedValue(m)}{m.unit ? ` ${m.unit}` : ''}<span className="text-muted-foreground">{conv}</span></span>}
                sub={[fmtDay(t.date), t.provider, `range ${fmtRange(m.low, m.high).replace(/^No range printed$/, 'not printed').toLowerCase()}`].filter(Boolean).join(' · ')}
                status={flagChip(m)}
                facts={facts}
                selected={t.id === focusExamId}
                onClick={() => go(`#test/${t.id}`)}
              >
                {/* The one way to drop a single misread value. TestEditor's edit mode replaces this once it ships. */}
                {t.id === focusExamId && (
                  <Button
                    variant="ghost"
                    className="mt-1 h-10 text-muted-foreground"
                    onClick={() => void undo({ label: 'Result archived', remove: () => archiveRow('results', m.resultId), restore: () => restoreRow('results', m.resultId) })}
                  >
                    <Archive className="size-4" /> Remove this result
                  </Button>
                )}
              </FeedRow>
            )
          })}
        </FeedList>
      </PanelCard>

      <WhatItIs markerKey={markerKey} />
      <TargetEditor key={markerKey} markerKey={markerKey} target={target} unit={unit} low={last?.low} high={last?.high} />
    </div>
  )
}
