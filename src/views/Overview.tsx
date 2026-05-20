import { useMemo } from 'react'
import { AlertTriangle, CalendarClock, ChevronRight, Droplet, FlaskConical, HeartPulse } from 'lucide-react'
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
import { Sparkline } from '../components/Sparkline'
import { StatCard } from '../components/StatCard'
import type { View } from '../app/views'
import type { QuickLogPrefill } from '../App'

export function Overview({
  compounds,
  injections,
  vitals,
  exams,
  results,
  onNavigate,
  onOpenQuickLog,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  vitals: VitalLog[]
  exams: LabExam[]
  results: EnrichedResult[]
  onNavigate: (view: View) => void
  onOpenQuickLog: (tab: 'injection', prefill?: QuickLogPrefill) => void
}) {
  const protocols = useLiveQuery(() => db.protocols.toArray(), [], [])
  const protocolDoses = useLiveQuery(() => db.protocolDoses.toArray(), [], [])
  const symptoms = useLiveQuery(() => db.symptoms.orderBy('recordedAt').reverse().toArray(), [], [])
  const goals = useLiveQuery(() => db.goals.toArray(), [], [])
  const weightGoal = goals.find((g) => g.kind === 'weight' && !g.achievedAt)
  const bpGoal = goals.find((g) => g.kind === 'bp' && !g.achievedAt)
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

  return (
    <div className="content-grid">

      {/* ── 1. Status — always first ── */}
      <section className="surface col-12">
        <div className="panel-header">
          <div><span className="section-label">Now</span><h3>Status</h3></div>
        </div>
        <div className="stat-grid">
          <StatCard
            label="Blood pressure"
            value={latestBp ? `${latestBp.systolic}/${latestBp.diastolic}` : '—'}
            detail={
              bpGoal && latestBp
                ? `Goal ${bpGoal.target} · ${latestBp.systolic - bpGoal.target > 0 ? `${latestBp.systolic - bpGoal.target} over` : 'on target'}`
                : latestBp ? `${latestBp.pulse ?? '--'} bpm · ${format(parseISO(latestBp.measuredAt), 'MMM d')}` : 'No reading'
            }
            spark={<Sparkline values={bpSpark} />}
            tone={
              bpGoal && latestBp
                ? latestBp.systolic <= bpGoal.target ? 'good' : latestBp.systolic - bpGoal.target > 10 ? 'bad' : 'warn'
                : latestBp && latestBp.systolic >= 140 ? 'bad' : latestBp && latestBp.systolic >= 130 ? 'warn' : undefined
            }
          />
          <StatCard
            label="Weight"
            value={weightStats.latest ? `${weightStats.latest.toFixed(1)} kg` : '—'}
            detail={
              weightGoal && weightStats.latest !== undefined
                ? `Goal ${weightGoal.target} kg · ${(weightGoal.target - weightStats.latest >= 0 ? '+' : '')}${(weightGoal.target - weightStats.latest).toFixed(1)} kg to go`
                : weightStats.delta !== undefined ? `${weightStats.delta >= 0 ? '+' : ''}${weightStats.delta.toFixed(1)} kg · ${weightStats.percent?.toFixed(1)}%` : 'No weight data'
            }
            spark={<Sparkline values={weightSpark} />}
            tone={
              weightGoal && weightStats.latest !== undefined
                ? Math.abs(weightGoal.target - weightStats.latest) < 0.5 ? 'good' : undefined
                : weightStats.delta !== undefined && weightStats.delta < 0 ? 'good' : undefined
            }
          />
          <StatCard
            label="T-load (est.)"
            value={tCurve.activeNow ? `${tCurve.activeNow} mg` : '—'}
            detail={tCurve.lastInjection ? `Last ${format(parseISO(tCurve.lastInjection.takenAt), 'MMM d')} · ${tCurve.ester}` : 'No testosterone log'}
          />
          <StatCard
            label="Lab flags"
            value={String(labFlags.length)}
            detail={latestExam ? `Latest ${format(parseISO(latestExam.collectedAt), 'MMM d')}` : 'No exams'}
            tone={labFlags.length ? 'warn' : undefined}
          />
          <StatCard
            label="Mood / energy"
            value={latestSymptom ? `${latestSymptom.mood ?? '—'} / ${latestSymptom.energy ?? '—'}` : '—'}
            detail={latestSymptom ? format(parseISO(latestSymptom.recordedAt), 'MMM d') : 'Log via quick log'}
          />
        </div>
      </section>

      {/* ── 2. Upcoming doses (col-6) + Lab flags (col-6) ── */}
      <section className="surface col-6">
        <div className="panel-header">
          <div><span className="section-label">Schedule · next 7 days</span><h3>Upcoming doses</h3></div>
          <button type="button" className="ghost-button" onClick={() => onNavigate('meds')}>
            Protocols <ChevronRight size={14} />
          </button>
        </div>
        {head ? (
          <div className="stack">
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 10, alignItems: 'center', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '9px 12px' }}>
              <span className="dot" style={{ background: headCompound?.color ?? 'var(--accent)', width: 9, height: 9 }} />
              <div>
                <strong style={{ fontSize: 13 }}>{headCompound?.name ?? 'Dose'}</strong>
                <span className="sub">{head.protocol.dose} {head.protocol.unit} · {format(head.scheduledAt, 'EEE MMM d, HH:mm')}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-ink)', background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                {timeUntil(head.scheduledAt)}
              </span>
              <button
                type="button"
                className="primary-button"
                style={{ height: 28, fontSize: 11, padding: '0 10px', whiteSpace: 'nowrap' }}
                onClick={() => onOpenQuickLog('injection', { compoundId: head.protocol.compoundId, dose: head.protocol.dose, unit: head.protocol.unit, protocolId: head.protocol.id, scheduledAt: head.scheduledAt.toISOString() })}
              >
                Mark taken
              </button>
            </div>
            {upcoming.slice(1).map((item, idx) => {
              const compound = compoundMap.get(item.protocol.compoundId)
              return (
                <div key={`${item.protocol.id}-${idx}`} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 10, alignItems: 'center', padding: '5px 4px' }}>
                  <span className="dot" style={{ background: compound?.color ?? 'var(--accent)', opacity: 0.55 }} />
                  <div>
                    <strong style={{ fontSize: 12 }}>{compound?.name ?? 'Compound'}</strong>
                    <span className="sub">{item.protocol.dose} {item.protocol.unit}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--ink-mute)', whiteSpace: 'nowrap' }}>{timeUntil(item.scheduledAt)}</span>
                  <time style={{ fontSize: 11, color: 'var(--ink-dim)', whiteSpace: 'nowrap' }}>{format(item.scheduledAt, 'MMM d')}</time>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="empty">
            <CalendarClock size={16} />
            <strong>No scheduled doses</strong>
            <span>Add a protocol to populate this list.</span>
            <button type="button" className="primary-button" onClick={() => onNavigate('meds')}>Set up protocols</button>
          </div>
        )}
      </section>

      <section className="surface col-6">
        <div className="panel-header">
          <div><span className="section-label">Watch list</span><h3>Lab flags</h3></div>
          <button type="button" className="ghost-button" onClick={() => onNavigate('labs')}>
            Labs <ChevronRight size={14} />
          </button>
        </div>
        {labFlags.length > 0 ? (
          <div className="stack">
            {labFlags.slice(0, 6).map((result) => (
              <div className="row" key={result.id}>
                <AlertTriangle size={13} style={{ color: 'var(--warn)' }} />
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
            <FlaskConical size={16} />
            <strong>No flags on latest panel</strong>
            <span>All markers within range, or no reference data yet.</span>
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

// Droplet / HeartPulse retained for future tone variants.
void Droplet
void HeartPulse
