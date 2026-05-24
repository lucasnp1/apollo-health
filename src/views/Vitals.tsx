import { useMemo, useState } from 'react'
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

export function Vitals({ vitals }: { vitals: VitalLog[] }) {
  const [range, setRange] = useState<TimeRange>('3M')
  const [form, setForm] = useState({ systolic: '', diastolic: '', pulse: '', measuredAt: new Date().toISOString().slice(0, 16), notes: '' })
  const goals = useLiveQuery(() => db.goals.toArray(), [], [])
  const bpGoal = goals.find((g) => g.kind === 'bp' && !g.achievedAt)

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

      {/* ── Row 1: Log form (left) + BP chart (right) ── */}
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

      {/* BP trend + stats — col-7 sits beside the form */}
      <section className="surface col-7">
        <div className="panel-header">
          <div>
            <span className="section-label">Blood pressure</span>
            <h3>Trend
              {stats && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-dim)', marginLeft: 8 }}>
                mean {stats.meanSys.toFixed(0)}/{stats.meanDia.toFixed(0)}
                {bpGoal ? ` · goal ${bpGoal.target}` : ''}
              </span>}
            </h3>
          </div>
          <TimeRangePicker value={range} onChange={setRange} />
        </div>
        {chart.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="sysFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0f766e" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e7e5e4" vertical={false} />
              <ReferenceArea y1={140} y2={200} fill="rgba(239,68,68,0.08)" />
              <ReferenceArea y1={130} y2={140} fill="rgba(245,158,11,0.08)" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#a8a29e', fontSize: 10 }} />
              <YAxis domain={[60, 180]} tickLine={false} axisLine={false} tick={{ fill: '#a8a29e', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 10, fontSize: 12 }} />
              <Area type="monotone" dataKey="systolic" stroke="#0f766e" strokeWidth={2.5} fill="url(#sysFill)" />
              <Line type="monotone" dataKey="diastolic" stroke="#98a2af" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="pulse" stroke="#c084fc" strokeWidth={1.5} dot={false} />
              {bpGoal && (
                <ReferenceLine y={bpGoal.target} stroke="#0f766e" strokeDasharray="4 4"
                  label={{ value: `Goal ${bpGoal.target}`, position: 'insideTopRight', fill: '#0f766e', fontSize: 10 }} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState icon={HeartPulse} title="No readings in this range" detail="Log a reading on the left." />
        )}
      </section>

      {/* ── Row 2: Recent readings (col-6) + Body comp (col-6) ── */}
      <section className="surface col-6">
        <div className="panel-header">
          <div><span className="section-label">History</span><h3>Recent readings</h3></div>
        </div>
        {filtered.length > 0 ? (
          <div className="stack">
            {filtered.slice().reverse().slice(0, 12).map((v) => (
              <div className="row" key={v.id}>
                <HeartPulse size={13} />
                <div>
                  <strong>{v.systolic}/{v.diastolic}</strong>
                  <span className="sub">{v.pulse ? `${v.pulse} bpm` : 'No pulse'}{v.notes ? ` · ${v.notes}` : ''}</span>
                </div>
                <time>{format(parseISO(v.measuredAt), 'MMM d HH:mm')}</time>
                <button type="button" className="icon-button danger" onClick={() => db.vitals.delete(v.id!)} aria-label="Delete">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={HeartPulse} title="No readings yet" detail="Log your first reading above." />
        )}
      </section>


    </div>
  )
}
