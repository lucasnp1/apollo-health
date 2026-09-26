import { useMemo, useState } from 'react'
import { Check, HeartPulse, Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { db, type Symptom } from '../lib/db'
import { ALL_SYMPTOMS, NEGATIVE, POSITIVE, chipTone, customDefs, customKey, ratingOf, withRating, type SymptomDef } from '../lib/symptoms'
import { TimeRangePicker } from './TimeRangePicker'
import { filterByRange, type TimeRange } from '../lib/timeRange'
import { ChartCard } from './dashboard/ChartCard'
import { PanelEmpty } from './dashboard/PanelCard'
import { SymptomScale } from './SymptomScale'
import { FeedList, FeedRow, type FeedFact } from './FeedList'
import { Button } from '@/components/ui/button'
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

function factsFor(s: Symptom, defs: SymptomDef[]): FeedFact[] {
  return defs
    .map((d) => ({ d, v: ratingOf(s, d) }))
    .filter((x): x is { d: SymptomDef; v: number } => x.v !== undefined)
    .map(({ d, v }) => ({ text: `${d.label} ${v}`, tone: chipTone(v, d.direction) }))
}

export function WellbeingCard({ symptoms }: { symptoms: Symptom[] }) {
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
    () => symptoms.slice().sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 4),
    [symptoms],
  )

  // Custom symptoms are whatever the user has ever rated, plus anything added
  // in this draft. They need no registry: each rating carries its own label and
  // direction, so the list rebuilds itself from the data.
  const customs = useMemo(() => customDefs([...symptoms, draft]), [symptoms, draft])
  const goodDefs = useMemo(() => [...POSITIVE, ...customs.filter((d) => d.direction === 'positive')], [customs])
  const watchDefs = useMemo(() => [...NEGATIVE, ...customs.filter((d) => d.direction === 'negative')], [customs])
  const allDefs = useMemo(() => [...ALL_SYMPTOMS, ...customs], [customs])

  const anyRated = allDefs.some((d) => ratingOf(draft, d) !== undefined)

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

      {recent.length > 0 && (
        <div className="mt-5">
          <p className="eyebrow mb-2">Recent check-ins</p>
          <FeedList>
            {recent.map((s) => (
              <FeedRow
                key={s.id}
                icon={HeartPulse}
                iconTone="neutral"
                title={format(parseISO(s.recordedAt), 'EEEE d MMM')}
                when={format(parseISO(s.recordedAt), 'HH:mm')}
                whenShort={format(parseISO(s.recordedAt), 'HH:mm')}
                note={s.notes}
                clampNote
                facts={factsFor(s, allDefs)}
              />
            ))}
          </FeedList>
        </div>
      )}
    </ChartCard>
  )
}
