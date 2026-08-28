/**
 * ActiveLevelsCard — past-only stacked area chart of active compound levels.
 *
 * Each compound that has at least one logged injection contributes a series
 * (mg/day equivalent) computed by summing PK decay across every past
 * injection. Series stack so you see total load + per-compound breakdown.
 *
 * Window: last 60 days, daily resolution. No projections — only what you
 * have actually injected. Legend shows each compound's current level and
 * its 60-day peak so you can see at a glance when things stacked highest.
 */
import { useCallback, useMemo, useState } from 'react'
import { format, startOfWeek } from 'date-fns'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { Compound, InjectionLog } from '../lib/db'
import { findPKCompound, PK_COMPOUNDS } from '../lib/pk'
import { PanelCard, PanelEmpty } from './dashboard/PanelCard'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Activity, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

const MS_PER_DAY = 86_400_000
const WINDOW_DAYS = 60

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length)
}

// Same ester-name fallbacks the timeline card uses, kept inline so this card
// doesn't depend on PKOverviewCard.
function inferEster(name: string): string | undefined {
  const lower = name.toLowerCase()
  const forms = [...new Set(PK_COMPOUNDS.map((c) => c.form).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
  return forms.find((f) => lower.includes(f.toLowerCase()))
}

type SeriesPoint = Record<string, number | string>

type Legend = {
  key: string
  name: string
  color: string
  current: number
  peak: { level: number; dayNum: number } | null
  // 7-day mean now vs 7-day mean a week earlier — direction of travel.
  trend: 'up' | 'down' | 'flat'
  trendPct: number
  // Coefficient of variation over the trailing 14 days. Lower = more
  // even serum levels (less peak/trough swing); higher = spikier.
  stability: 'stable' | 'variable' | 'spiky'
  cv: number
}

// Plain-language status from the 7-day trend — no jargon.
const STATUS_META = {
  up:   { label: 'Rising',   icon: ArrowUpRight,   cls: 'text-emerald-700 dark:text-emerald-400' },
  flat: { label: 'Steady',   icon: Minus,          cls: 'text-muted-foreground' },
  down: { label: 'Tapering', icon: ArrowDownRight, cls: 'text-amber-700 dark:text-amber-400' },
} as const

export function ActiveLevelsCard({
  compounds,
  injections,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
}) {
  const { data, legend } = useMemo(() => {
    const nowMs = Date.now()
    const anchorMs = nowMs - WINDOW_DAYS * MS_PER_DAY

    // Merge compound records by display name → one series per DRUG (all its
    // shots summed), so duplicate compound rows don't split "Testosterone E"
    // into several tooltip lines. Result: one total per compound, per shot.
    const groups = new Map<string, { name: string; color: string; ester?: Compound['ester']; doses: Array<{ ms: number; dose: number }> }>()
    for (const c of compounds) {
      if (!c.id) continue
      const doses = injections.filter((i) => i.compoundId === c.id && i.dose !== undefined && i.unit === 'mg')
      if (doses.length === 0) continue
      const k = c.name.trim().toLowerCase()
      let g = groups.get(k)
      if (!g) { g = { name: c.name, color: c.color ?? 'var(--primary)', ester: c.ester, doses: [] }; groups.set(k, g) }
      for (const d of doses) g.doses.push({ ms: new Date(d.takenAt).getTime(), dose: d.dose ?? 0 })
    }

    const eligible = [...groups.values()].map((g, i) => {
      const pk = findPKCompound(g.name, g.ester && g.ester !== 'Custom' ? g.ester : inferEster(g.name))
      if (!pk) return null
      return { key: `s${i}`, name: g.name, color: g.color, lambda: Math.LN2 / pk.halfLifeDays, activePct: pk.activeDosePct, doses: g.doses }
    }).filter(Boolean) as Array<{ key: string; name: string; color: string; lambda: number; activePct: number; doses: Array<{ ms: number; dose: number }> }>

    if (eligible.length === 0) {
      return { data: [] as SeriesPoint[], legend: [] as Legend[] }
    }

    // Build daily series for the past window only — past, not projected.
    const data: SeriesPoint[] = []
    const peakOf: Record<string, { level: number; dayNum: number }> = {}
    for (let d = 0; d <= WINDOW_DAYS; d++) {
      const ptMs = anchorMs + d * MS_PER_DAY
      const pt: SeriesPoint = { dayNum: d, date: format(new Date(ptMs), 'MMM d') }
      for (const c of eligible) {
        let level = 0
        for (const inj of c.doses) {
          if (inj.ms > ptMs) continue
          const tDays = (ptMs - inj.ms) / MS_PER_DAY
          level += inj.dose * (c.activePct / 100) * Math.exp(-tDays * c.lambda) * c.lambda
        }
        pt[c.key] = parseFloat(level.toFixed(2))
        const peak = peakOf[c.key]
        if (!peak || level > peak.level) peakOf[c.key] = { level, dayNum: d }
      }
      data.push(pt)
    }

    const legend: Legend[] = eligible.map((c) => {
      const last = data[data.length - 1]
      const series = data.map((pt) => (typeof pt[c.key] === 'number' ? (pt[c.key] as number) : 0))
      const recent7 = series.slice(-7)
      const prior7 = series.slice(-14, -7)
      const trailing14 = series.slice(-14)
      const meanRecent = mean(recent7)
      const meanPrior = mean(prior7)
      const trendPct = meanPrior > 0.01 ? ((meanRecent - meanPrior) / meanPrior) * 100 : 0
      const trend: Legend['trend'] = trendPct > 10 ? 'up' : trendPct < -10 ? 'down' : 'flat'
      const cv = stdev(trailing14) / Math.max(mean(trailing14), 0.01) * 100
      const stability: Legend['stability'] = cv < 15 ? 'stable' : cv < 30 ? 'variable' : 'spiky'
      return {
        key: c.key,
        name: c.name,
        color: c.color,
        current: typeof last[c.key] === 'number' ? (last[c.key] as number) : 0,
        peak: peakOf[c.key] ?? null,
        trend,
        trendPct,
        stability,
        cv,
      }
    })

    return { data, legend }
  }, [compounds, injections])

  // Raw dose totals per drug between a cutoff and now — e.g. 100mg Test 3×/wk
  // shows 300mg. Independent of PK: covers peptides and everything you inject.
  const [totalsView, setTotalsView] = useState<'7d' | 'week'>('7d')
  const totalsSince = useCallback((cutoff: number) => {
    const nowMs = Date.now()
    const compoundById = new Map(compounds.map((c) => [c.id, c]))
    const byName = new Map<string, { name: string; color: string; total: number; unit: string }>()
    for (const inj of injections) {
      if (inj.dose === undefined) continue
      const ms = new Date(inj.takenAt).getTime()
      if (ms < cutoff || ms > nowMs) continue
      const c = compoundById.get(inj.compoundId)
      if (!c) continue
      const k = c.name.trim().toLowerCase()
      let g = byName.get(k)
      if (!g) { g = { name: c.name, color: c.color ?? 'var(--primary)', total: 0, unit: inj.unit }; byName.set(k, g) }
      g.total += inj.dose
    }
    return [...byName.values()].sort((a, b) => b.total - a.total)
  }, [compounds, injections])
  // Rolling last-7-days vs the current calendar week (Sunday → now).
  const last7Totals = useMemo(() => totalsSince(Date.now() - 7 * MS_PER_DAY), [totalsSince])
  const weekTotals = useMemo(() => totalsSince(startOfWeek(new Date(), { weekStartsOn: 0 }).getTime()), [totalsSince])
  const activeTotals = totalsView === '7d' ? last7Totals : weekTotals

  const totalNow = legend.reduce((s, l) => s + l.current, 0)
  const totalPeak = useMemo(() => {
    if (data.length === 0) return 0
    let max = 0
    for (const pt of data) {
      let sum = 0
      for (const l of legend) sum += typeof pt[l.key] === 'number' ? (pt[l.key] as number) : 0
      if (sum > max) max = sum
    }
    return max
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, legend])
  const totalPct = totalPeak > 0 ? Math.round((totalNow / totalPeak) * 100) : 0

  // Plain description of how full the tank is right now.
  const overallLevel = totalPct >= 80 ? 'near your usual high'
    : totalPct >= 40 ? 'in your normal range'
    : 'on the low side'

  if (injections.length === 0) {
    return (
      <PanelCard title="Active levels" subtitle="Estimated active drug from your logged doses">
        <PanelEmpty icon={Activity} title="No injections yet" detail="Log a dose to see your active levels build here." />
      </PanelCard>
    )
  }

  const chartConfig = Object.fromEntries(
    legend.map((s) => [s.key, { label: s.name, color: s.color }]),
  )

  return (
    <PanelCard title="Active levels" subtitle={legend.length > 0 ? 'Estimated active drug in your system, from every dose logged' : 'Doses you have logged in the last 7 days'}>
      {legend.length > 0 && (<>
      <ChartContainer config={chartConfig} className="h-[200px] w-full">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            {legend.map((s) => (
              <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.55} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.06} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis tickLine={false} axisLine={false} tickMargin={4} tick={{ fontSize: 11 }} width={32} />
          <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
          {legend.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stackId="active"
              stroke={s.color}
              strokeWidth={1.5}
              fill={`url(#fill-${s.key})`}
              dot={false}
              activeDot={{ r: 3 }}
              name={s.name}
            />
          ))}
        </AreaChart>
      </ChartContainer>

      {/* Plain explainer — what the chart actually means */}
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Each shot spikes your level, then it tapers between doses. Higher = more active drug on board right now.
      </p>

      {/* "Active now" — one big number in plain language */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t pt-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Active now</span>
        <span className="font-mono text-2xl font-semibold tabular-nums">
          ≈{totalNow.toFixed(0)}
          <small className="ml-1 text-xs font-normal text-muted-foreground">mg/day</small>
        </span>
        {totalPeak > 0.1 && <span className="text-xs text-muted-foreground">— {overallLevel}</span>}
      </div>

      {/* Per-compound — plain status word + rough level, no jargon */}
      <ul className="mt-3 flex flex-col gap-2">
        {legend.map((s) => {
          const status = STATUS_META[s.trend]
          const StatusIcon = status.icon
          return (
            <li key={s.key} className="flex items-center gap-2.5 text-sm">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
              <span className={cn('flex items-center gap-1 text-xs font-medium', status.cls)}>
                <StatusIcon className="size-3.5" />
                {status.label}
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                ≈{s.current.toFixed(0)} mg/d
              </span>
            </li>
          )
        })}
      </ul>
      </>)}

      {/* Total injected — rolling 7 days or the current Sun→Sun week (always shown) */}
      <div className={legend.length > 0 ? 'mt-4 border-t pt-3' : ''}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total injected</p>
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
            {([['7d', 'Last 7 days'], ['week', 'This week']] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setTotalsView(v)}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium transition-colors',
                  totalsView === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {activeTotals.length > 0 ? (
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {activeTotals.map((w) => (
              <li key={w.name} className="flex items-center gap-2.5 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: w.color }} />
                <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                  {Math.round(w.total * 100) / 100} {w.unit}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2.5 text-sm text-muted-foreground">
            {totalsView === '7d' ? 'Nothing injected in the last 7 days.' : 'Nothing injected yet this week.'}
          </p>
        )}
        <p className="mt-1.5 text-[11px] text-muted-foreground/70">
          {totalsView === '7d' ? 'Rolling 7-day window.' : 'Since Sunday.'}
        </p>
      </div>
    </PanelCard>
  )
}
