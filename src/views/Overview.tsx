import { lazy, Suspense, useMemo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CalendarClock, FlaskConical, HeartPulse, Scale, Settings, Syringe } from 'lucide-react'
import type { BodyMetric, Compound, InjectionLog, Symptom, VitalLog } from '../lib/db'
import { ALL_SYMPTOMS, chipTone } from '../lib/symptoms'
import { cn } from '@/lib/utils'
import type { View } from '../app/views'

const ActiveLevelsCard = lazy(() => import('../components/ActiveLevelsCard').then((m) => ({ default: m.ActiveLevelsCard })))
const BpTrendCard = lazy(() => import('../components/BpTrendCard').then((m) => ({ default: m.BpTrendCard })))

const DAY = 86_400_000

type LaunchItem = { view: View; label: string; sub: string; icon: LucideIcon; chip: string }

// Top launcher — the things you add to your log.
const CARDS: LaunchItem[] = [
  { view: 'add-injection', label: 'Injection', sub: 'Log a shot', icon: Syringe, chip: 'bg-primary/12 text-primary' },
  { view: 'add-weight', label: 'Weight', sub: 'Log body weight', icon: Scale, chip: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  { view: 'add-bp', label: 'Blood pressure', sub: 'Log a reading', icon: HeartPulse, chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  { view: 'labs', label: 'Lab results', sub: 'Upload or add', icon: FlaskConical, chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
]

// Bottom launcher — navigation to full pages (replaces the old sidebar).
const BOTTOM_CARDS: LaunchItem[] = [
  { view: 'timeline', label: 'Timeline', sub: 'All your activity', icon: CalendarClock, chip: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  { view: 'settings', label: 'Settings', sub: 'Account & data', icon: Settings, chip: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
]

function LaunchCard({ card, onNavigate }: { card: LaunchItem; onNavigate: (v: View) => void }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(card.view)}
      className="flex min-h-[130px] flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${card.chip}`}>
        <card.icon className="size-6" />
      </span>
      <div className="mt-auto">
        <p className="text-[15px] font-semibold leading-tight text-foreground">{card.label}</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{card.sub}</p>
      </div>
    </button>
  )
}

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

  // Symptoms — compact good/watch tally over the last 7 days (full digest lives
  // in the injection check-in; this is the at-a-glance version).
  const sym = useMemo(() => {
    const cutoff = Date.now() - 7 * DAY
    const recent = symptoms.filter((s) => new Date(s.recordedAt).getTime() >= cutoff)
    let goodCount = 0
    let watchCount = 0
    for (const s of recent) {
      for (const def of ALL_SYMPTOMS) {
        const v = s[def.key]
        if (typeof v !== 'number') continue
        const t = chipTone(v, def.direction)
        if (t === 'good') goodCount += 1
        else if (t === 'bad' || t === 'warn') watchCount += 1
      }
    }
    return { checkIns: recent.length, goodCount, watchCount }
  }, [symptoms])

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
            <LaunchCard key={c.view} card={c} onNavigate={onNavigate} />
          ))}
        </div>
      </div>

      {/* BP · Weight · How you've been — three compact widgets in a row */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {/* Blood pressure */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Blood pressure</p>
          <p className={cn('mt-1.5 font-mono text-xl font-semibold tabular-nums sm:text-2xl', bpTone)}>
            {bp.sys !== undefined ? `${bp.sys}/${bp.dia}` : '—'}
          </p>
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
            {bp.n ? `7-day avg · ${bp.n} reading${bp.n === 1 ? '' : 's'}` : 'No readings this week'}
          </p>
          {bp.spark.length > 1 && <div className="mt-2 hidden text-muted-foreground sm:block"><MiniSpark values={bp.spark} /></div>}
        </div>

        {/* Weight */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Weight</p>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums sm:text-2xl">
            {weight ? weight.kg : '—'}<small className="ml-1 text-xs font-normal text-muted-foreground">kg</small>
          </p>
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
            {weight
              ? (weight.delta !== undefined && Math.abs(weight.delta) >= 0.05 ? `${weight.delta > 0 ? '+' : ''}${weight.delta.toFixed(1)} kg vs last` : 'No change')
              : 'Not logged'}
          </p>
          {weight && weight.spark.length > 1 && <div className="mt-2 hidden text-muted-foreground sm:block"><MiniSpark values={weight.spark} /></div>}
        </div>

        {/* How you've been */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">How you've been</p>
          {sym.checkIns === 0 ? (
            <>
              <p className="mt-1.5 text-xl font-semibold text-muted-foreground sm:text-2xl">—</p>
              <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">No check-ins this week</p>
            </>
          ) : (
            <>
              <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums sm:text-2xl">
                <span className="text-emerald-700 dark:text-emerald-400">{sym.goodCount}</span>
                <span className="mx-1 text-muted-foreground/50">/</span>
                <span className="text-destructive">{sym.watchCount}</span>
              </p>
              <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">good / to watch · {sym.checkIns} check-in{sym.checkIns === 1 ? '' : 's'}</p>
            </>
          )}
        </div>
      </div>

      {/* Drug levels through time */}
      {injections.length > 0 && (
        <Suspense fallback={null}>
          <ActiveLevelsCard compounds={compounds} injections={injections} />
        </Suspense>
      )}

      {/* Blood pressure trend — full history chart */}
      {vitals.length > 0 && (
        <Suspense fallback={null}>
          <BpTrendCard vitals={vitals} />
        </Suspense>
      )}

      {/* Navigation launcher — replaces the sidebar */}
      <div>
        <p className="mb-3 px-0.5 text-xs font-medium uppercase tracking-[0.02em] text-muted-foreground">More</p>
        <div className="grid grid-cols-2 gap-4">
          {BOTTOM_CARDS.map((c) => (
            <LaunchCard key={c.view} card={c} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    </div>
  )
}
