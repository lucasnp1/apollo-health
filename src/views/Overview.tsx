import { lazy, Suspense, useMemo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CalendarClock, FlaskConical, HeartPulse, Scale, Settings, Syringe } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { format } from 'date-fns'
import type { BodyMetric, Compound, InjectionLog, Symptom, VitalLog } from '../lib/db'
import { ALL_SYMPTOMS, chipTone } from '../lib/symptoms'
import { Reveal, spring } from '../components/motion'
import { cn } from '@/lib/utils'
import type { View } from '../app/views'

const ActiveLevelsCard = lazy(() => import('../components/ActiveLevelsCard').then((m) => ({ default: m.ActiveLevelsCard })))
const BpTrendCard = lazy(() => import('../components/BpTrendCard').then((m) => ({ default: m.BpTrendCard })))

const DAY = 86_400_000

type LaunchItem = { view: View; label: string; sub: string; icon: LucideIcon; chip: string; primary?: boolean }

// Top launcher — the things you add to your log. Injection is the hero action.
const CARDS: LaunchItem[] = [
  { view: 'add-injection', label: 'Injection', sub: 'Log a shot', icon: Syringe, chip: 'bg-primary text-primary-foreground', primary: true },
  { view: 'add-weight', label: 'Weight', sub: 'Log body weight', icon: Scale, chip: 'bg-blue-500/12 text-blue-600 dark:text-blue-400' },
  { view: 'add-bp', label: 'Blood pressure', sub: 'Log a reading', icon: HeartPulse, chip: 'bg-rose-500/12 text-rose-600 dark:text-rose-400' },
  { view: 'labs', label: 'Lab results', sub: 'Upload or add', icon: FlaskConical, chip: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' },
]

// Bottom launcher — navigation to full pages (replaces the old sidebar).
const BOTTOM_CARDS: LaunchItem[] = [
  { view: 'timeline', label: 'Timeline', sub: 'All your activity', icon: CalendarClock, chip: 'bg-violet-500/12 text-violet-600 dark:text-violet-400' },
  { view: 'settings', label: 'Settings', sub: 'Account & data', icon: Settings, chip: 'bg-muted text-muted-foreground' },
]

function LaunchCard({ card, onNavigate, delay = 0 }: { card: LaunchItem; onNavigate: (v: View) => void; delay?: number }) {
  const reduce = useReducedMotion() ?? false
  return (
    <Reveal delay={delay} className="min-w-0">
      <motion.button
        type="button"
        onClick={() => onNavigate(card.view)}
        whileHover={reduce ? undefined : { y: -3 }}
        whileTap={reduce ? undefined : { scale: 0.98 }}
        transition={spring}
        className={cn(
          'group flex h-full min-h-[132px] w-full flex-col items-start gap-3 rounded-2xl border p-5 text-left shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          card.primary ? 'border-primary/35 bg-primary/[0.06]' : 'border-border/70 bg-card',
        )}
      >
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105', card.chip)}>
          <card.icon className="size-6" />
        </span>
        <div className="mt-auto">
          <p className="font-display text-[15px] font-semibold leading-tight tracking-[-0.01em] text-foreground">{card.label}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{card.sub}</p>
        </div>
      </motion.button>
    </Reveal>
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

// Shared shell for the three at-a-glance widgets.
function MiniStat({ label, delay, children }: { label: string; delay: number; children: React.ReactNode }) {
  return (
    <Reveal delay={delay} className="min-w-0">
      <div className="h-full rounded-xl border border-border/70 bg-card p-4 shadow-[var(--shadow-card)]">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {children}
      </div>
    </Reveal>
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
  const greeting = useMemo(() => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  }, [])
  const today = format(new Date(), 'EEEE, d MMMM')

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

  // Symptoms — compact good/watch tally over the last 7 days.
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
    <div className="mx-auto flex max-w-3xl flex-col gap-7">
      {/* Greeting hero */}
      <Reveal>
        <div className="pt-1">
          <p className="text-[13px] font-medium text-muted-foreground">{today}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-[34px]">{greeting}</h1>
        </div>
      </Reveal>

      {/* Launcher */}
      <div>
        <p className="mb-3 px-0.5 text-[13px] font-medium text-muted-foreground">Add to your log</p>
        <div className="grid grid-cols-2 gap-4">
          {CARDS.map((c, i) => (
            <LaunchCard key={c.view} card={c} onNavigate={onNavigate} delay={0.04 * i} />
          ))}
        </div>
      </div>

      {/* BP · Weight · How you've been — three at-a-glance widgets */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <MiniStat label="Blood pressure" delay={0.02}>
          <p className={cn('mt-1.5 font-mono text-xl font-semibold tabular-nums sm:text-2xl', bpTone)}>
            {bp.sys !== undefined ? `${bp.sys}/${bp.dia}` : '—'}
          </p>
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
            {bp.n ? `7-day avg · ${bp.n} reading${bp.n === 1 ? '' : 's'}` : 'No readings this week'}
          </p>
          {bp.spark.length > 1 && <div className="mt-2 hidden text-muted-foreground sm:block"><MiniSpark values={bp.spark} /></div>}
        </MiniStat>

        <MiniStat label="Weight" delay={0.06}>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums sm:text-2xl">
            {weight ? weight.kg : '—'}<small className="ml-1 text-xs font-normal text-muted-foreground">kg</small>
          </p>
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
            {weight
              ? (weight.delta !== undefined && Math.abs(weight.delta) >= 0.05 ? `${weight.delta > 0 ? '+' : ''}${weight.delta.toFixed(1)} kg vs last` : 'No change')
              : 'Not logged'}
          </p>
          {weight && weight.spark.length > 1 && <div className="mt-2 hidden text-muted-foreground sm:block"><MiniSpark values={weight.spark} /></div>}
        </MiniStat>

        <MiniStat label="How you've been" delay={0.1}>
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
        </MiniStat>
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
        <p className="mb-3 px-0.5 text-[13px] font-medium text-muted-foreground">More</p>
        <div className="grid grid-cols-2 gap-4">
          {BOTTOM_CARDS.map((c, i) => (
            <LaunchCard key={c.view} card={c} onNavigate={onNavigate} delay={0.04 * i} />
          ))}
        </div>
      </div>
    </div>
  )
}
