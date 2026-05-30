/**
 * PKOverviewCard — full-cycle pharmacokinetics chart.
 *
 * Displays the release-rate curve (mg/day) for each active non-asNeeded protocol,
 * identical in shape to steroidplanner.com:
 *
 *   ─── LOGGED (past actual injections)   ─ ─ PROJECTED (future scheduled doses)
 *        Today │                 Protocol end │
 *
 * Two recharts Area series share the same chart:
 *   • "logged"    – computed from actual InjectionLog rows, null after today
 *   • "projected" – computed from protocol schedule, null before today (overlaps at today)
 *
 * The formula (first-order release):
 *   R(t) = dose × (activeDosePct/100) × exp(−t×λ) × λ     where λ = ln2 / halfLifeDays
 */

import { useMemo } from 'react'
import { parseISO, format, addDays } from 'date-fns'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Compound, InjectionLog, Protocol, ProtocolDose } from '../lib/db'
import { findPKCompound } from '../lib/pk'
import { generateDoseInstants } from '../lib/schedule'
import { useTheme } from '../lib/useTheme'

const MS_PER_DAY = 86_400_000
const PTS_PER_DAY = 6   // 4-hour resolution — captures sharp peaks & smooth troughs

type ChartPt = {
  dayNum: number          // days since protocol.startedAt (float)
  label: string           // x-axis tick label ("Day 7", "Day 14", …)
  logged: number | null   // level from actual logged injections (past only)
  projected: number | null // level from schedule projections  (future only, overlaps today)
}

type CycleData = {
  pkName: string
  color: string
  chartData: ChartPt[]
  todayDayNum: number
  endDayNum: number | null
  currentLevel: number
  nextPeak: { dayNum: number; level: number } | null
  nextTrough: { dayNum: number; level: number } | null
  protocolEndLabel: string | null
}

function releaseAt(doseMs: number, dose: number, activePct: number, lambda: number, ptMs: number): number {
  const tDays = (ptMs - doseMs) / MS_PER_DAY
  if (tDays < 0) return 0
  return dose * (activePct / 100) * Math.exp(-tDays * lambda) * lambda
}

