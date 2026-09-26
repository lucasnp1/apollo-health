import { useMemo, useState } from 'react'
import { Scale } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import type { BodyMetric, InjectionLog } from '../lib/db'
import { TimeRangePicker } from './TimeRangePicker'
import { filterByRange, type TimeRange } from '../lib/timeRange'
import { ChartCard } from './dashboard/ChartCard'
import { PanelEmpty } from './dashboard/PanelCard'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

const chartConfig = {
  kg: { label: 'Weight', color: 'var(--chart-1)' },
} satisfies ChartConfig

/**
 * Body-weight trend. Weight is logged two ways — a dedicated body-metric entry
 * and the optional field on an injection — so both are merged here, the same
 * way the Overview's weight tile counts them.
 */
export function WeightTrendCard({
  bodyMetrics,
  injections,
}: {
  bodyMetrics: BodyMetric[]
  injections: InjectionLog[]
}) {
  const [range, setRange] = useState<TimeRange>('3M')

  const points = useMemo(() => {
    const pts: Array<{ measuredAt: string; kg: number }> = []
    for (const b of bodyMetrics) if (b.weightKg !== undefined) pts.push({ measuredAt: b.measuredAt, kg: b.weightKg })
    for (const i of injections) if (i.weightKg !== undefined) pts.push({ measuredAt: i.takenAt, kg: i.weightKg })
    // Same instant from both sources is one weigh-in, not two.
    const byInstant = new Map(pts.map((p) => [p.measuredAt, p]))
    return [...byInstant.values()].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  }, [bodyMetrics, injections])

  const rows = useMemo(
    () => filterByRange(points, range, (p) => parseISO(p.measuredAt)).map((p) => ({
      date: format(parseISO(p.measuredAt), 'MMM d'),
      kg: p.kg,
    })),
    [points, range],
  )

  const summary = useMemo(() => {
    if (rows.length < 2) return undefined
    const first = rows[0].kg
    const last = rows[rows.length - 1].kg
    const delta = last - first
    return { last, delta, n: rows.length }
  }, [rows])

  // Weight moves in a narrow band, so a zero-based axis would flatten the line
  // into a straight edge. Pad the real range instead.
  const domain = useMemo<[number, number] | undefined>(() => {
    if (!rows.length) return undefined
    const vals = rows.map((r) => r.kg)
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const pad = Math.max(0.5, (hi - lo) * 0.15)
    return [Number((lo - pad).toFixed(1)), Number((hi + pad).toFixed(1))]
  }, [rows])

  return (
    <ChartCard
      title="Weight"
      subtitle={summary ? `${summary.n} weigh-ins in this range` : 'Body weight over time'}
      hero={summary ? `${summary.last.toFixed(1)} kg` : undefined}
      heroSub={summary
        ? (Math.abs(summary.delta) < 0.05
            ? 'Flat across this range'
            : `${summary.delta > 0 ? '+' : ''}${summary.delta.toFixed(1)} kg across this range`)
        : undefined}
      action={<TimeRangePicker value={range} onChange={setRange} />}
    >
      {rows.length < 2 ? (
        <PanelEmpty
          icon={Scale}
          title={rows.length === 1 ? 'One weigh-in so far' : 'No weight logged in this range'}
          detail="Log your weight a couple of times and the trend shows up here."
        />
      ) : (
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <AreaChart data={rows} margin={{ left: 4, right: 8, top: 6, bottom: 0 }}>
            <defs>
              <linearGradient id="weight-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-kg)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-kg)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tick={{ fontSize: 11 }} />
            <YAxis domain={domain} width={38} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} unit="" />
            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
            <Area
              type="monotone"
              dataKey="kg"
              stroke="var(--color-kg)"
              strokeWidth={2}
              fill="url(#weight-fill)"
              dot={rows.length <= 30 ? { r: 2 } : false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </ChartCard>
  )
}
