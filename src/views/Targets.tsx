import { useMemo, useState } from 'react'
import { Check, HeartPulse, Plus, Target, Trash2, TrendingDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Goal, type MarkerTarget } from '../lib/db'
import { buildWeightDoseSeries, weightSummary } from '../lib/insights'
import { allMarkerMeta, metaForKey } from '../lib/markers'
import { RangeBar } from '../components/RangeBar'
import { SectionCard, PageGrid, EmptyHint } from '../components/Section'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function Targets() {
  return (
    <PageGrid>
      <div className="md:col-span-12"><GoalEditor /></div>
      <div className="md:col-span-12"><MarkerTargetEditor /></div>
    </PageGrid>
  )
}

const TONE_BADGE: Record<string, string> = {
  good: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  bad: 'bg-destructive/12 text-destructive',
  '': 'bg-secondary text-muted-foreground',
}

const selectClass = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// --- Goals (life-target) editor ---

function GoalEditor() {
  const goals = useLiveQuery(() => db.goals.toArray(), [], [])
  const compounds = useLiveQuery(() => db.compounds.toArray(), [], [])
  const injections = useLiveQuery(() => db.injections.toArray(), [], [])
  const vitals = useLiveQuery(() => db.vitals.orderBy('measuredAt').reverse().toArray(), [], [])
  const results = useLiveQuery(() => db.results.toArray(), [], [])

  const [draft, setDraft] = useState<{ kind: Goal['kind']; label: string; target: string; marker: string }>({
    kind: 'weight',
    label: '',
    target: '',
    marker: '',
  })

  async function addGoal() {
    if (!draft.target) return
    await db.goals.add({
      kind: draft.kind,
      label: draft.label || defaultLabel(draft.kind, draft.marker),
      target: Number(draft.target),
      marker: draft.kind === 'marker' ? draft.marker : undefined,
      startedAt: new Date().toISOString(),
    })
    setDraft({ kind: 'weight', label: '', target: '', marker: '' })
  }

  const weightLatest = weightSummary(buildWeightDoseSeries(compounds, injections)).latest
  const bpLatest = vitals[0]

  return (
    <SectionCard
      eyebrow="Targets"
      title="Goals"
      action={<Badge variant="secondary">You set the bar</Badge>}
    >
      {goals.length > 0 ? (
        <div className="mb-4 flex flex-col">
          {goals.map((g, i) => {
            const progress = computeProgress(g, { weight: weightLatest, bpSys: bpLatest?.systolic, results })
            return (
              <div key={g.id} className={cn('flex items-center gap-3 py-2.5', i > 0 && 'border-t')}>
                <span className="text-muted-foreground"><Icon kind={g.kind} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{g.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Started {format(parseISO(g.startedAt), 'MMM d, yyyy')}
                    {g.achievedAt ? ` · achieved ${format(parseISO(g.achievedAt), 'MMM d')}` : ''}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {progress.currentLabel} → {progress.targetLabel}
                </span>
                <Badge variant="secondary" className={cn('shrink-0', TONE_BADGE[progress.tone])}>{progress.headline}</Badge>
                <div className="flex shrink-0 gap-1">
                  {!g.achievedAt && progress.tone === 'good' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Mark achieved"
                      onClick={() => db.goals.update(g.id!, { achievedAt: new Date().toISOString() })}
                    >
                      <Check className="size-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" aria-label="Delete goal" onClick={() => db.goals.delete(g.id!)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyHint icon={Target} title="No goals yet" detail="A goal turns into progress bars and remaining-delta callouts across the app." />
      )}

      <div className="grid grid-cols-2 gap-3 border-t pt-4">
        <div className="flex flex-col gap-1.5">
          <Label>Kind</Label>
          <select className={selectClass} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Goal['kind'] })}>
            <option value="weight">Body weight</option>
            <option value="bp">Blood pressure (systolic)</option>
            <option value="marker">Lab marker</option>
          </select>
        </div>
        {draft.kind === 'marker' && (
          <div className="flex flex-col gap-1.5">
            <Label>Marker</Label>
            <select className={selectClass} value={draft.marker} onChange={(e) => setDraft({ ...draft, marker: e.target.value })}>
              <option value="">Select…</option>
              {allMarkerMeta().map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-target">Target value</Label>
          <Input id="goal-target" inputMode="decimal" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="goal-label">Label (optional)</Label>
          <Input id="goal-label" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder={defaultLabel(draft.kind, draft.marker)} />
        </div>
        <Button className="col-span-2" onClick={addGoal}>
          <Plus className="size-4" /> Add goal
        </Button>
      </div>
    </SectionCard>
  )
}

function Icon({ kind }: { kind: Goal['kind'] }) {
  const map: Record<Goal['kind'], LucideIcon> = { weight: TrendingDown, bp: HeartPulse, marker: Target }
  const I = map[kind]
  return <I size={14} />
}

function defaultLabel(kind: Goal['kind'], marker?: string) {
  switch (kind) {
    case 'weight':
      return 'Reach goal weight'
    case 'bp':
      return 'Bring systolic BP down'
    case 'marker':
      return marker ? `Reach target ${metaForKey(marker)?.label ?? marker}` : 'Reach target marker'
  }
}

type ProgressView = {
  currentLabel: string
  targetLabel: string
  headline: string
  tone: 'good' | 'warn' | 'bad' | ''
}

function computeProgress(
  goal: Goal,
  ctx: { weight?: number; bpSys?: number; results: Array<{ marker: string; value?: number }> },
): ProgressView {
  if (goal.kind === 'weight') {
    if (ctx.weight === undefined) return { currentLabel: '—', targetLabel: `${goal.target} kg`, headline: 'No data', tone: '' }
    const delta = goal.target - ctx.weight
    return {
      currentLabel: `${ctx.weight.toFixed(1)} kg`,
      targetLabel: `${goal.target.toFixed(1)} kg`,
      headline: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg to go`,
      tone: Math.abs(delta) < 0.5 ? 'good' : delta < 0 ? 'good' : 'warn',
    }
  }
  if (goal.kind === 'bp') {
    if (ctx.bpSys === undefined) return { currentLabel: '—', targetLabel: String(goal.target), headline: 'No data', tone: '' }
    const delta = ctx.bpSys - goal.target
    return {
      currentLabel: String(ctx.bpSys),
      targetLabel: String(goal.target),
      headline: `${delta <= 0 ? 'On target' : `${delta} over`}`,
      tone: delta <= 0 ? 'good' : delta < 10 ? 'warn' : 'bad',
    }
  }
  // marker
  if (!goal.marker) return { currentLabel: '—', targetLabel: String(goal.target), headline: 'Pick a marker', tone: '' }
  const meta = metaForKey(goal.marker)
  const aliases = meta?.label ? [meta.label.toLowerCase()] : [goal.marker.toLowerCase()]
  const matching = ctx.results.filter((r) => aliases.some((a) => r.marker.toLowerCase().includes(a)))
  const latest = matching[matching.length - 1]
  if (!latest?.value) return { currentLabel: '—', targetLabel: String(goal.target), headline: 'No data', tone: '' }
  const delta = latest.value - goal.target
  return {
    currentLabel: `${latest.value}`,
    targetLabel: `${goal.target}`,
    headline: `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`,
    tone: Math.abs(delta) < goal.target * 0.05 ? 'good' : '',
  }
}

// --- Marker target (personal reference range) editor ---

function MarkerTargetEditor() {
  const targets = useLiveQuery(() => db.markerTargets.toArray(), [], [])
  const [draft, setDraft] = useState<Partial<MarkerTarget>>({ marker: '', low: undefined, high: undefined, unit: '', rationale: '' })

  const catalog = useMemo(() => allMarkerMeta(), [])
  const indexByKey = useMemo(() => new Map(targets.map((t) => [t.marker, t])), [targets])

  async function save() {
    if (!draft.marker) return
    const existing = indexByKey.get(draft.marker)
    if (existing?.id) {
      await db.markerTargets.update(existing.id, {
        low: draft.low,
        high: draft.high,
        unit: draft.unit || undefined,
        rationale: draft.rationale || undefined,
      })
    } else {
      await db.markerTargets.add({
        marker: draft.marker,
        low: draft.low,
        high: draft.high,
        unit: draft.unit || undefined,
        rationale: draft.rationale || undefined,
      })
    }
    setDraft({ marker: '', low: undefined, high: undefined, unit: '', rationale: '' })
  }

  return (
    <SectionCard
      eyebrow="Personal optimal"
      title="Marker targets"
      action={<Badge variant="secondary">Overrides catalog ranges in Labs</Badge>}
    >
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        Default ranges from the catalog (e.g. E2 20–40 pg/mL) are starting points. Override them here when you want a tighter
        or different personal goal range — the Labs view will use your numbers in range bars.
      </p>

      {targets.length > 0 ? (
        <div className="mb-4 flex flex-col">
          {targets.map((t, i) => {
            const meta = metaForKey(t.marker)
            const label = meta?.label ?? t.marker
            return (
              <div key={t.id} className={cn('flex items-center gap-3 py-2.5', i > 0 && 'border-t')}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.rationale || (meta?.unit ?? t.unit ?? '')}</p>
                </div>
                <div className="w-28 shrink-0">
                  <RangeBar value={t.low !== undefined && t.high !== undefined ? (t.low + t.high) / 2 : undefined} low={t.low} high={t.high} />
                </div>
                <Badge variant="secondary" className="shrink-0 font-mono tabular-nums">
                  {t.low ?? '?'} – {t.high ?? '?'} {t.unit ?? meta?.unit ?? ''}
                </Badge>
                <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remove target" onClick={() => db.markerTargets.delete(t.id!)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyHint icon={Target} title="No personal ranges" detail="Catalog defaults are used until you set your own." />
      )}

      <div className="grid grid-cols-3 gap-3 border-t pt-4">
        <div className="col-span-3 flex flex-col gap-1.5">
          <Label>Marker</Label>
          <select className={selectClass} value={draft.marker} onChange={(e) => {
            const key = e.target.value
            const existing = indexByKey.get(key)
            const meta = metaForKey(key)
            setDraft({
              marker: key,
              low: existing?.low ?? meta?.optimal?.low,
              high: existing?.high ?? meta?.optimal?.high,
              unit: existing?.unit ?? meta?.unit ?? '',
              rationale: existing?.rationale ?? '',
            })
          }}>
            <option value="">Select marker…</option>
            {catalog.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mt-low">Low</Label>
          <Input id="mt-low" inputMode="decimal" value={draft.low ?? ''} onChange={(e) => setDraft({ ...draft, low: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mt-high">High</Label>
          <Input id="mt-high" inputMode="decimal" value={draft.high ?? ''} onChange={(e) => setDraft({ ...draft, high: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mt-unit">Unit</Label>
          <Input id="mt-unit" value={draft.unit ?? ''} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
        </div>
        <div className="col-span-3 flex flex-col gap-1.5">
          <Label htmlFor="mt-rationale">Rationale (optional)</Label>
          <Input id="mt-rationale" value={draft.rationale ?? ''} onChange={(e) => setDraft({ ...draft, rationale: e.target.value })} placeholder="Why this range matters to me" />
        </div>
        <Button className="col-span-3" onClick={save}>
          <Plus className="size-4" /> Save target
        </Button>
      </div>
    </SectionCard>
  )
}
