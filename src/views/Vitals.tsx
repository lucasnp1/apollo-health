import { useMemo, useState } from 'react'
import type { BodyMetric } from '../lib/db'
import { HeartPulse, Plus, Trash2 } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type VitalLog } from '../lib/db'
import { TimeRangePicker } from '../components/TimeRangePicker'
import { filterByRange, type TimeRange } from '../lib/timeRange'
import { EmptyState } from '../components/EmptyState'
import { Sparkline } from '../components/Sparkline'

export function Vitals({ vitals }: { vitals: VitalLog[] }) {
  const [range, setRange] = useState<TimeRange>('3M')
  const [form, setForm] = useState({ systolic: '', diastolic: '', pulse: '', measuredAt: new Date().toISOString().slice(0, 16), notes: '' })
  const goals = useLiveQuery(() => db.goals.toArray(), [], [])
  const bpGoal = goals.find((g) => g.kind === 'bp' && !g.achievedAt)
  const bodyMetrics = useLiveQuery(() => db.bodyMetrics.orderBy('measuredAt').toArray(), [], [])

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

  const stats = useMemo(() => {
    if (filtered.length === 0) return undefined
    const sys = filtered.map((v) => v.systolic)
    const dia = filtered.map((v) => v.diastolic)
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    return {
      meanSys: avg(sys),
      meanDia: avg(dia),
      pctElevated: (sys.filter((s) => s >= 130).length / sys.length) * 100,
      n: filtered.length,
    }
  }, [filtered])

  async function add() {
    if (!form.systolic || !form.diastolic) return
    await db.vitals.add({
      measuredAt: new Date(form.measuredAt).toISOString(),
      systolic: Number(form.systolic),
      diastolic: Number(form.diastolic),
      pulse: form.pulse ? Number(form.pulse) : undefined,
      notes: form.notes,
    })
    setForm({ systolic: '', diastolic: '', pulse: '', measuredAt: new Date().toISOString().slice(0, 16), notes: '' })
  }

  return (
    <div className="content-grid">
      <section className="surface col-12">
        <div className="panel-header">
          <div>
            <span className="section-label">Blood pressure</span>
            <h3>Trend</h3>
          </div>
          <TimeRangePicker value={range} onChange={setRange} />
        </div>
        {stats && (
          <div className="stat-grid">
            <div className="stat">
              <span className="stat-label">Mean SBP</span>
              <span className="stat-value">{stats.meanSys.toFixed(0)}</span>
              <span className="stat-detail">{stats.n} readings</span>
            </div>
            <div className="stat">
              <span className="stat-label">Mean DBP</span>
              <span className="stat-value">{stats.meanDia.toFixed(0)}</span>
            </div>
            <div className={`stat ${stats.pctElevated > 40 ? 'warn' : ''}`}>
              <span className="stat-label">% ≥130 SBP</span>
              <span className="stat-value">{stats.pctElevated.toFixed(0)}%</span>
              <span className="stat-detail">In stage 1 / stage 2</span>
            </div>
            {bpGoal && (
              <div
                className={`stat ${stats.meanSys <= bpGoal.target ? 'good' : stats.meanSys - bpGoal.target > 10 ? 'bad' : 'warn'}`}
              >
                <span className="stat-label">Goal SBP</span>
                <span className="stat-value">{bpGoal.target}</span>
                <span className="stat-detail">
                  {stats.meanSys <= bpGoal.target
                    ? 'Mean on target'
                    : `Mean ${(stats.meanSys - bpGoal.target).toFixed(0)} over`}
                </span>
              </div>
            )}
          </div>
        )}
        {chart.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chart} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="sysFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0f766e" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e7e5e4" vertical={false} />
              {/* BP zone bands */}
              <ReferenceArea y1={140} y2={200} fill="rgba(239,68,68,0.08)" />
              <ReferenceArea y1={130} y2={140} fill="rgba(245,158,11,0.08)" />
              <ReferenceArea y1={120} y2={130} fill="rgba(245,158,11,0.04)" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#a8a29e', fontSize: 11 }} />
              <YAxis domain={[60, 180]} tickLine={false} axisLine={false} tick={{ fill: '#a8a29e', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 10, color: '#0a0a0a', boxShadow: '0 8px 24px rgba(15,23,42,0.08)' }} />
              <Area type="monotone" dataKey="systolic" stroke="#0f766e" strokeWidth={2.5} fill="url(#sysFill)" />
              <Line type="monotone" dataKey="diastolic" stroke="#98a2af" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="pulse" stroke="#c084fc" strokeWidth={1.5} dot={false} />
              {bpGoal && (
                <ReferenceLine
                  y={bpGoal.target}
                  stroke="#0f766e"
                  strokeDasharray="4 4"
                  label={{ value: `Goal ${bpGoal.target}`, position: 'insideTopRight', fill: '#0f766e', fontSize: 10 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState icon={HeartPulse} title="No readings in this range" detail="Switch the time range or log a new reading." />
        )}
      </section>

      {/* Log BP + Body Composition side-by-side */}
      <section className="surface col-5">
        <div className="panel-header">
          <div>
            <span className="section-label">New reading</span>
            <h3>Log BP</h3>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Systolic
            <input inputMode="numeric" value={form.systolic} onChange={(e) => setForm({ ...form, systolic: e.target.value })} />
          </label>
          <label>
            Diastolic
            <input inputMode="numeric" value={form.diastolic} onChange={(e) => setForm({ ...form, diastolic: e.target.value })} />
          </label>
          <label>
            Pulse
            <input inputMode="numeric" value={form.pulse} onChange={(e) => setForm({ ...form, pulse: e.target.value })} />
          </label>
          <label>
            Measured at
            <input type="datetime-local" value={form.measuredAt} onChange={(e) => setForm({ ...form, measuredAt: e.target.value })} />
          </label>
          <label className="wide-field">
            Notes
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <button type="button" className="primary-button wide-field" onClick={add}><Plus size={15} /> Save</button>
        </div>
      </section>

      <BodyCompositionPanel metrics={bodyMetrics} range={range} />

      {/* History — compact, last 15 */}
      <section className="surface col-12">
        <div className="panel-header">
          <div>
            <span className="section-label">History</span>
            <h3>Recent readings</h3>
          </div>
        </div>
        <div className="stack">
          {filtered.slice().reverse().slice(0, 15).map((v) => (
            <div className="row" key={v.id}>
              <HeartPulse size={14} />
              <div>
                <strong>{v.systolic}/{v.diastolic}</strong>
                <span className="sub">{v.pulse ? `${v.pulse} bpm` : 'No pulse'}{v.notes ? ` · ${v.notes}` : ''}</span>
              </div>
              <time>{format(parseISO(v.measuredAt), 'MMM d HH:mm')}</time>
              <button type="button" className="icon-button danger" onClick={() => db.vitals.delete(v.id!)} aria-label="Delete reading">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function BodyCompositionPanel({ metrics, range }: { metrics: BodyMetric[]; range: TimeRange }) {
  const filtered = useMemo(
    () => filterByRange(metrics, range, (m) => parseISO(m.measuredAt)),
    [metrics, range],
  )
  const latest = (predicate: (m: BodyMetric) => boolean) => [...filtered].reverse().find(predicate)
  const lastWeight = latest((m) => m.weightKg !== undefined)
  const lastBf = latest((m) => m.bodyFatPct !== undefined)
  const lastWaist = latest((m) => m.waistCm !== undefined)
  const lastRhr = latest((m) => m.restingHr !== undefined)
  const lastHrv = latest((m) => m.hrvMs !== undefined)

  const weightSpark = filtered
    .filter((m) => m.weightKg !== undefined)
    .slice(-30)
    .map((m) => m.weightKg as number)
  const rhrSpark = filtered
    .filter((m) => m.restingHr !== undefined)
    .slice(-30)
    .map((m) => m.restingHr as number)
  const hrvSpark = filtered
    .filter((m) => m.hrvMs !== undefined)
    .slice(-30)
    .map((m) => m.hrvMs as number)

  const empty = filtered.length === 0
  return (
    <section className="surface col-7">
      <div className="panel-header">
        <div>
          <span className="section-label">Body</span>
          <h3>Composition &amp; cardio</h3>
        </div>
        <span className="safety-chip">From Apple Health import or manual</span>
      </div>
      {empty ? (
        <p className="panel-note">
          Nothing in this range yet. Import an Apple Health <strong>export.xml</strong> in Files to populate.
        </p>
      ) : (
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-label">Weight</span>
            <span className="stat-value">{lastWeight?.weightKg !== undefined ? `${lastWeight.weightKg.toFixed(1)} kg` : '—'}</span>
            <Sparkline values={weightSpark} />
            <span className="stat-detail">
              {lastWeight ? format(parseISO(lastWeight.measuredAt), 'MMM d') : ''}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Body fat</span>
            <span className="stat-value">{lastBf?.bodyFatPct !== undefined ? `${lastBf.bodyFatPct.toFixed(1)}%` : '—'}</span>
            <span className="stat-detail">
              {lastBf ? format(parseISO(lastBf.measuredAt), 'MMM d') : ''}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Waist</span>
            <span className="stat-value">{lastWaist?.waistCm !== undefined ? `${lastWaist.waistCm.toFixed(1)} cm` : '—'}</span>
            <span className="stat-detail">
              {lastWaist ? format(parseISO(lastWaist.measuredAt), 'MMM d') : ''}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Resting HR</span>
            <span className="stat-value">{lastRhr?.restingHr !== undefined ? `${Math.round(lastRhr.restingHr)} bpm` : '—'}</span>
            <Sparkline values={rhrSpark} />
            <span className="stat-detail">
              {lastRhr ? format(parseISO(lastRhr.measuredAt), 'MMM d') : ''}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">HRV (SDNN)</span>
            <span className="stat-value">{lastHrv?.hrvMs !== undefined ? `${Math.round(lastHrv.hrvMs)} ms` : '—'}</span>
            <Sparkline values={hrvSpark} />
            <span className="stat-detail">
              {lastHrv ? format(parseISO(lastHrv.measuredAt), 'MMM d') : ''}
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
