import { useMemo, useState } from 'react'
import { Brain, Plus, Trash2 } from 'lucide-react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Symptom } from '../lib/db'
import { useUndoableDelete } from '../lib/useUndoableDelete'
import { DashGrid } from '../components/dashboard/Grid'
import { PanelCard, PanelEmpty } from '../components/dashboard/PanelCard'
import { ChartCard } from '../components/dashboard/ChartCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

const symptomChartConfig = {
  mood:   { label: 'Mood',   color: 'var(--foreground)' },
  energy: { label: 'Energy', color: '#c5821e' },
  sleep:  { label: 'Sleep',  color: 'var(--chart-2)' },
  libido: { label: 'Libido', color: '#9b4ec2' },
} satisfies ChartConfig

// Symptoms come in two flavours that need to render differently in the
// check-in: positive symptoms (high = good — e.g. mood, energy) and
// negative symptoms (high = bad — e.g. headache, joint pain). The
// scale chips use the same 1-5 control but the color logic differs.
type Direction = 'positive' | 'negative'

type SymptomDef = {
  key: keyof Symptom
  label: string
  direction: Direction
}

const POSITIVE: SymptomDef[] = [
  { key: 'mood',   label: 'Mood',   direction: 'positive' },
  { key: 'energy', label: 'Energy', direction: 'positive' },
  { key: 'sleep',  label: 'Sleep',  direction: 'positive' },
  { key: 'libido', label: 'Libido', direction: 'positive' },
]

const NEGATIVE: SymptomDef[] = [
  { key: 'waterRetention',    label: 'Water retention',    direction: 'negative' },
  { key: 'acne',              label: 'Acne',               direction: 'negative' },
  { key: 'nippleSensitivity', label: 'Nipple sensitivity', direction: 'negative' },
  { key: 'jointPain',         label: 'Joint pain',         direction: 'negative' },
  { key: 'headache',          label: 'Headache',           direction: 'negative' },
]

// Tone for a chip given the symptom direction + selected value.
// Positive symptoms: value 4-5 reads as good, 1-2 as bad.
// Negative symptoms: value 4-5 reads as bad, 1-2 as fine.
// Value 3 stays neutral (the "no opinion" middle).
function chipTone(value: number, direction: Direction): 'good' | 'warn' | 'bad' | 'neutral' {
  if (value === 3) return 'neutral'
  if (direction === 'positive') {
    if (value >= 4) return 'good'
    return 'bad'
  } else {
    if (value >= 4) return 'bad'
    if (value <= 2) return 'good'
    return 'warn'
  }
}

function todayIsoLocal(): string {
  // Trim seconds + tz so the value fits a datetime-local input.
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16)
}

