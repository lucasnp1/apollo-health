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
import { Activity } from 'lucide-react'

const MS_PER_DAY = 86_400_000
const WINDOW_DAYS = 60

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
      return {
        key,
        name: c.name,
        color: c.color,
        current: typeof last[key] === 'number' ? (last[key] as number) : 0,
        peak: peakOf[key] ?? null,
      }
    })

    return { data, legend, anchorMs }
  }, [compounds, injections])

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

      {/* Per-compound readout — current level + when it peaked in the window */}
      <ul className="mt-4 flex flex-col gap-1.5">
        {legend.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5 text-xs">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {s.current.toFixed(1)} <small className="text-[10px]">mg/d now</small>
            </span>
            {s.peak && s.peak.level > 0.1 && (
              <span className="font-mono tabular-nums text-muted-foreground">
                · peak {s.peak.level.toFixed(1)} on {format(new Date(anchorMs + s.peak.dayNum * MS_PER_DAY), 'MMM d')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </PanelCard>
  )
}
