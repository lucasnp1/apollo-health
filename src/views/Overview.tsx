import { useMemo } from 'react'
import { Activity, AlertTriangle, CalendarClock, ChevronRight, Droplet, FlaskConical, HeartPulse, Syringe } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Compound, type InjectionLog, type LabExam, type LabResult, type VitalLog } from '../lib/db'
import {
  buildTestosteroneCurve,
  buildWeightDoseSeries,
  flagLatestResults,
  weightSummary,
  type EnrichedResult,
} from '../lib/insights'
import { nextDose, timeUntil, upcomingSchedule } from '../lib/schedule'
import { logInjection, pickActiveVial } from '../lib/injections'
import { Sparkline } from '../components/Sparkline'
import { StatCard } from '../components/StatCard'
import type { View } from '../app/views'

export function Overview({
  compounds,
  injections,
  vitals,
  exams,
  results,
  onNavigate,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  vitals: VitalLog[]
  exams: LabExam[]
  results: EnrichedResult[]
  onNavigate: (view: View) => void
}) {
  const protocols = useLiveQuery(() => db.protocols.toArray(), [], [])
  const protocolDoses = useLiveQuery(() => db.protocolDoses.toArray(), [], [])
  const symptoms = useLiveQuery(() => db.symptoms.orderBy('recordedAt').reverse().toArray(), [], [])
  const goals = useLiveQuery(() => db.goals.toArray(), [], [])
  const weightGoal = goals.find((g) => g.kind === 'weight' && !g.achievedAt)
  const bpGoal = goals.find((g) => g.kind === 'bp' && !g.achievedAt)
  const vials = useLiveQuery(() => db.vials.toArray(), [], [])

  const compoundMap = useMemo(() => new Map(compounds.map((c) => [c.id, c])), [compounds])
  const upcoming = upcomingSchedule(protocols, protocolDoses, new Date(), 7).slice(0, 5)
  const head = nextDose(protocols, protocolDoses)
  const headCompound = head ? compoundMap.get(head.protocol.compoundId) : undefined

  const weightSeries = buildWeightDoseSeries(compounds, injections)
  const weightStats = weightSummary(weightSeries)
  const tCurve = buildTestosteroneCurve(compounds, injections)
  const labFlags = flagLatestResults(results)
  const latestExam = exams[0]
  const latestBp = vitals[0]

  const bpSpark = vitals.slice(0, 14).reverse().map((v) => v.systolic)
  const weightSpark = weightSeries
    .filter((p) => p.weight !== undefined)
    .slice(-14)
    .map((p) => p.weight as number)
  const latestSymptom = symptoms[0]

  const headVial = head ? pickActiveVial(vials, head.protocol.compoundId) : undefined

  async function logDoseAsTaken() {
    if (!head) return
    const compound = compoundMap.get(head.protocol.compoundId)
    if (!compound?.id) return
    const injectionId = await logInjection({
      compoundId: compound.id,
      takenAt: head.scheduledAt.toISOString(),
      dose: head.protocol.dose,
      unit: head.protocol.unit,
      route: 'SubQ',
      site: 'Abdomen',
      rawDose: `${head.protocol.dose} ${head.protocol.unit}`,
      vialId: headVial?.id,
    })
    await db.protocolDoses.add({
      protocolId: head.protocol.id!,
      scheduledAt: head.scheduledAt.toISOString(),
      status: 'done',
      injectionId,
    })
  }

  return (
    <div className="content-grid">
      {/* Up Next hero */}
      <section className="up-next col-12">
        <div className="up-next-main">
          <span className="up-next-eyeline">Up next</span>
          {head ? (
            <>
              <h2 className="up-next-title">
                {headCompound?.name ?? 'Scheduled dose'} <span style={{ color: 'var(--ink-dim)', fontSize: 16, fontWeight: 400 }}>
                  · {head.protocol.dose} {head.protocol.unit}
                </span>
              </h2>
              <span className="eta-big">{timeUntil(head.scheduledAt)}</span>
              <span className="up-next-meta">
                {format(head.scheduledAt, 'EEE, MMM d · HH:mm')} · {head.protocol.notes ?? head.protocol.name}
                {headVial ? ` · from ${headVial.label} (${headVial.remainingMl.toFixed(2)} mL left)` : ''}
              </span>
              <div className="up-next-actions">
                <button type="button" className="primary-button" onClick={logDoseAsTaken}>Mark taken</button>
                <button type="button" className="ghost-button" onClick={() => onNavigate('meds')}>View protocol</button>
              </div>
            </>
          ) : (
            <>
              <h2 className="up-next-title">No scheduled doses</h2>
              <span className="up-next-meta">Add a protocol in Protocols and the schedule will appear here.</span>
              <div className="up-next-actions">
                <button type="button" className="primary-button" onClick={() => onNavigate('meds')}>Build a protocol</button>
              </div>
            </>
          )}
        </div>
        <div className="up-next-side">
          {upcoming.slice(0, 5).map((item, idx) => {
            const compound = compoundMap.get(item.protocol.compoundId)
            return (
              <div className="up-next-item" key={`${item.protocol.id}-${idx}`}>
                <Activity size={14} style={{ color: compound?.color ?? 'var(--accent)' }} />
                <div>
                  <strong style={{ fontSize: 13 }}>{compound?.name ?? 'Compound'}</strong>
                  <small>{item.protocol.dose} {item.protocol.unit} · {timeUntil(item.scheduledAt)}</small>
                </div>
                <time>{format(item.scheduledAt, 'MMM d HH:mm')}</time>
              </div>
            )
          })}
          {upcoming.length === 0 && (
            <div className="empty" style={{ padding: 16 }}>
              <CalendarClock size={18} />
              <strong>No upcoming doses</strong>
              <span>Define a protocol cadence to populate this list.</span>
            </div>
          )}
        </div>
      </section>

      {/* Status grid */}
      <section className="surface col-12">
        <div className="panel-header">
          <div>
            <span className="section-label">Now</span>
            <h3>Status</h3>
          </div>
        </div>
        <div className="stat-grid">
          <StatCard
            label="Blood pressure"
            value={latestBp ? `${latestBp.systolic}/${latestBp.diastolic}` : '—'}
            detail={
              bpGoal && latestBp
                ? `Goal ${bpGoal.target} · ${latestBp.systolic - bpGoal.target > 0 ? `${latestBp.systolic - bpGoal.target} over` : 'on target'}`
                : latestBp
                ? `${latestBp.pulse ?? '--'} bpm · ${format(parseISO(latestBp.measuredAt), 'MMM d')}`
                : 'No reading'
            }
            spark={<Sparkline values={bpSpark} />}
            tone={
              bpGoal && latestBp
                ? latestBp.systolic <= bpGoal.target
                  ? 'good'
                  : latestBp.systolic - bpGoal.target > 10
                  ? 'bad'
                  : 'warn'
                : latestBp && latestBp.systolic >= 140
                ? 'bad'
                : latestBp && latestBp.systolic >= 130
                ? 'warn'
                : undefined
            }
          />
          <StatCard
            label="Weight"
            value={weightStats.latest ? `${weightStats.latest.toFixed(1)} kg` : '—'}
            detail={
              weightGoal && weightStats.latest !== undefined
                ? `Goal ${weightGoal.target} kg · ${(weightGoal.target - weightStats.latest >= 0 ? '+' : '')}${(weightGoal.target - weightStats.latest).toFixed(1)} kg to go`
                : weightStats.delta !== undefined
                ? `${weightStats.delta >= 0 ? '+' : ''}${weightStats.delta.toFixed(1)} kg · ${weightStats.percent?.toFixed(1)}%`
                : 'Log weight with reta'
            }
            spark={<Sparkline values={weightSpark} />}
            tone={
              weightGoal && weightStats.latest !== undefined
                ? Math.abs(weightGoal.target - weightStats.latest) < 0.5
                  ? 'good'
                  : undefined
                : weightStats.delta !== undefined && weightStats.delta < 0
                ? 'good'
                : undefined
            }
          />
          <StatCard
            label="T-load (est.)"
            value={tCurve.activeNow ? `${tCurve.activeNow} mg` : '—'}
            detail={
              tCurve.lastInjection
                ? `Last ${format(parseISO(tCurve.lastInjection.takenAt), 'MMM d')} · ${tCurve.ester}`
                : 'No testosterone log'
            }
          />
          <StatCard
            label="Lab flags"
            value={String(labFlags.length)}
            detail={latestExam ? `Latest ${format(parseISO(latestExam.collectedAt), 'MMM d')}` : 'No exams'}
            tone={labFlags.length ? 'warn' : undefined}
          />
          <StatCard
            label="Mood / energy"
            value={
              latestSymptom
                ? `${latestSymptom.mood ?? '—'} / ${latestSymptom.energy ?? '—'}`
                : '—'
            }
            detail={latestSymptom ? format(parseISO(latestSymptom.recordedAt), 'MMM d') : 'Log in Symptoms'}
          />
        </div>
      </section>

      {/* Lab flags */}
      <section className="surface col-6">
        <div className="panel-header">
          <div>
            <span className="section-label">Watch list</span>
            <h3>Latest lab flags</h3>
          </div>
          <button type="button" className="ghost-button" onClick={() => onNavigate('labs')}>
            Labs <ChevronRight size={14} />
          </button>
        </div>
        {labFlags.length > 0 ? (
          <div className="stack">
            {labFlags.slice(0, 6).map((result) => (
              <div className="row" key={result.id}>
                <AlertTriangle size={14} style={{ color: 'var(--warn)' }} />
                <div>
                  <strong>{result.marker}</strong>
                  <span className="sub">{result.rawValue} {result.unit ?? ''} · ref {result.low ?? '?'}–{result.high ?? '?'}</span>
                </div>
                <span className="range-pill out">{labStatusLabel(result)}</span>
                <span />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <FlaskConical size={18} />
            <strong>No flags on latest panel</strong>
            <span>Markers within ranges, or no reference data attached.</span>
          </div>
        )}
      </section>

      {/* Recent injections */}
      <section className="surface col-6">
        <div className="panel-header">
          <div>
            <span className="section-label">Last 7 days</span>
            <h3>Recent injections</h3>
          </div>
          <button type="button" className="ghost-button" onClick={() => onNavigate('meds')}>
            Protocols <ChevronRight size={14} />
          </button>
        </div>
        {injections.length > 0 ? (
          <div className="stack">
            {injections.slice(0, 6).map((entry) => {
              const compound = compoundMap.get(entry.compoundId)
              return (
                <div className="row" key={entry.id}>
                  <span className="dot" style={{ background: compound?.color ?? 'var(--accent)' }} />
                  <div>
                    <strong>{compound?.name ?? 'Unknown'}</strong>
                    <span className="sub">{entry.rawDose ?? `${entry.dose ?? ''} ${entry.unit}`} · {entry.site || '—'}</span>
                  </div>
                  <span />
                  <time>{format(parseISO(entry.takenAt), 'MMM d HH:mm')}</time>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="empty">
            <Syringe size={18} />
            <strong>No injection history</strong>
            <span>Mark an Up Next dose as taken, or log one manually under Protocols.</span>
          </div>
        )}
      </section>
    </div>
  )
}

function labStatusLabel(r: LabResult) {
  if (r.status?.toLowerCase().includes('high')) return 'High'
  if (r.status?.toLowerCase().includes('low')) return 'Low'
  if (r.value !== undefined && r.high !== undefined && r.value > r.high) return 'High'
  if (r.value !== undefined && r.low !== undefined && r.value < r.low) return 'Low'
  return 'Flag'
}

// re-exports avoided to keep this file self-contained.
// Use of Droplet/HeartPulse retained for future tone variants.
void Droplet
void HeartPulse
