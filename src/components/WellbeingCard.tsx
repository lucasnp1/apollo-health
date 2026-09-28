import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Check, ChevronDown, ChevronUp, HeartPulse, Plus, X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { db, type Compound, type InjectionLog, type Symptom, type VitalLog } from '../lib/db'
import { canonicalize } from '../lib/markers'
import { felt, notable, times, wellbeingSummary, type Insight, type LabPoint } from '../lib/wellbeingSummary'
import { CAUSES } from '../lib/wellbeingCauses'
import { ALL_SYMPTOMS, NEGATIVE, POSITIVE, chipTone, customDefs, customKey, ratingOf, withRating, type SymptomDef } from '../lib/symptoms'
import { TimeRangePicker } from './TimeRangePicker'
import { filterByRange, type TimeRange } from '../lib/timeRange'
import { ChartCard } from './dashboard/ChartCard'
import { PanelEmpty } from './dashboard/PanelCard'
import { SymptomScale } from './SymptomScale'
import { FeedChip, FeedList, FeedRow, type FeedTone } from './FeedList'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

const chartConfig = {
  good: { label: 'Feeling good', color: 'var(--chart-1)' },
  watch: { label: 'Worth watching', color: 'var(--chart-2)' },
} satisfies ChartConfig

// Two lines, not nine. Only two chart colours exist in the token set, and nine
// overlapping series is unreadable anyway: the per-symptom detail lives in the
// rows underneath, where the tone carries the meaning.
function meanOf(s: Symptom, defs: SymptomDef[]) {
  const vals = defs.map((d) => ratingOf(s, d)).filter((v): v is number => v !== undefined)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined
}

function ratingsOf(s: Symptom, defs: SymptomDef[]) {
  return defs
    .map((d) => ({ d, v: ratingOf(s, d) }))
    .filter((x): x is { d: SymptomDef; v: number } => x.v !== undefined)
}

// Marker keys the cause map can cite; only these are read from the labs.
const CITED = new Set(Object.values(CAUSES).flatMap((r) => r.markers))
const DAY = 86_400_000
const RECENT_STEP = 3

