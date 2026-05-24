/**
 * Personalized peak/trough card for Overview.
 *
 * For each active protocol that has a matchable PK profile:
 *   - Builds a 28-day release curve using the user's actual injection history
 *   - Finds the current level, the next peak, and the next trough
 *   - Marks "Optimal bloodwork window" at the trough (before next injection)
 *   - Renders a small Recharts area chart with today marker + peak/trough annotations
 *
 * The user sees their actual compound name, dose, and ester — not a generic chart.
 */

import { useMemo } from 'react'
import { format } from 'date-fns'
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
import type { Compound, InjectionLog, Protocol } from '../lib/db'
import { findPKCompound } from '../lib/pk'
import { useTheme } from '../lib/useTheme'

const HOURS_PER_DAY = 24
const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000

type PKInfo = {
  protocol: Protocol
  compound: Compound
  pkName: string
  color: string
  currentLevel: number        // mg/day right now
  peakLevel: number
  peakHoursFromNow: number | null
  troughHoursFromNow: number | null
  troughLevel: number | null
  chartData: Array<{ hour: number; label: string; level: number; isToday: boolean }>
}

function buildPKInfo(
  protocol: Protocol,
  compound: Compound,
  injections: InjectionLog[],
): PKInfo | null {
  const pk = findPKCompound(compound.name, compound.ester ?? undefined)
  if (!pk) return null

  const now = Date.now()
  // Build 6-hour resolution curve: -14 days to +14 days (28 days × 4 pts/day = 112 points)
  const windowDays = 28
  const ptsPerDay = 4
  const totalPts = windowDays * ptsPerDay
  const halfPts = totalPts / 2
  const startMs = now - (windowDays / 2) * MS_PER_DAY

  const relevantInj = injections.filter((i) => i.compoundId === compound.id && !i.deletedAtSync)

  // Build 6-hour buckets
  const chartData: PKInfo['chartData'] = []
  let currentLevel = 0
  let peakLevel = 0
  let peakIndex = halfPts  // default to "now"
  let troughIndex: number | null = null
  let troughLevel: number | null = null

  for (let i = 0; i < totalPts; i++) {
    const ptMs = startMs + (i / ptsPerDay) * MS_PER_DAY
    const ptDate = new Date(ptMs)
    const isToday = i === halfPts
    const isFuture = i >= halfPts

    let level = 0
    for (const inj of relevantInj) {
      const injMs = Date.parse(inj.takenAt)
      if (isNaN(injMs)) continue
      const tDays = (ptMs - injMs) / MS_PER_DAY
      if (tDays < 0) continue
      const lambda = Math.LN2 / pk.halfLifeDays
      level += (inj.dose ?? 0) * (pk.activeDosePct / 100) * Math.exp(-tDays * lambda) * lambda
    }
    level = Math.max(0, level)

    if (isToday) currentLevel = level

    // Track peak (highest point in future window)
    if (isFuture && level > peakLevel) {
      peakLevel = level
      peakIndex = i
    }

    chartData.push({
      hour: Math.round((ptMs - now) / MS_PER_HOUR),
      label: format(ptDate, i % (ptsPerDay * 7) === 0 ? 'MMM d' : 'MMM d'),
      level: parseFloat(level.toFixed(3)),
      isToday,
    })
  }

  // Find trough: lowest point AFTER the peak in the future
  for (let i = peakIndex + 1; i < totalPts; i++) {
    const lv = chartData[i]?.level ?? 0
    if (troughLevel === null || lv < troughLevel) {
      troughLevel = lv
      troughIndex = i
    } else if (lv > (troughLevel ?? 0) * 1.5) {
      // Curve is rising again (next injection hit) — stop
      break
    }
  }

  const peakHoursFromNow = peakIndex !== null
    ? (peakIndex - halfPts) * (HOURS_PER_DAY / ptsPerDay)
    : null
  const troughHoursFromNow = troughIndex !== null
    ? (troughIndex - halfPts) * (HOURS_PER_DAY / ptsPerDay)
    : null

  return {
    protocol,
    compound,
    pkName: pk.form ? `${pk.compound} ${pk.form}` : pk.compound,
    color: compound.color ?? '#0f766e',
    currentLevel,
    peakLevel,
    peakHoursFromNow,
    troughHoursFromNow,
    troughLevel,
    chartData,
  }
}

function formatHours(h: number | null): string {
  if (h === null) return '—'
  const abs = Math.abs(h)
  if (abs < 1) return 'Now'
  if (abs < 48) return `${Math.round(abs)}h`
  return `${Math.round(abs / 24)}d`
}

