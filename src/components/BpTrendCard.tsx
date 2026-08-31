import { useMemo, useState } from 'react'
import { HeartPulse } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceArea,
  XAxis,
  YAxis,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import type { VitalLog } from '../lib/db'
import { TimeRangePicker } from './TimeRangePicker'
import { filterByRange, type TimeRange } from '../lib/timeRange'
import { ChartCard } from './dashboard/ChartCard'
import { PanelEmpty } from './dashboard/PanelCard'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

// ── BP classification — ranges calibrated for steroid/TRT users ─────────────
type BpStatus = 'optimal' | 'good' | 'monitor' | 'high' | 'danger'

function classifyBp(systolic: number, diastolic: number): BpStatus {
  if (systolic >= 160 || diastolic >= 105) return 'danger'
  if (systolic >= 145 || diastolic >= 95)  return 'high'
  if (systolic >= 135 || diastolic >= 88)  return 'monitor'
  if (systolic >= 125 || diastolic >= 82)  return 'good'
  return 'optimal'
}

const chartConfig = {
  systolic:  { label: 'Systolic',  color: 'var(--foreground)' },
  diastolic: { label: 'Diastolic', color: 'var(--muted-foreground)' },
  pulse:     { label: 'Pulse',     color: 'var(--chart-2)' },
} satisfies ChartConfig

/**
 * Blood-pressure trend chart — the same view that used to live on the Vitals
 * page, now surfaced as the last widget on the Overview. Systolic area +
 * diastolic/pulse lines, a time-range picker, and a contextual insight banner
 * driven by the 30-day mean.
 */
export function BpTrendCard({ vitals }: { vitals: VitalLog[] }) {
  const [range, setRange] = useState<TimeRange>('3M')

  const filtered = useMemo(
    () => filterByRange(vitals, range, (v) => parseISO(v.measuredAt)).slice().reverse(),
    [vitals, range],
  )
  const chart = filtered.map((v) => ({
    date: format(parseISO(v.measuredAt), 'MMM d'),
    systolic: v.systolic,
    diastolic: v.diastolic,
    pulse: v.pulse,
  }))

  // Mean is intentionally windowed to the last 30 days — a reading from years
  // ago shouldn't drag your current average. The chart still shows everything
  // in the selected range.
  const stats = useMemo(() => {
    const recent = filterByRange(vitals, '1M', (v) => parseISO(v.measuredAt))
    if (recent.length === 0) return undefined
    const sys = recent.map((v) => v.systolic)
    const dia = recent.map((v) => v.diastolic)
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    return { meanSys: avg(sys), meanDia: avg(dia), n: recent.length }
  }, [vitals])

  const meanStatus = stats ? classifyBp(Math.round(stats.meanSys), Math.round(stats.meanDia)) : undefined
  const insight = stats && meanStatus ? bpInsight(meanStatus) : undefined

  return (
    <ChartCard
      title="Blood pressure trend"
      subtitle={stats ? `Mean ${stats.meanSys.toFixed(0)}/${stats.meanDia.toFixed(0)} · last 30d (${stats.n})` : undefined}
      action={<TimeRangePicker value={range} onChange={setRange} />}
    >
      {chart.length > 0 ? (
        <ChartContainer config={chartConfig} className="h-[220px] w-full">
          <AreaChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="fillSysOverview" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-systolic)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--color-systolic)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <ReferenceArea y1={160} y2={200} fill="var(--destructive)" fillOpacity={0.07} />
            <ReferenceArea y1={145} y2={160} fill="var(--destructive)" fillOpacity={0.04} />
            <ReferenceArea y1={135} y2={145} fill="#c5821e" fillOpacity={0.05} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis domain={[60, 180]} tickLine={false} axisLine={false} tickMargin={4} tick={{ fontSize: 11 }} width={32} />
            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
            <Area type="monotone" dataKey="systolic" stroke="var(--color-systolic)" strokeWidth={2} fill="url(#fillSysOverview)" dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="diastolic" stroke="var(--color-diastolic)" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="pulse" stroke="var(--color-pulse)" strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ChartContainer>
      ) : (
        <PanelEmpty icon={HeartPulse} title="No readings in this range" detail="Log a blood pressure reading from Home to see your trend." />
      )}

      {insight && (
        <div className={`mt-4 rounded-lg border-l px-3.5 py-2.5 ${insight.cls}`}>
          <p className="text-sm font-medium">{insight.title} · avg {stats!.meanSys.toFixed(0)}/{stats!.meanDia.toFixed(0)}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{insight.body}</p>
        </div>
      )}
    </ChartCard>
  )
}

function bpInsight(status: BpStatus): { title: string; body: string; cls: string } {
  if (status === 'optimal' || status === 'good') {
    return {
      title: '✓ BP well controlled',
      body: 'Keep logging. Anabolics can push it up over time.',
      cls: 'border-emerald-500 bg-emerald-500/8',
    }
  }
  if (status === 'danger') {
    return {
      title: '⚠ Action needed',
      body: 'This is too high on-cycle. Consider a blast break, reduce dose/compound count, add cardio, and see a doctor. Check haematocrit ASAP.',
      cls: 'border-destructive bg-destructive/8',
    }
  }
  if (status === 'high') {
    return {
      title: 'BP is high',
      body: 'Common on high-dose blasts or compounds like Tren, Anadrol, or Deca. Reduce sodium, increase cardio, consider an AI or dose cut. Check haematocrit next bloods.',
      cls: 'border-destructive bg-destructive/8',
    }
  }
  return {
    title: 'BP needs monitoring',
    body: 'Expected on anabolic protocols. Stay hydrated, manage sodium, log consistently. If climbing, review compound selection or dose.',
    cls: 'border-amber-500 bg-amber-500/8',
  }
}