export function WellbeingCard({
  symptoms, vitals = [], injections = [], compounds = [],
}: {
  symptoms: Symptom[]
  vitals?: VitalLog[]
  injections?: InjectionLog[]
  compounds?: Compound[]
}) {
  const [range, setRange] = useState<TimeRange>('3M')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Partial<Symptom>>({})
  const [busy, setBusy] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newDir, setNewDir] = useState<'positive' | 'negative'>('negative')

  const inRange = useMemo(
    () => filterByRange(symptoms, range, (s) => parseISO(s.recordedAt))
      .slice()
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)),
    [symptoms, range],
  )

  const rows = useMemo(
    () => inRange.map((s) => {
      const good = meanOf(s, POSITIVE)
      const watch = meanOf(s, NEGATIVE)
      return {
        date: format(parseISO(s.recordedAt), 'MMM d'),
        good: good === undefined ? undefined : Number(good.toFixed(2)),
        watch: watch === undefined ? undefined : Number(watch.toFixed(2)),
      }
    }),
    [inRange],
  )

  const recent = useMemo(
    () => symptoms.slice().sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    [symptoms],
  )
  const [shown, setShown] = useState(RECENT_STEP)
  const [openId, setOpenId] = useState<number | undefined>()

  // Latest result per cited marker, for "your last estradiol was ..." evidence.
  // Personal targets win over the lab's range, as on the Labs page, so the two
  // never disagree about the same result.
  const labs = useLiveQuery(async () => {
    const [results, exams, targets] = await Promise.all([
      // isFinite also drops NaN ("4,5" typed on a comma keypad) and nulls from old backups.
      db.results.filter((r) => !r.deletedAtSync && !r.archivedAt && Number.isFinite(r.value)).toArray(),
      db.exams.filter((e) => !e.deletedAtSync && !e.archivedAt).toArray(),
      db.markerTargets.toArray(),
    ])
    const at = new Map(exams.map((e) => [e.id, e.collectedAt]))
    const target = new Map(targets.map((t) => [t.marker, t]))
    const out: Record<string, LabPoint> = {}
    for (const r of results) {
      const meta = canonicalize(r.marker)
      const when = at.get(r.examId)
      if (!meta || !when || !CITED.has(meta.key)) continue
      if (out[meta.key] && out[meta.key].at >= when) continue
      const t = target.get(meta.key)
      out[meta.key] = { label: meta.label, value: r.value!, raw: r.rawValue, unit: r.unit, low: t?.low ?? r.low, high: t?.high ?? r.high, at: when }
    }
    return out
  }, [], {} as Record<string, LabPoint>)

  // Custom symptoms are whatever the user has ever rated, plus anything added
  // in this draft. They need no registry: each rating carries its own label and
  // direction, so the list rebuilds itself from the data.
  const customs = useMemo(() => customDefs([...symptoms, draft]), [symptoms, draft])
  const goodDefs = useMemo(() => [...POSITIVE, ...customs.filter((d) => d.direction === 'positive')], [customs])
  const watchDefs = useMemo(() => [...NEGATIVE, ...customs.filter((d) => d.direction === 'negative')], [customs])
  const allDefs = useMemo(() => [...ALL_SYMPTOMS, ...customs], [customs])

  const anyRated = allDefs.some((d) => ratingOf(draft, d) !== undefined)

  // "This week" is counted from this clock. It moves on whenever the app comes
  // back into view, so a PWA left open on Home for days does not go stale.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') setNow(Date.now()) }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])
  const summary = useMemo(() => {
    const bpRecent = vitals.filter((v) => now - Date.parse(v.measuredAt) < 14 * DAY)
    const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
    const names = new Map(compounds.map((c) => [c.id, c.name]))
    const recentCompounds = [...new Set(injections
      .filter((i) => now - Date.parse(i.takenAt) < 21 * DAY)
      .map((i) => names.get(i.compoundId))
      .filter((n): n is string => !!n))]
    return wellbeingSummary(symptoms, allDefs, CAUSES, {
      labs,
      bp: bpRecent.length ? { sys: avg(bpRecent.map((v) => v.systolic)), dia: avg(bpRecent.map((v) => v.diastolic)), n: bpRecent.length } : undefined,
      recentCompounds,
    }, now)
  }, [symptoms, allDefs, labs, vitals, injections, compounds, now])

  function addCustom() {
    const label = newLabel.trim()
    const key = customKey(label)
    if (!key || allDefs.some((d) => d.key === key)) { setNewLabel(''); return }
    // Rated 0 so it appears immediately with a value the user can change.
    setDraft((f) => withRating(f, { key, label, direction: newDir, custom: true }, 0))
    setNewLabel('')
  }

  async function saveCheckIn() {
    if (!anyRated || busy) return
    setBusy(true)
    try {
      await db.symptoms.add({ recordedAt: new Date().toISOString(), ...draft } as Symptom)
      setDraft({})
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ChartCard
      title="Wellbeing"
      subtitle={symptoms.length ? `${symptoms.length} check-ins logged` : 'How you have been feeling'}
      action={
        <div className="flex items-center gap-2">
          <TimeRangePicker value={range} onChange={setRange} />
          <Button
            variant={open ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 shrink-0"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            {open ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {open ? 'Cancel' : 'Check in'}
          </Button>
        </div>
      }
    >
      {open && (
        <div className="mb-5 flex flex-col gap-4 rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">
            Rate anything that applies. Leave the rest blank. 0 means none at all.
          </p>
          <div className="flex flex-col gap-1">
            <p className="eyebrow mb-1">Feeling good</p>
            {goodDefs.map((d) => (
              <SymptomScale key={d.key} def={d} value={ratingOf(draft, d)} onChange={(v) => setDraft((f) => withRating(f, d, v))} />
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <p className="eyebrow mb-1">Worth watching</p>
            {watchDefs.map((d) => (
              <SymptomScale key={d.key} def={d} value={ratingOf(draft, d)} onChange={(v) => setDraft((f) => withRating(f, d, v))} />
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="eyebrow">Track something else</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-9 min-w-0 flex-1"
                placeholder="e.g. Anxiety, Pumps, Appetite"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
              />
              <Segmented
                value={newDir}
                onChange={setNewDir}
                size="sm"
                options={[{ value: 'negative', label: 'Watch' }, { value: 'positive', label: 'Good' }]}
              />
              <Button variant="outline" size="sm" className="h-9" disabled={!newLabel.trim()} onClick={addCustom}>
                <Plus className="size-3.5" /> Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              "Watch" means a high number is bad, like acne. "Good" means a high number is good, like energy.
            </p>
          </div>

          <Button className="self-start" disabled={!anyRated || busy} onClick={() => void saveCheckIn()}>
            <Check className="size-4" /> Save check-in
          </Button>
        </div>
      )}

      {rows.length < 2 ? (
        <PanelEmpty
          icon={HeartPulse}
          title={symptoms.length ? 'Not enough check-ins in this range' : 'No check-ins yet'}
          detail="Check in a few times and the trend shows up here. You can also log it with an injection."
        />
      ) : (
        <ChartContainer config={chartConfig} className="h-[190px] w-full">
          <LineChart data={rows} margin={{ left: 4, right: 8, top: 6, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} width={24} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
            <Line type="monotone" dataKey="good" stroke="var(--color-good)" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            <Line type="monotone" dataKey="watch" stroke="var(--color-watch)" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls />
          </LineChart>
        </ChartContainer>
      )}

      {summary.checkIns > 0 && <SummaryBlock checkIns={summary.checkIns} insights={summary.insights} />}

      {recent.length > 0 && (
        <div className="mt-5">
          <p className="eyebrow mb-1">Recent check-ins</p>
          <FeedList>
            {recent.slice(0, shown).map((s) => {
              const ratings = ratingsOf(s, allDefs)
              const named = ratings.filter(({ d }) => notable(s, d))
              const mild = ratings.filter(({ d }) => felt(s, d) && !notable(s, d)).length
              const tone: FeedTone = named.length + mild === 0 ? 'good'
                : named.some(({ d, v }) => chipTone(v, d.direction) === 'bad') ? 'bad' : 'warn'
              const open = openId === s.id
              const d = parseISO(s.recordedAt)
              return (
                <FeedRow
                  key={s.id}
                  icon={HeartPulse}
                  iconTone={tone}
                  title={format(d, 'EEE d MMM')}
                  when={format(d, 'HH:mm')}
                  // Only what was off, so a row is one line. The rest is a tap away.
                  sub={[
                    ...(named.length + mild
                      ? [...named.map(({ d: def, v }) => `${def.label} ${v}`), ...(mild ? [`${mild} mild`] : [])]
                      : ['All fine']),
                    ...(s.notes ? ['note'] : []),
                  ].join(' · ')}
                  onClick={() => setOpenId(open ? undefined : s.id)}
                  expanded={open}
                >
                  {open && (
                    <div className="flex flex-col gap-2 pb-3 pl-14 pr-2">
                      {s.notes && <p className="feed-note break-words text-foreground/85">{s.notes}</p>}
                      <div className="flex flex-wrap gap-1.5">
                        {ratings.map(({ d: def, v }) => (
                          // Same verdict as the row and the summary: a side effect that was felt is
                          // never green, even at 1 out of 5.
                          <FeedChip key={def.key} status={{ label: `${def.label} ${v}`, tone: felt(s, def) && chipTone(v, def.direction) !== 'bad' ? 'warn' : chipTone(v, def.direction) }} />
                        ))}
                      </div>
                    </div>
                  )}
                </FeedRow>
              )
            })}
          </FeedList>
          {recent.length > RECENT_STEP && (
            // One button that stays mounted, so focus stays on it after a tap.
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-8 text-muted-foreground"
              aria-expanded={shown >= recent.length}
              onClick={() => {
                if (shown < recent.length) setShown((n) => n + 5)
                else { setShown(RECENT_STEP); setOpenId(undefined) }
              }}
            >
              {shown < recent.length ? 'Show more' : 'Show less'}
            </Button>
          )}
        </div>
      )}
    </ChartCard>
  )
}

// ── What stood out: counts this week and month, what they are often linked
// to, and the user's own numbers behind it. Two by default; the rest a tap away.
const SUMMARY_STEP = 2

function SummaryBlock({ checkIns, insights }: { checkIns: number; insights: Insight[] }) {
  const [all, setAll] = useState(false)
  const list = all ? insights : insights.slice(0, SUMMARY_STEP)
  return (
    <div className="mt-5 flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Last 30 days</p>
        <p className="text-xs text-muted-foreground">{checkIns} check-in{checkIns === 1 ? '' : 's'}</p>
      </div>
      {insights.length === 0 ? (
        <p className="rounded-lg border-l-2 border-l-emerald-500 bg-muted/40 px-3 py-2.5 text-sm">
          Nothing stood out. Every check-in was fine.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((ins) => <InsightRow key={ins.keys.join()} insight={ins} />)}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-xs text-muted-foreground">Patterns from your check-ins, not a diagnosis.</p>
        {insights.length > SUMMARY_STEP && (
          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => setAll((a) => !a)} aria-expanded={all}>
            {all ? 'Show less' : `Show ${insights.length - SUMMARY_STEP} more`}
          </Button>
        )}
      </div>
    </div>
  )
}

function InsightRow({ insight }: { insight: Insight }) {
  const { title, week, month, tone, mild, causes } = insight
  const [open, setOpen] = useState(false)
  const when = `${week > 0 ? `${times(week)} this week and ${times(month)} this month` : `${times(month)} this month, not this week`}${mild ? ', all mild' : ''}.`
  // Every cause line names its own symptom, so grouped lines read on their own.
  // Collapsed shows the first; the rest, the user's numbers and the guides open on tap.
  const lines = [...new Set(causes.map((c) => c.line))]
  const evidence = causes.flatMap((c) => c.evidence)
  const guides = [...new Set(causes.map((c) => c.guide).filter((g): g is string => !!g))]
  const more = lines.length > 1 || evidence.length > 0 || guides.length > 0
  const head = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-sm">
          <span className="font-medium text-foreground">{title}</span>{' '}
          <span className="text-muted-foreground">{when}</span>
        </span>
        {lines[0] && <span className={cn('mt-1 block text-sm text-foreground/85', !open && 'line-clamp-2')}>{lines[0]}</span>}
      </span>
      {more && (open
        ? <ChevronUp className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        : <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />)}
    </>
  )
  const headCls = 'flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left'
  return (
    <li className={cn('rounded-lg border-l-2 bg-muted/40', tone === 'bad' ? 'border-l-destructive' : 'border-l-amber-500')}>
      {more ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(headCls, 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50')}
        >
          {head}
        </button>
      ) : (
        <div className={headCls}>{head}</div>
      )}
      {open && (
        <div className="flex flex-col gap-1 px-3 pb-3">
          {lines.slice(1).map((l) => <p key={l} className="text-sm text-foreground/85">{l}</p>)}
          {evidence.map((e) => <p key={e} className="text-xs text-muted-foreground">{e}</p>)}
          {guides.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {guides.map((g) => (
                <a key={g} href={`/guides/${g}`} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--accent-ink)] underline-offset-2 hover:underline">
                  {guideTitle(g)} <ArrowUpRight className="size-3" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

const guideTitle = (slug: string) =>
  ({ 'hematocrit-on-trt-what-to-do': 'High hematocrit', 'estradiol-on-trt-without-an-ai': 'Estradiol without an AI', 'peptides-mk-677-blood-sugar': 'MK-677 and blood sugar' } as Record<string, string>)[slug]
  ?? `${slug.split('-').map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ').replace(/^(Tsh|Dht|Psa|Lh|Fsh|Igf1|Crp|Shbg)\b/, (m) => m.toUpperCase())} guide`
