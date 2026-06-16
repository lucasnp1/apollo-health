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
import { useMemo } from 'react'
import { format } from 'date-fns'
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

const STABILITY_META: Record<Legend['stability'], { label: string; cls: string }> = {
  stable:   { label: 'Stable',   cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  variable: { label: 'Variable', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  spiky:    { label: 'Spiky',    cls: 'bg-destructive/15 text-destructive' },
}

export function ActiveLevelsCard({
  compounds,
  injections,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
}) {
  const { data, legend, anchorMs } = useMemo(() => {
    const nowMs = Date.now()
    const anchorMs = nowMs - WINDOW_DAYS * MS_PER_DAY

    // Active compounds: any that have a logged dose in our window.
    const eligible = compounds
      .map((c) => {
        if (!c.id) return null
        const doses = injections.filter(
          (i) => i.compoundId === c.id && i.dose !== undefined && i.unit === 'mg',
        )
        if (doses.length === 0) return null
        const pk = findPKCompound(c.name, c.ester && c.ester !== 'Custom' ? c.ester : inferEster(c.name))
        if (!pk) return null
        const lambda = Math.LN2 / pk.halfLifeDays
        return {
          id: c.id,
          name: c.name,
          color: c.color ?? 'var(--primary)',
          lambda,
          activePct: pk.activeDosePct,
          doses: doses.map((d) => ({ ms: new Date(d.takenAt).getTime(), dose: d.dose ?? 0 })),
        }
      })
      .filter(Boolean) as Array<{
        id: number; name: string; color: string; lambda: number; activePct: number
        doses: Array<{ ms: number; dose: number }>
      }>

    if (eligible.length === 0) {
      return { data: [] as SeriesPoint[], legend: [] as Legend[], anchorMs }
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
        const key = `c${c.id}`
        pt[key] = parseFloat(level.toFixed(2))
        const peak = peakOf[key]
        if (!peak || level > peak.level) peakOf[key] = { level, dayNum: d }
      }
      data.push(pt)
    }

    const legend: Legend[] = eligible.map((c) => {
      const key = `c${c.id}`
      const last = data[data.length - 1]
      // Pull this compound's daily levels back out for stats math.
      const series = data.map((pt) => (typeof pt[key] === 'number' ? (pt[key] as number) : 0))
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
        key,
        name: c.name,
        color: c.color,
        current: typeof last[key] === 'number' ? (last[key] as number) : 0,
        peak: peakOf[key] ?? null,
        trend,
        trendPct,
        stability,
        cv,
      }
    })

    return { data, legend, anchorMs }
  }, [compounds, injections])

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

  if (legend.length === 0) {
    return (
      <PanelCard title="Active levels" subtitle="Stacked from logged doses (last 60 days)">
        <PanelEmpty icon={Activity} title="No injections yet" detail="Log a dose to see your active levels build here." />
      </PanelCard>
    )
  }

  const chartConfig = Object.fromEntries(
    legend.map((s) => [s.key, { label: s.name, color: s.color }]),
  )

  return (
    <PanelCard title="Active levels" subtitle="Stacked from logged doses · last 60 days">
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

      {/* Total active now — single big number, with how much of your peak that represents */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t pt-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total active now</span>
        <span className="font-mono text-2xl font-semibold tabular-nums">
          {totalNow.toFixed(1)}
          <small className="ml-1 text-xs font-normal text-muted-foreground">mg/d</small>
        </span>
        {totalPeak > 0.1 && (
          <span className="text-xs text-muted-foreground">
            {totalPct}% of 60d peak ({totalPeak.toFixed(1)})
          </span>
        )}
      </div>

      {/* Per-compound readout — current level + 7d trend + stability chip + window peak */}
      <ul className="mt-3 flex flex-col gap-2">
        {legend.map((s) => {
          const TrendIcon = s.trend === 'up' ? ArrowUpRight : s.trend === 'down' ? ArrowDownRight : Minus
          const trendCls = s.trend === 'up'
            ? 'text-emerald-700 dark:text-emerald-400'
            : s.trend === 'down'
              ? 'text-destructive'
              : 'text-muted-foreground'
          const stab = STABILITY_META[s.stability]
          return (
            <li key={s.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
              <span className="font-mono tabular-nums">
                {s.current.toFixed(1)} <small className="text-[10px] font-normal text-muted-foreground">mg/d</small>
              </span>
              <span className={cn('flex items-center gap-0.5 font-mono tabular-nums', trendCls)}>
                <TrendIcon className="size-3" />
                {s.trend === 'flat' ? 'steady' : `${s.trendPct > 0 ? '+' : ''}${s.trendPct.toFixed(0)}% 7d`}
              </span>
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', stab.cls)}>
                {stab.label}
              </span>
              {s.peak && s.peak.level > 0.1 && (
                <span className="basis-full pl-5 font-mono tabular-nums text-muted-foreground">
                  peak {s.peak.level.toFixed(1)} on {format(new Date(anchorMs + s.peak.dayNum * MS_PER_DAY), 'MMM d')} · CV {s.cv.toFixed(0)}%
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </PanelCard>
  )
}