export function PKOverviewCard({
  compounds,
  injections,
  protocols,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  protocols: Protocol[]
}) {
  const { chart: colors } = useTheme()

  const pkInfos = useMemo(() => {
    const compoundMap = new Map(compounds.map((c) => [c.id, c]))
    return protocols
      .filter((p) => !p.archived)
      .flatMap((p) => {
        const c = compoundMap.get(p.compoundId)
        if (!c) return []
        const info = buildPKInfo(p, c, injections)
        return info ? [info] : []
      })
      .filter((info) => info.currentLevel > 0.01)  // only show if there's active compound
  }, [compounds, injections, protocols])

  if (pkInfos.length === 0) return null

  return (
    <>
      {pkInfos.map((info) => {
        const todayIdx = info.chartData.findIndex((d) => d.isToday)
        const todayLabel = todayIdx >= 0 ? info.chartData[todayIdx].label : ''

        // Build a readable window: 7 days back to 14 days forward, labelled daily
        const dayPoints = info.chartData.filter((_, i) => i % 4 === 0)

        const peakLabel = info.peakHoursFromNow !== null && info.peakHoursFromNow > 0
          ? `Peak in ${formatHours(info.peakHoursFromNow)}`
          : null
        const troughLabel = info.troughHoursFromNow !== null && info.troughHoursFromNow > 0
          ? `Trough in ${formatHours(info.troughHoursFromNow)}`
          : null

        // Find peak and trough labels for ReferenceLine
        const peakChartLabel = info.peakHoursFromNow !== null
          ? dayPoints.find((d) => Math.abs(d.hour - info.peakHoursFromNow!) < 7)?.label
          : undefined
        const troughChartLabel = info.troughHoursFromNow !== null
          ? dayPoints.find((d) => Math.abs(d.hour - info.troughHoursFromNow!) < 7)?.label
          : undefined

        return (
          <section
            key={info.protocol.id}
            className="surface col-12"
            style={{ borderLeft: `3px solid ${info.color}` }}
          >
            <div className="panel-header">
              <div>
                <span className="section-label">Pharmacokinetics · {info.protocol.name}</span>
                <h3 style={{ color: info.color }}>
                  {info.pkName}
                  <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ink-dim)', marginLeft: 8 }}>
                    {info.protocol.dose} {info.protocol.unit}
                  </span>
                </h3>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-mute)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Now</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: info.color, lineHeight: 1 }}>
                    {info.currentLevel.toFixed(2)} <span style={{ fontSize: 12, fontWeight: 400 }}>mg/d</span>
                  </div>
                </div>
                {peakLabel && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-mute)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Peak</div>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--warn)', lineHeight: 1 }}>
                      {peakLabel}
                    </div>
                  </div>
                )}
                {troughLabel && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-mute)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Trough</div>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-ink)', lineHeight: 1 }}>
                      {troughLabel}
                    </div>
                  </div>
                )}
                {troughLabel && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-mute)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bloodwork</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--good)', lineHeight: 1 }}>
                      At trough ✓
                    </div>
                  </div>
                )}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={dayPoints} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id={`pkGrad-${info.protocol.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={info.color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={info.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: colors.tick, fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: colors.tick, fontSize: 10 }}
                  unit=" mg/d"
                  width={64}
                />
                <Tooltip
                  contentStyle={{
                    background: colors.tooltipBg,
                    border: `1px solid ${colors.tooltipBorder}`,
                    borderRadius: 10,
                    fontSize: 12,
                    color: colors.tooltipText,
                  }}
                  formatter={(v) => [`${(v as number).toFixed(2)} mg/d`, info.pkName]}
                />
                {/* Today marker */}
                <ReferenceLine
                  x={todayLabel}
                  stroke={info.color}
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  label={{ value: 'Today', position: 'insideTopRight', fill: info.color, fontSize: 10 }}
                />
                {/* Peak marker */}
                {peakChartLabel && (
                  <ReferenceLine
                    x={peakChartLabel}
                    stroke="var(--warn)"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    label={{ value: '↑ Peak', position: 'insideTopRight', fill: 'var(--warn)', fontSize: 9 }}
                  />
                )}
                {/* Trough / bloodwork marker */}
                {troughChartLabel && (
                  <ReferenceLine
                    x={troughChartLabel}
                    stroke="var(--good)"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    label={{ value: '🩸 Bloodwork', position: 'insideTopRight', fill: 'var(--good)', fontSize: 9 }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="level"
                  stroke={info.color}
                  strokeWidth={2.5}
                  fill={`url(#pkGrad-${info.protocol.id})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>

            {troughLabel && (
              <p className="panel-note" style={{ marginTop: -4 }}>
                Get bloodwork at trough ({troughLabel}) for the most accurate baseline — right before your next injection.
              </p>
            )}
          </section>
        )
      })}
    </>
  )
}
