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
import type { Compound, InjectionLog, LabExam, Protocol, ProtocolDose } from '../lib/db'
import { findPKCompound, PK_COMPOUNDS } from '../lib/pk'
import { generateDoseInstants } from '../lib/schedule'
import { PanelCard } from './dashboard/PanelCard'

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

// Parse common shorthand ester names from free text (e.g. protocol name "Test E 200mg")
function inferEsterFromText(text: string): string | undefined {
  const t = text.toLowerCase()
  if (/enanthate|enanth|\btest[\s-]*e\b|\bte\b/.test(t))  return 'Enanthate'
  if (/cypionate|cyp|\btest[\s-]*c\b/.test(t))            return 'Cypionate'
  if (/propionate|prop|\btest[\s-]*p\b/.test(t))          return 'Propionate'
  if (/undecanoate|nebido|aveed/.test(t))                 return 'Undecanoate'
  if (/decanoate(?!.*undeca)|deca/.test(t))               return 'Decanoate'
  if (/phenylpropionate|phenprop|\bpp\b/.test(t))         return 'Phenylpropionate'
  if (/suspension|susp|\btest[\s-]*s\b/.test(t))          return 'Suspension'
  if (/sustanon|sust/.test(t))                            return 'Sustanon 250'
  return undefined
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
  // Match PK compound — 3-tier ester inference:
  // 1. compound.ester field  2. parse compound name  3. parse protocol name (e.g. "Test E 200mg")
  const esterHint = (compound.ester && compound.ester !== 'Custom' ? compound.ester : undefined)
    ?? inferEster(compound.name)
    ?? inferEsterFromText(protocol.name)
    ?? inferEsterFromText(compound.name)
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
    color: compound.color ?? '#1a1611',
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
    <PanelCard className="h-full" title="Release levels" subtitle="Active compounds">
      <div className="flex flex-col gap-3">
      {cycleInfos.map(({ protocol, data }) => {
        const {
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

        return (
          <div
            key={protocol.id}
            className="flex flex-col gap-2 border-l-2 pl-3.5"
            style={{ borderLeftColor: color }}
          >
            {/* Compound name + dose */}
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold" style={{ color }}>{pkName}</span>
              <span className="text-xs text-muted-foreground">{protocol.dose} {protocol.unit}</span>
            </div>
            {/* Key stats — compact horizontal */}
            <div className="flex flex-wrap gap-x-6 gap-y-1.5">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Now</span>
                <span className="font-mono text-sm font-medium tabular-nums" style={{ color }}>
                  {currentLevel.toFixed(1)}<small className="ml-0.5 text-[10px] font-normal text-muted-foreground">mg/d</small>
                </span>
              </div>
              {nextPeak && peakIn !== null && peakIn > 0 && (
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Peak</span>
                  <span className="font-mono text-sm font-medium tabular-nums text-amber-700 dark:text-amber-400">in {relTime(peakIn)}</span>
                </div>
              )}
              {nextTrough && troughIn !== null && troughIn > 0 && (
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Labs</span>
                  <span className="font-mono text-sm font-medium tabular-nums text-emerald-700 dark:text-emerald-400">in {relTime(troughIn)}</span>
                </div>
              )}
              {protocolEndLabel && (
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ends</span>
                  <span className="font-mono text-sm font-medium tabular-nums">{protocolEndLabel}</span>
                </div>
              )}
            </div>

            {/* Bloodwork hint */}
            {nextTrough && troughIn !== null && troughIn > 0 && troughIn < 14 && (
              <span className="text-xs text-muted-foreground">
                🩸 Best bloodwork window in {relTime(troughIn)}
              </span>
            )}
          </div>
        )
      })}
      </div>
    </PanelCard>
  )
}
