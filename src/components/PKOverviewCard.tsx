/**
 * PKOverviewCard — Cycle Timeline
 *
 * Shows a unified "what happened / what's coming" chart per active protocol:
 *
 *   ─── LOGGED (past actual injections, solid area)
 *   - - PROJECTED (future scheduled doses, dashed area)
 *   💉  Injection markers at each logged dose
 *   🩸  Bloodwork markers at each lab exam
 *   │   Today  │ Protocol end
 *
 * Compound-name fix: when compound.ester is not set, infer it by scanning the
 * compound name for known PK form strings (e.g. "Testosterone Enanthate" → Enanthate).
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
import type { Compound, InjectionLog, LabExam, Protocol, ProtocolDose } from '../lib/db'
import { findPKCompound, PK_COMPOUNDS } from '../lib/pk'
import { generateDoseInstants } from '../lib/schedule'
import { useTheme } from '../lib/useTheme'

const MS_PER_DAY = 86_400_000
const PTS_PER_DAY = 6  // 4-hour resolution for smooth sawtooth

// ── Infer ester from compound name when compound.ester field is not set ──────
function inferEster(name: string): string | undefined {
  const lower = name.toLowerCase()
  // Check all known PK forms — longest match first to avoid "Prop" matching "Propionate"
  const forms = [...new Set(PK_COMPOUNDS.map(c => c.form).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
  return forms.find(f => lower.includes(f.toLowerCase()))
}

type ChartPt = {
  dayNum: number
  logged: number | null
  projected: number | null
}

type EventMarker = {
  dayNum: number
  kind: 'injection' | 'bloodwork'
  label: string
}

type CycleData = {
  pkName: string
  color: string
  chartData: ChartPt[]
  events: EventMarker[]
  todayDayNum: number
  endDayNum: number | null
  currentLevel: number
  nextPeak: { dayNum: number; level: number } | null
  nextTrough: { dayNum: number; level: number } | null
  protocolEndLabel: string | null
}

function releaseAt(injMs: number, dose: number, activePct: number, lambda: number, ptMs: number): number {
  const tDays = (ptMs - injMs) / MS_PER_DAY
  if (tDays < 0) return 0
  return dose * (activePct / 100) * Math.exp(-tDays * lambda) * lambda
}

function buildCycleData(
  protocol: Protocol,
  compound: Compound,
  loggedInjections: InjectionLog[],
  _protocolDoses: ProtocolDose[],
  exams: LabExam[],
): CycleData | null {
  // Match PK compound — infer ester from name when compound.ester not set
  const esterHint = compound.ester ?? inferEster(compound.name)
  const pk = findPKCompound(compound.name, esterHint)
    ?? findPKCompound(compound.name)
  if (!pk) return null

  const startMs = Date.parse(protocol.startedAt)
  if (isNaN(startMs)) return null

  const nowMs   = Date.now()
  const endMs   = protocol.endsAt ? Date.parse(protocol.endsAt) : null
  const tailMs  = Math.ceil(pk.halfLifeDays * 5) * MS_PER_DAY
  const winEndMs = (endMs ?? nowMs + 90 * MS_PER_DAY) + tailMs
  const totalDays = Math.ceil((winEndMs - startMs) / MS_PER_DAY)
  const lambda    = Math.LN2 / pk.halfLifeDays

  // Logged injections for this compound (up to now)
  const loggedDoses = loggedInjections
    .filter(i => i.compoundId === compound.id)
    .map(i => ({ ms: Date.parse(i.takenAt), dose: i.dose ?? 0 }))
    .filter(i => !isNaN(i.ms) && i.ms <= nowMs + 60_000)

  // Future projected doses from protocol schedule
  const futureEnd = endMs ? new Date(endMs + MS_PER_DAY) : addDays(new Date(), 180)
  const futureInstants = protocol.cadence.kind !== 'asNeeded'
    ? generateDoseInstants(protocol, new Date(nowMs), futureEnd)
    : []
  const projectedDoses = futureInstants.map(d => ({ ms: d.getTime(), dose: protocol.dose }))

  // All doses for projecting the future (logged tails still decay forward)
  const allDoses = [...loggedDoses, ...projectedDoses]

  // Build chart points
  const chartData: ChartPt[] = []
  let todayDayNum = (nowMs - startMs) / MS_PER_DAY
  let currentLevel = 0

  const totalPts = totalDays * PTS_PER_DAY
  for (let i = 0; i < totalPts; i++) {
    // Downsample to 2 pts/day for rendering speed, but keep 6pt/day resolution for peaks
    if (i % 3 !== 0) continue

    const ptMs   = startMs + (i / PTS_PER_DAY) * MS_PER_DAY
    const dayNum = i / PTS_PER_DAY
    const isPast = ptMs <= nowMs + 60_000

    const loggedLevel   = loggedDoses.reduce((s, inj) => s + releaseAt(inj.ms, inj.dose, pk.activeDosePct, lambda, ptMs), 0)
    const projectedLevel = allDoses.reduce((s, inj) => s + releaseAt(inj.ms, inj.dose, pk.activeDosePct, lambda, ptMs), 0)

    if (Math.abs(ptMs - nowMs) < (MS_PER_DAY / PTS_PER_DAY) * 0.75) {
      currentLevel = isPast ? loggedLevel : projectedLevel
    }

    chartData.push({
      dayNum: parseFloat(dayNum.toFixed(2)),
      logged:    isPast ? parseFloat(Math.max(0, loggedLevel).toFixed(3))    : null,
      projected: !isPast ? parseFloat(Math.max(0, projectedLevel).toFixed(3)) : null,
    })
  }

  // Next peak + trough in projected window
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

  // Event markers: logged injections + bloodwork exams in the chart window
  const events: EventMarker[] = []

  for (const inj of loggedDoses) {
    const dayNum = (inj.ms - startMs) / MS_PER_DAY
    if (dayNum >= 0 && dayNum <= totalDays) {
      events.push({ dayNum: parseFloat(dayNum.toFixed(2)), kind: 'injection', label: '💉' })
    }
  }

  for (const exam of exams) {
    const examMs = Date.parse(exam.collectedAt)
    if (isNaN(examMs)) continue
    const dayNum = (examMs - startMs) / MS_PER_DAY
    if (dayNum >= -7 && dayNum <= totalDays) {
      events.push({
        dayNum: parseFloat(dayNum.toFixed(2)),
        kind: 'bloodwork',
        label: `🩸 ${format(parseISO(exam.collectedAt), 'MMM d')}`,
      })
    }
  }

  const endDayNum = endMs !== null ? (endMs - startMs) / MS_PER_DAY : null
  const protocolEndLabel = protocol.endsAt ? format(parseISO(protocol.endsAt), 'MMM d') : null

  return {
    pkName: pk.form ? `${pk.compound} ${pk.form}` : pk.compound,
    color: compound.color ?? '#0f766e',
    chartData,
    events,
    todayDayNum,
    endDayNum,
    currentLevel,
    nextPeak,
    nextTrough,
    protocolEndLabel,
  }
}

function StatPill({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string
}) {
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
  exams,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  protocols: Protocol[]
  protocolDoses: ProtocolDose[]
  exams: LabExam[]
}) {
  const { chart: colors } = useTheme()

  const cycleInfos = useMemo(() => {
    const compoundMap = new Map(compounds.map(c => [c.id, c]))
    return protocols
      .filter(p => !p.archived && p.cadence.kind !== 'asNeeded')
      .flatMap(p => {
        const c = compoundMap.get(p.compoundId)
        if (!c) return []
        const data = buildCycleData(p, c, injections, protocolDoses, exams)
        return data ? [{ protocol: p, data }] : []
      })
  }, [compounds, injections, protocols, protocolDoses, exams])

  if (cycleInfos.length === 0) return null

  return (
    <>
      {cycleInfos.map(({ protocol, data }) => {
        const {
          chartData, events, todayDayNum, endDayNum,
          currentLevel, nextPeak, nextTrough,
          protocolEndLabel, pkName, color,
        } = data

        const startMs = Date.parse(protocol.startedAt)
        const nowMs   = Date.now()
        const daysFromNow = (d: number) => d - (nowMs - startMs) / MS_PER_DAY

        const peakIn   = nextPeak   ? daysFromNow(nextPeak.dayNum)   : null
        const troughIn = nextTrough ? daysFromNow(nextTrough.dayNum) : null

        function relTime(days: number | null): string {
          if (days === null) return '—'
          const abs = Math.abs(days)
          if (abs < 0.1) return 'Now'
          if (abs < 1)   return `${Math.round(abs * 24)}h`
          return `${abs.toFixed(1)}d`
        }

        // Separate injection and bloodwork events for legend display
        const injEvents = events.filter(e => e.kind === 'injection')
        const bwEvents  = events.filter(e => e.kind === 'bloodwork')

        return (
          <section
            key={protocol.id}
            className="surface col-12"
            style={{ borderLeft: `3px solid ${color}` }}
          >
            {/* ── Header ── */}
            <div className="panel-header" style={{ marginBottom: 12 }}>
              <div>
                <span className="section-label">Cycle timeline · {protocol.name}</span>
                <h3 style={{ color }}>
                  {pkName}
                  <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ink-dim)', marginLeft: 8 }}>
                    {protocol.dose} {protocol.unit}
                  </span>
                </h3>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <StatPill label="Now" value={`${currentLevel.toFixed(1)}`} sub="mg/day" color={color} />
                {nextPeak && peakIn !== null && peakIn > 0 && (
                  <StatPill label="Next peak" value={`in ${relTime(peakIn)}`} sub={`${nextPeak.level.toFixed(1)} mg/d`} color="var(--warn)" />
                )}
                {nextTrough && troughIn !== null && troughIn > 0 && (
                  <StatPill label="Trough · labs" value={`in ${relTime(troughIn)}`} sub={`${nextTrough.level.toFixed(1)} mg/d`} color="var(--good)" />
                )}
                {protocolEndLabel && (
                  <StatPill label="Protocol ends" value={protocolEndLabel} />
                )}
              </div>
            </div>

            {/* ── Chart ── */}
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id={`pkLogged-${protocol.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id={`pkProj-${protocol.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid stroke={colors.grid} vertical={false} />

                <XAxis
                  dataKey="dayNum"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v: number) =>
                    Math.round(v) % 7 === 0 && Math.abs(v - Math.round(v)) < 0.4
                      ? `Day ${Math.round(v)}`
                      : ''
                  }
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: colors.tick, fontSize: 10 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: colors.tick, fontSize: 10 }}
                  width={40}
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
                  labelFormatter={(v) => `Day ${(v as number).toFixed(1)}`}
                />

                {/* Today */}
                <ReferenceLine
                  x={todayDayNum}
                  stroke={color}
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  label={{ value: 'Today', position: 'insideTopRight', fill: color, fontSize: 9 }}
                />

                {/* Protocol end */}
                {endDayNum !== null && (
                  <ReferenceLine
                    x={endDayNum}
                    stroke="var(--ink-mute)"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    label={{ value: 'End', position: 'insideTopRight', fill: 'var(--ink-mute)', fontSize: 9 }}
                  />
                )}

                {/* Next peak */}
                {nextPeak && (
                  <ReferenceLine
                    x={nextPeak.dayNum}
                    stroke="var(--warn)"
                    strokeDasharray="2 4"
                    strokeWidth={1}
                    label={{ value: '↑ Peak', position: 'insideTopLeft', fill: 'var(--warn)', fontSize: 9 }}
                  />
                )}

                {/* Next trough / bloodwork window */}
                {nextTrough && (
                  <ReferenceLine
                    x={nextTrough.dayNum}
                    stroke="var(--good)"
                    strokeDasharray="2 4"
                    strokeWidth={1}
                    label={{ value: '🩸 Draw', position: 'insideTopLeft', fill: 'var(--good)', fontSize: 9 }}
                  />
                )}

                {/* Injection event markers */}
                {injEvents.map((ev, i) => (
                  <ReferenceLine
                    key={`inj-${i}`}
                    x={ev.dayNum}
                    stroke={color}
                    strokeOpacity={0.35}
                    strokeWidth={1}
                    strokeDasharray="1 0"
                  />
                ))}

                {/* Bloodwork event markers */}
                {bwEvents.map((ev, i) => (
                  <ReferenceLine
                    key={`bw-${i}`}
                    x={ev.dayNum}
                    stroke="#e53e3e"
                    strokeWidth={1.5}
                    strokeDasharray="2 3"
                    label={{ value: '🩸', position: 'insideTopLeft', fill: '#e53e3e', fontSize: 11 }}
                  />
                ))}

                {/* Logged (past) series */}
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

                {/* Projected (future) series */}
                <Area
                  type="monotone"
                  dataKey="projected"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  strokeOpacity={0.55}
                  fill={`url(#pkProj-${protocol.id})`}
                  dot={false}
                  activeDot={{ r: 3, fill: color }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>

            {/* ── Legend ── */}
            <div style={{
              display: 'flex', gap: 14, marginTop: 8, fontSize: 10,
              color: 'var(--ink-mute)', alignItems: 'center', flexWrap: 'wrap',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="16" height="6">
                  <line x1="0" y1="3" x2="16" y2="3" stroke={color} strokeWidth="2" />
                </svg>
                Injections (logged)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="16" height="6">
                  <line x1="0" y1="3" x2="16" y2="3" stroke={color} strokeWidth="2" strokeDasharray="5 3" strokeOpacity="0.55" />
                </svg>
                Projected
              </span>
              {bwEvents.length > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="16" height="6">
                    <line x1="0" y1="3" x2="16" y2="3" stroke="#e53e3e" strokeWidth="1.5" strokeDasharray="2 3" />
                  </svg>
                  Bloodwork drawn
                </span>
              )}
              <span style={{ marginLeft: 'auto', color: 'var(--ink-dim)' }}>Release rate · mg/day</span>
            </div>

            {/* Bloodwork advice note */}
            {nextTrough && troughIn !== null && troughIn > 0 && troughIn < 30 && (
              <p className="panel-note" style={{ marginTop: 6 }}>
                Best time for bloodwork: {relTime(troughIn)} from now (trough before next injection).
              </p>
            )}
          </section>
        )
      })}
    </>
  )
}