function buildCycleData(
  protocol: Protocol,
  compound: Compound,
  loggedInjections: InjectionLog[],
  _protocolDoses: ProtocolDose[],
): CycleData | null {
  // Match PK compound — try ester field first, then parse from name
  const pk = findPKCompound(compound.name, compound.ester ?? undefined)
    ?? findPKCompound(compound.name)  // fallback without ester
  if (!pk) return null

  const startMs = Date.parse(protocol.startedAt)
  if (isNaN(startMs)) return null

  const nowMs = Date.now()
  const endMs = protocol.endsAt ? Date.parse(protocol.endsAt) : null

  // Decay tail: 5× half-life after last injection (curve decays to ~3%)
  const tailDays = Math.ceil(pk.halfLifeDays * 5)
  // Chart window end: end of protocol + tail, or today + 90d if no end date
  const windowEndMs = (endMs ?? nowMs + 90 * MS_PER_DAY) + tailDays * MS_PER_DAY
  const totalDays = Math.ceil((windowEndMs - startMs) / MS_PER_DAY)
  const totalPts  = totalDays * PTS_PER_DAY

  const lambda = Math.LN2 / pk.halfLifeDays

  // Past logged injections for this compound
  const loggedDoses = loggedInjections
    .filter(i => i.compoundId === compound.id)
    .map(i => ({ ms: Date.parse(i.takenAt), dose: i.dose ?? 0 }))
    .filter(i => !isNaN(i.ms) && i.ms <= nowMs + 60_000) // up to now (+ 1-min tolerance)

  // Future projected injections from protocol schedule
  const futureEnd = endMs ? new Date(endMs + MS_PER_DAY) : addDays(new Date(), 180)
  const futureInstants = (protocol.cadence.kind !== 'asNeeded')
    ? generateDoseInstants(protocol, new Date(nowMs), futureEnd)
    : []
  const projectedDoses = futureInstants.map(d => ({ ms: d.getTime(), dose: protocol.dose }))

  // All doses combined (for the future curve — logged tails still decay into future)
  const allDoses = [
    ...loggedDoses,
    ...projectedDoses,
  ]

  // Build chart data
  const chartData: ChartPt[] = []
  let todayDayNum = -1
  let currentLevel = 0

  for (let i = 0; i < totalPts; i++) {
    const ptMs  = startMs + (i / PTS_PER_DAY) * MS_PER_DAY
    const dayNum = i / PTS_PER_DAY
    const isPast = ptMs <= nowMs + 60_000  // points on or before now

    // Logged level: only actual past injections
    const loggedLevel = loggedDoses.reduce((acc, inj) => acc + releaseAt(inj.ms, inj.dose, pk.activeDosePct, lambda, ptMs), 0)
    // Projected level: past tails + future scheduled doses
    const projLevel   = allDoses.reduce((acc, inj) => acc + releaseAt(inj.ms, inj.dose, pk.activeDosePct, lambda, ptMs), 0)

    const levelNow = isPast ? loggedLevel : projLevel

    if (Math.abs(ptMs - nowMs) < (MS_PER_DAY / PTS_PER_DAY) * 0.5) {
      todayDayNum = dayNum
      currentLevel = levelNow
    }

    // Only emit every PTS_PER_DAY/2 points to keep recharts fast (= every 8h)
    // but always emit points near today and protocol end for precise reference lines
    const nearToday = Math.abs(ptMs - nowMs) < 2 * MS_PER_DAY
    const nearEnd   = endMs !== null && Math.abs(ptMs - endMs) < 2 * MS_PER_DAY
    if (i % 2 !== 0 && !nearToday && !nearEnd) continue

    const showLabel = Math.round(dayNum) % 7 === 0 && Math.abs(dayNum - Math.round(dayNum)) < 0.5
    const label = showLabel ? `Day ${Math.round(dayNum)}` : ''

    chartData.push({
      dayNum: parseFloat(dayNum.toFixed(2)),
      label,
      logged: isPast ? parseFloat(Math.max(0, loggedLevel).toFixed(3)) : null,
      projected: !isPast ? parseFloat(Math.max(0, projLevel).toFixed(3)) : null,
    })
  }

  // If today is before any logged data, set current to projected level
  if (todayDayNum < 0 && chartData.length > 0) {
    const todayPt = chartData.reduce((best, pt) =>
      Math.abs(pt.dayNum - (nowMs - startMs) / MS_PER_DAY) <
      Math.abs(best.dayNum - (nowMs - startMs) / MS_PER_DAY) ? pt : best
    )
    todayDayNum = todayPt.dayNum
  }

  // Find next peak and trough in the projected window
  const projPts = chartData.filter(p => p.projected !== null)
  let nextPeak: CycleData['nextPeak'] = null
  let nextTrough: CycleData['nextTrough'] = null

  let peaked = false
  for (let i = 1; i < projPts.length - 1; i++) {
    const prev = projPts[i - 1].projected!
    const curr = projPts[i].projected!
    const next = projPts[i + 1].projected!
    if (!peaked && curr > prev && curr >= next && curr > 0.5) {
      nextPeak = { dayNum: projPts[i].dayNum, level: curr }
      peaked = true
    }
    if (peaked && curr < prev && curr <= next) {
      nextTrough = { dayNum: projPts[i].dayNum, level: curr }
      break
    }
  }

  const endDayNum = endMs !== null ? (endMs - startMs) / MS_PER_DAY : null
  const protocolEndLabel = protocol.endsAt ? format(parseISO(protocol.endsAt), 'MMM d') : null

  return {
    pkName: pk.form ? `${pk.compound} ${pk.form}` : pk.compound,
    color: compound.color ?? '#0f766e',
    chartData,
    todayDayNum,
    endDayNum,
    currentLevel,
    nextPeak,
    nextTrough,
    protocolEndLabel,
  }
}