export function Symptoms() {
  const symptoms = useLiveQuery(() => db.symptoms.orderBy('recordedAt').reverse().toArray(), [], [])
  const deleteWithUndo = useUndoableDelete()
  const [draft, setDraft] = useState<Partial<Symptom>>({ recordedAt: todayIsoLocal() })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!draft.recordedAt || saving) return
    setSaving(true)
    try {
      await db.symptoms.add({
        recordedAt: new Date(draft.recordedAt).toISOString(),
        libido: draft.libido,
        sleep: draft.sleep,
        mood: draft.mood,
        energy: draft.energy,
        waterRetention: draft.waterRetention,
        acne: draft.acne,
        nippleSensitivity: draft.nippleSensitivity,
        jointPain: draft.jointPain,
        headache: draft.headache,
        notes: draft.notes,
      })
      setDraft({ recordedAt: todayIsoLocal() })
    } finally {
      setSaving(false)
    }
  }

  const hasAnyValue = useMemo(
    () =>
      [...POSITIVE, ...NEGATIVE].some((s) => typeof draft[s.key] === 'number') ||
      Boolean(draft.notes?.trim()),
    [draft],
  )

  const chartData = useMemo(
    () =>
      symptoms
        .slice()
        .reverse()
        .slice(-30)
        .map((s) => ({
          date: format(parseISO(s.recordedAt), 'MMM d'),
          mood: s.mood,
          energy: s.energy,
          sleep: s.sleep,
          libido: s.libido,
        })),
    [symptoms],
  )

  return (
    <DashGrid>
      {/* ── Today's check-in ── */}
      <PanelCard
        className="md:col-span-2 xl:col-span-3"
        title="How are you feeling?"
        subtitle="Today's check-in"
        action={
          <Input
            type="datetime-local"
            className="h-8 w-auto text-xs"
            value={draft.recordedAt}
            onChange={(e) => setDraft({ ...draft, recordedAt: e.target.value })}
            aria-label="When"
          />
        }
      >
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Positive — higher is better</p>
        <div className="flex flex-col">
          {POSITIVE.map((s) => (
            <SymptomScale key={s.key as string} def={s} value={draft[s.key] as number | undefined} onChange={(v) => setDraft({ ...draft, [s.key]: v })} />
          ))}
        </div>

        <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Side effects — higher is worse</p>
        <div className="flex flex-col">
          {NEGATIVE.map((s) => (
            <SymptomScale key={s.key as string} def={s} value={draft[s.key] as number | undefined} onChange={(v) => setDraft({ ...draft, [s.key]: v })} />
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-1.5">
          <label htmlFor="sym-notes" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes (optional)</label>
          <textarea
            id="sym-notes"
            rows={2}
            className="rounded-md border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            placeholder="What's affecting these today?"
            value={draft.notes ?? ''}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={!hasAnyValue || saving}>
            <Plus className="size-4" /> {saving ? 'Saving…' : 'Save check-in'}
          </Button>
        </div>
      </PanelCard>

      {/* ── Trend ── */}
      <ChartCard className="md:col-span-2 xl:col-span-3" title="Core scores" subtitle="Last 30 check-ins">
        {chartData.length > 1 ? (
          <ChartContainer config={symptomChartConfig} className="h-[260px] w-full">
            <LineChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tickLine={false} axisLine={false} width={20} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="mood" stroke="var(--color-mood)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="energy" stroke="var(--color-energy)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="sleep" stroke="var(--color-sleep)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="libido" stroke="var(--color-libido)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        ) : (
          <PanelEmpty icon={Brain} title="Need a few entries" detail="Log at least two days to see a trend." />
        )}
      </ChartCard>

      {/* ── Recent entries ── */}
      <PanelCard className="md:col-span-2 xl:col-span-6" title="Recent check-ins">
        {symptoms.length === 0 ? (
          <PanelEmpty icon={Brain} title="No check-ins yet" detail="Log how you feel above to start a trend." />
        ) : (
          <ul className="flex flex-col">
            {symptoms.slice(0, 8).map((s, i) => (
              <li key={s.id} className={`relative py-2.5 pr-9 ${i > 0 ? 'border-t' : ''}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <strong className="text-sm">{format(parseISO(s.recordedAt), 'EEE MMM d')}</strong>
                  <span className="text-xs text-muted-foreground">{formatDistanceToNow(parseISO(s.recordedAt), { addSuffix: true })}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(['mood', 'energy', 'sleep', 'libido'] as const).map((k) => {
                    const v = s[k]
                    if (typeof v !== 'number') return null
                    return (
                      <span
                        key={k}
                        className={[
                          'rounded-full px-2 py-0.5 text-[11px] tabular-nums',
                          chipTone(v, 'positive') === 'good'
                            ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                            : chipTone(v, 'positive') === 'bad'
                              ? 'bg-destructive/12 text-destructive'
                              : 'bg-secondary text-muted-foreground',
                        ].join(' ')}
                      >
                        {k[0].toUpperCase() + k.slice(1)} {v}
                      </span>
                    )
                  })}
                </div>
                {s.notes && <p className="mt-1.5 text-xs text-muted-foreground">{s.notes}</p>}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-2 size-7 text-muted-foreground hover:text-destructive"
                  aria-label="Delete check-in"
                  onClick={() => {
                    const snapshot = { ...s }
                    void deleteWithUndo({ label: 'Check-in deleted', remove: () => db.symptoms.delete(s.id!), restore: () => db.symptoms.put(snapshot) })
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </DashGrid>
  )
}

const SCALE_TONE: Record<'good' | 'warn' | 'bad' | 'neutral', string> = {
  good: 'border-emerald-500 bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  warn: 'border-amber-500 bg-amber-500/12 text-amber-700 dark:text-amber-400',
  bad: 'border-destructive bg-destructive/12 text-destructive',
  neutral: 'border-foreground bg-accent text-foreground',
}

function SymptomScale({
  def,
  value,
  onChange,
}: {
  def: SymptomDef
  value: number | undefined
  onChange: (v: number) => void
}) {
  return (
    <div className="grid grid-cols-[minmax(140px,1.5fr)_auto] items-center gap-4 py-1.5 max-md:grid-cols-1 max-md:gap-1">
      <span className="text-sm">{def.label}</span>
      <div className="flex gap-1 max-md:w-full" role="radiogroup" aria-label={def.label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n
          const tone = selected ? chipTone(n, def.direction) : 'neutral'
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              className={[
                'size-8 rounded-md border font-mono text-[13px] tabular-nums transition-colors max-md:flex-1',
                selected
                  ? `font-semibold ${SCALE_TONE[tone]}`
                  : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
              ].join(' ')}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}

