import { useMemo, useState } from 'react'
import { HeartPulse, Plus, Trash2 } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { db, type VitalLog } from '../lib/db'
import { TimeRangePicker } from '../components/TimeRangePicker'
import { filterByRange, type TimeRange } from '../lib/timeRange'
import { EmptyState } from '../components/EmptyState'

export function Vitals({ vitals }: { vitals: VitalLog[] }) {
  const [range, setRange] = useState<TimeRange>('3M')
  const [form, setForm] = useState({ systolic: '', diastolic: '', pulse: '', measuredAt: new Date().toISOString().slice(0, 16), notes: '' })

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
          </div>
        )}
        {chart.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chart} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="sysFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5eead4" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#5eead4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1f242b" vertical={false} />
              {/* BP zone bands */}
              <ReferenceArea y1={140} y2={200} fill="rgba(239,68,68,0.08)" />
              <ReferenceArea y1={130} y2={140} fill="rgba(245,158,11,0.08)" />
              <ReferenceArea y1={120} y2={130} fill="rgba(245,158,11,0.04)" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#6b7480', fontSize: 11 }} />
              <YAxis domain={[60, 180]} tickLine={false} axisLine={false} tick={{ fill: '#6b7480', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#13171c', border: '1px solid #2a313a', borderRadius: 8, color: '#e6ebf1' }} />
              <Area type="monotone" dataKey="systolic" stroke="#5eead4" strokeWidth={2.5} fill="url(#sysFill)" />
              <Line type="monotone" dataKey="diastolic" stroke="#98a2af" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="pulse" stroke="#c084fc" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState icon={HeartPulse} title="No readings in this range" detail="Switch the time range or log a new reading." />
        )}
      </section>

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

      <section className="surface col-7">
        <div className="panel-header">
          <div>
            <span className="section-label">History</span>
            <h3>Recent</h3>
          </div>
        </div>
        <div className="stack">
          {filtered.slice().reverse().slice(0, 20).map((v) => (
            <div className="row" key={v.id}>
              <HeartPulse size={14} />
              <div>
                <strong>{v.systolic}/{v.diastolic}</strong>
                <span className="sub">{v.pulse ? `${v.pulse} bpm` : 'No pulse'} · {v.notes || 'No notes'}</span>
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
