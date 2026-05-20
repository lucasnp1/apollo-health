import { useMemo, useState } from 'react'
import { Check, HeartPulse, Plus, Target, Trash2, TrendingDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Goal, type MarkerTarget } from '../lib/db'
import { buildWeightDoseSeries, weightSummary } from '../lib/insights'
import { allMarkerMeta, metaForKey } from '../lib/markers'
import { EmptyState } from '../components/EmptyState'
import { RangeBar } from '../components/RangeBar'

export function Targets() {
  return (
    <div className="content-grid">
      <section className="surface col-12">
        <GoalEditor />
      </section>
      <section className="surface col-12">
        <MarkerTargetEditor />
      </section>
    </div>
  )
}

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
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Targets</span>
          <h3>Goals</h3>
        </div>
        <span className="safety-chip">You set the bar</span>
      </div>

      {goals.length > 0 ? (
        <div className="stack">
          {goals.map((g) => {
            const progress = computeProgress(g, { weight: weightLatest, bpSys: bpLatest?.systolic, results })
            return (
              <div className="row" key={g.id} style={{ gridTemplateColumns: '24px 1fr auto auto auto' }}>
                <Icon kind={g.kind} />
                <div>
                  <strong>{g.label}</strong>
                  <span className="sub">
                    Started {format(parseISO(g.startedAt), 'MMM d, yyyy')}
                    {g.achievedAt ? ` · achieved ${format(parseISO(g.achievedAt), 'MMM d')}` : ''}
                  </span>
                </div>
                <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-dim)' }}>
                  {progress.currentLabel} → {progress.targetLabel}
                </span>
                <span className={`chip ${progress.tone}`}>{progress.headline}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {!g.achievedAt && progress.tone === 'good' && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Mark achieved"
                      onClick={() => db.goals.update(g.id!, { achievedAt: new Date().toISOString() })}
                    >
                      <Check size={14} />
                    </button>
                  )}
                  <button type="button" className="icon-button danger" aria-label="Delete goal" onClick={() => db.goals.delete(g.id!)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState icon={Target} title="No goals yet" detail="A goal turns into progress bars and remaining-delta callouts across the app." />
      )}

      <div className="form-grid">
        <label>
          Kind
          <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Goal['kind'] })}>
            <option value="weight">Body weight</option>
            <option value="bp">Blood pressure (systolic)</option>
            <option value="marker">Lab marker</option>
          </select>
        </label>
        {draft.kind === 'marker' && (
          <label>
            Marker
            <select value={draft.marker} onChange={(e) => setDraft({ ...draft, marker: e.target.value })}>
              <option value="">Select…</option>
              {allMarkerMeta().map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Target value
          <input inputMode="decimal" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
        </label>
        <label className="wide-field">
          Label (optional)
          <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder={defaultLabel(draft.kind, draft.marker)} />
        </label>
        <button type="button" className="primary-button wide-field" onClick={addGoal}>
          <Plus size={15} /> Add goal
        </button>
      </div>
    </>
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
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Personal optimal</span>
          <h3>Marker targets</h3>
        </div>
        <span className="safety-chip">Overrides catalog ranges in Labs</span>
      </div>
      <p className="panel-note">
        Default ranges from the catalog (e.g. E2 20–40 pg/mL) are starting points. Override them here when you want a tighter
        or different personal goal range — the Labs view will use your numbers in range bars.
      </p>

      {targets.length > 0 ? (
        <div>
          {targets.map((t) => {
            const meta = metaForKey(t.marker)
            const label = meta?.label ?? t.marker
            return (
              <div key={t.id} className="range-bar-row">
                <div className="marker">
                  {label}
                  <small>{t.rationale || (meta?.unit ?? t.unit ?? '')}</small>
                </div>
                <RangeBar value={t.low !== undefined && t.high !== undefined ? (t.low + t.high) / 2 : undefined} low={t.low} high={t.high} />
                <div className="value">
                  <span className="range-pill">{t.low ?? '?'} – {t.high ?? '?'} {t.unit ?? meta?.unit ?? ''}</span>
                </div>
                <div className="delta">
                  <button type="button" className="icon-button danger" aria-label="Remove target" onClick={() => db.markerTargets.delete(t.id!)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState icon={Target} title="No personal ranges" detail="Catalog defaults are used until you set your own." />
      )}

      <div className="form-grid">
        <label className="wide-field">
          Marker
          <select value={draft.marker} onChange={(e) => {
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
        </label>
        <label>
          Low
          <input inputMode="decimal" value={draft.low ?? ''} onChange={(e) => setDraft({ ...draft, low: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </label>
        <label>
          High
          <input inputMode="decimal" value={draft.high ?? ''} onChange={(e) => setDraft({ ...draft, high: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </label>
        <label>
          Unit
          <input value={draft.unit ?? ''} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
        </label>
        <label className="wide-field">
          Rationale (optional)
          <input value={draft.rationale ?? ''} onChange={(e) => setDraft({ ...draft, rationale: e.target.value })} placeholder="Why this range matters to me" />
        </label>
        <button type="button" className="primary-button wide-field" onClick={save}>
          <Plus size={15} /> Save target
        </button>
      </div>
    </>
  )
}