function StatPill({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-mute)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: color ?? 'var(--ink)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--ink-dim)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

export function PKOverviewCard({
  compounds,
  injections,
  protocols,
  protocolDoses,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  protocols: Protocol[]
  protocolDoses: ProtocolDose[]
}) {
  const { chart: colors } = useTheme()

  const cycleInfos = useMemo(() => {
    const compoundMap = new Map(compounds.map(c => [c.id, c]))
    return protocols
      .filter(p => !p.archived && p.cadence.kind !== 'asNeeded')
      .flatMap(p => {
        const c = compoundMap.get(p.compoundId)
        if (!c) return []
        const data = buildCycleData(p, c, injections, protocolDoses)
        return data ? [{ protocol: p, compound: c, data }] : []
      })
  }, [compounds, injections, protocols, protocolDoses])

  if (cycleInfos.length === 0) return null

  return (
    <>
      {cycleInfos.map(({ protocol, data }) => {
        const { chartData, todayDayNum, endDayNum, currentLevel, nextPeak, nextTrough, protocolEndLabel, pkName, color } = data

        // Format relative time from day numbers
        const nowMs = Date.now()
        const startMs = Date.parse(protocol.startedAt)
        const daysFromNow = (dayNum: number) => dayNum - (nowMs - startMs) / MS_PER_DAY

        const peakIn = nextPeak ? daysFromNow(nextPeak.dayNum) : null
        const troughIn = nextTrough ? daysFromNow(nextTrough.dayNum) : null

        function relTime(days: number | null): string {
          if (days === null) return '—'
          const abs = Math.abs(days)
          if (abs < 0.1) return 'Now'
          if (abs < 1) return `${Math.round(abs * 24)}h`
          return `${abs.toFixed(1)}d`
        }

        return (
          <section
            key={protocol.id}
            className="surface col-12"
            style={{ borderLeft: `3px solid ${color}` }}
          >
            {/* Header */}
            <div className="panel-header" style={{ marginBottom: 12 }}>
              <div>
                <span className="section-label">Release curve · {protocol.name}</span>
                <h3 style={{ color }}>
                  {pkName}
                  <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ink-dim)', marginLeft: 8 }}>
                    {protocol.dose} {protocol.unit}
                  </span>
                </h3>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <StatPill
                  label="Now"
                  value={`${currentLevel.toFixed(1)}`}
                  sub="mg/day"
                  color={color}
                />
                {nextPeak && peakIn !== null && peakIn > 0 && (
                  <StatPill
                    label="Next peak"
                    value={`in ${relTime(peakIn)}`}
                    sub={`${nextPeak.level.toFixed(1)} mg/d`}
                    color="var(--warn)"
                  />
                )}
                {nextTrough && troughIn !== null && troughIn > 0 && (
                  <StatPill
                    label="Trough · bloodwork"
                    value={`in ${relTime(troughIn)}`}
                    sub={`${nextTrough.level.toFixed(1)} mg/d`}
                    color="var(--good)"
                  />
                )}
                {protocolEndLabel && (
                  <StatPill
                    label="Protocol ends"
                    value={protocolEndLabel}
                  />
                )}
              </div>
            </div>

            {/* Chart */}
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <defs>
                  {/* Logged (past) — solid fill */}
                  <linearGradient id={`pkLogged-${protocol.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.05} />
                  </linearGradient>
                  {/* Projected (future) — lighter fill */}
                  <linearGradient id={`pkProj-${protocol.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid stroke={colors.grid} vertical={false} />

                <XAxis
                  dataKey="dayNum"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v: number) => {
                    if (Math.round(v) % 7 === 0 && Math.abs(v - Math.round(v)) < 0.5) return `Day ${Math.round(v)}`
                    return ''
                  }}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: colors.tick, fontSize: 10 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: colors.tick, fontSize: 10 }}
                  unit=""
                  width={44}
                  tickFormatter={(v: number) => v.toFixed(0)}
                />

                <Tooltip
                  contentStyle={{
                    background: colors.tooltipBg,
                    border: `1px solid ${colors.tooltipBorder}`,
                    borderRadius: 10,
                    fontSize: 12,
                    color: colors.tooltipText,
                  }}
                  formatter={(v, name) => [
                    `${(v as number).toFixed(2)} mg/day`,
                    name === 'logged' ? 'Logged' : 'Projected',
                  ]}
                  labelFormatter={(dayNum) => `Day ${(dayNum as number).toFixed(1)}`}
                />

                {/* Today marker */}
                <ReferenceLine
                  x={todayDayNum}
                  stroke={color}
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  label={{ value: 'Today', position: 'insideTopRight', fill: color, fontSize: 9 }}
                />

                {/* Protocol end marker */}
                {endDayNum !== null && (
                  <ReferenceLine
                    x={endDayNum}
                    stroke="var(--ink-mute)"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    label={{ value: 'End', position: 'insideTopRight', fill: 'var(--ink-mute)', fontSize: 9 }}
                  />
                )}

                {/* Next peak marker */}
                {nextPeak && (
                  <ReferenceLine
                    x={nextPeak.dayNum}
                    stroke="var(--warn)"
                    strokeDasharray="2 4"
                    strokeWidth={1}
                    label={{ value: '↑ Peak', position: 'insideTopLeft', fill: 'var(--warn)', fontSize: 9 }}
                  />
                )}

                {/* Next trough / bloodwork marker */}
                {nextTrough && (
                  <ReferenceLine
                    x={nextTrough.dayNum}
                    stroke="var(--good)"
                    strokeDasharray="2 4"
                    strokeWidth={1}
                    label={{ value: '🩸 Draw', position: 'insideTopLeft', fill: 'var(--good)', fontSize: 9 }}
                  />
                )}

                {/* Logged (past) series — solid */}
                <Area
                  type="monotone"
                  dataKey="logged"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#pkLogged-${protocol.id})`}
                  dot={false}
                  activeDot={{ r: 3, fill: color }}
                  connectNulls={false}
                  isAnimationActive={false}
                />

                {/* Projected (future) series — lighter stroke, dashed */}
                <Area
                  type="monotone"
                  dataKey="projected"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  strokeOpacity={0.6}
                  fill={`url(#pkProj-${protocol.id})`}
                  dot={false}
                  activeDot={{ r: 3, fill: color }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 10, color: 'var(--ink-mute)', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke={color} strokeWidth="2" /></svg>
                Logged doses
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke={color} strokeWidth="2" strokeDasharray="4 3" strokeOpacity="0.6" /></svg>
                Projected schedule
              </span>
              <span style={{ marginLeft: 'auto', color: 'var(--ink-dim)' }}>Release rate · mg/day</span>
            </div>

            {nextTrough && troughIn !== null && troughIn > 0 && troughIn < 30 && (
              <p className="panel-note" style={{ marginTop: 6 }}>
                Optimal bloodwork window: get labs at trough ({relTime(troughIn)}) — right before your next injection for the most accurate baseline.
              </p>
            )}
          </section>
        )
      })}
    </>
  )
}
