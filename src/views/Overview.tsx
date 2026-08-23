import { lazy, Suspense, useMemo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { FlaskConical, HeartPulse, Scale, Syringe } from 'lucide-react'
import type { BodyMetric, Compound, InjectionLog, Symptom, VitalLog } from '../lib/db'
import { SymptomSummary } from '../components/SymptomSummary'
import { PanelCard } from '../components/dashboard/PanelCard'
import { cn } from '@/lib/utils'
import type { View } from '../app/views'

const ActiveLevelsCard = lazy(() => import('../components/ActiveLevelsCard').then((m) => ({ default: m.ActiveLevelsCard })))

const DAY = 86_400_000

const CARDS: Array<{ view: View; label: string; sub: string; icon: LucideIcon; chip: string }> = [
  { view: 'add-injection', label: 'Injection', sub: 'Log a shot', icon: Syringe, chip: 'bg-primary/12 text-primary' },
  { view: 'add-weight', label: 'Weight', sub: 'Log body weight', icon: Scale, chip: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  { view: 'add-bp', label: 'Blood pressure', sub: 'Log a reading', icon: HeartPulse, chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  { view: 'labs', label: 'Lab results', sub: 'Upload or add', icon: FlaskConical, chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
]

// Simple normalized sparkline over a numeric series.
function MiniSpark({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null
  const W = 100, H = 28
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * W,
    H - ((v - min) / span) * (H - 4) - 2,
  ] as const)
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn('h-7 w-full', className)} aria-hidden="true">
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={2} fill="currentColor" />
    </svg>
  )
}

export function Overview({
  compounds,
  injections,
  vitals,
  bodyMetrics,
  symptoms,
  onNavigate,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  vitals: VitalLog[]
  bodyMetrics: BodyMetric[]
  symptoms: Symptom[]
  onNavigate: (v: View) => void
}) {
  // BP — 7-day average + a sparkline of recent systolic readings.
  const bp = useMemo(() => {
    const cutoff = Date.now() - 7 * DAY
    const recent = vitals.filter((v) => new Date(v.measuredAt).getTime() >= cutoff)
    const avg = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) / xs.length)
    const spark = vitals.slice(0, 12).slice().reverse().map((v) => v.systolic)
    if (recent.length === 0) return { spark }
    return { sys: avg(recent.map((v) => v.systolic)), dia: avg(recent.map((v) => v.diastolic)), n: recent.length, spark }
  }, [vitals])

  // Weight — latest + delta + sparkline, across bodyMetrics + injections.
  const weight = useMemo(() => {
    const pts: Array<{ ms: number; kg: number }> = []
    for (const b of bodyMetrics) if (b.weightKg !== undefined) pts.push({ ms: new Date(b.measuredAt).getTime(), kg: b.weightKg })
    for (const i of injections) if (i.weightKg !== undefined) pts.push({ ms: new Date(i.takenAt).getTime(), kg: i.weightKg })
    pts.sort((a, b) => a.ms - b.ms)
    if (pts.length === 0) return undefined
    const latest = pts[pts.length - 1]
    const prev = pts.length > 1 ? pts[pts.length - 2] : undefined
    return { kg: latest.kg, delta: prev ? latest.kg - prev.kg : undefined, spark: pts.slice(-12).map((p) => p.kg) }
  }, [bodyMetrics, injections])

  const bpTone = bp.sys !== undefined
    ? bp.sys >= 145 ? 'text-destructive' : bp.sys >= 135 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
    : ''

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {/* Launcher */}
      <div>
        <p className="mb-3 px-0.5 text-xs font-medium uppercase tracking-[0.02em] text-muted-foreground">Add to your log</p>
        <div className="grid grid-cols-2 gap-4">
          {CARDS.map((c) => (
            <button
              key={c.view}
              type="button"
              onClick={() => onNavigate(c.view)}
              className="flex min-h-[130px] flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${c.chip}`}>
                <c.icon className="size-6" />
              </span>
              <div className="mt-auto">
                <p className="text-[15px] font-semibold leading-tight text-foreground">{c.label}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{c.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* BP (7-day) + Weight — two half-height columns, above the charts */}
      <div className="grid grid-cols-2 gap-4">
        <PanelCard title="Blood pressure" subtitle="7-day average">
          <div className="flex items-end justify-between gap-3">
            <p className={cn('font-mono text-2xl font-semibold tabular-nums', bpTone)}>
              {bp.sys !== undefined ? `${bp.sys}/${bp.dia}` : '—'}
            </p>
            {bp.spark.length > 1 && <div className="w-24 text-muted-foreground"><MiniSpark values={bp.spark} /></div>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{bp.n ? `${bp.n} reading${bp.n === 1 ? '' : 's'} this week` : 'No readings in 7 days'}</p>
        </PanelCard>

        <PanelCard title="Weight" subtitle="Latest">
          <div className="flex items-end justify-between gap-3">
            <p className="font-mono text-2xl font-semibold tabular-nums">
              {weight ? weight.kg : '—'}<small className="ml-1 text-xs font-normal text-muted-foreground">kg</small>
            </p>
            {weight && weight.spark.length > 1 && <div className="w-24 text-muted-foreground"><MiniSpark values={weight.spark} /></div>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {weight
              ? (weight.delta !== undefined && Math.abs(weight.delta) >= 0.05 ? `${weight.delta > 0 ? '+' : ''}${weight.delta.toFixed(1)} kg vs last` : 'No change')
              : 'Not logged'}
          </p>
        </PanelCard>
      </div>

      {/* Drug levels through time */}
      {injections.length > 0 && (
        <Suspense fallback={null}>
          <ActiveLevelsCard compounds={compounds} injections={injections} />
        </Suspense>
      )}

      {/* How you've been — last-7-days symptom digest */}
      <SymptomSummary symptoms={symptoms} />
    </div>
  )
}
