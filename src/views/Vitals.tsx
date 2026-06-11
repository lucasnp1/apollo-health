import { useMemo, useState } from 'react'
import { Edit2, HeartPulse, Trash2, X } from 'lucide-react'
import { useTheme } from '../lib/useTheme'
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
import { useUndoableDelete } from '../lib/useUndoableDelete'
import { EmptyState } from '../components/EmptyState'

// ── BP classification — ranges calibrated for steroid/TRT users ─────────────
// Standard clinical cutoffs are designed for untrained, non-medicated adults.
// Athletes on anabolic compounds typically run higher baseline BP due to
// increased cardiac output, haematocrit, and fluid retention.
// These ranges reflect community consensus from sports medicine and PED forums.
type BpStatus = 'optimal' | 'good' | 'monitor' | 'high' | 'danger'

function classifyBp(systolic: number, diastolic: number): BpStatus {
  if (systolic >= 160 || diastolic >= 105) return 'danger'
  if (systolic >= 145 || diastolic >= 95)  return 'high'
  if (systolic >= 135 || diastolic >= 88)  return 'monitor'
  if (systolic >= 125 || diastolic >= 82)  return 'good'
  return 'optimal'
}

const BP_META: Record<BpStatus, { color: string; soft: string; label: string }> = {
  optimal: { color: 'var(--good)', soft: 'var(--good-soft)', label: 'Optimal' },
  good:    { color: 'var(--good)', soft: 'var(--good-soft)', label: 'Good' },
  monitor: { color: 'var(--warn)', soft: 'var(--warn-soft)', label: 'Monitor' },
  high:    { color: 'var(--bad)',  soft: 'var(--bad-soft)',  label: 'High' },
  danger:  { color: 'var(--bad)',  soft: 'var(--bad-soft)',  label: 'Action' },
}

export function Vitals({ vitals }: { vitals: VitalLog[] }) {
  const { chart: colors } = useTheme()
  const deleteWithUndo = useUndoableDelete()
  const [range, setRange] = useState<TimeRange>('3M')
  const [form, setForm] = useState({ systolic: '', diastolic: '', pulse: '', measuredAt: new Date().toISOString().slice(0, 16), notes: '' })
  const [editingVital, setEditingVital] = useState<VitalLog | null>(null)

  const filtered = useMemo(
    () => filterByRange(vitals, range, (v) => parseISO(v.measuredAt)).slice().reverse(),
    [vitals, range],
  )
  const chart = filtered.map((v) => ({
    date: format(parseISO(v.measuredAt), 'MMM d'),
    systolic: v.systolic,
    diastolic: v.diastolic,
    pulse: v.pulse,
    statusColor: BP_META[classifyBp(v.systolic, v.diastolic)].color,
  }))

  // Custom dot — coloured by that reading's BP status
  type DotProps = { cx?: number; cy?: number; payload?: { statusColor?: string } }
  const StatusDot = ({ cx, cy, payload }: DotProps) => {
    if (cx == null || cy == null) return <></>
    return <circle cx={cx} cy={cy} r={3.5} fill={payload?.statusColor ?? '#0f766e'} stroke="var(--surface)" strokeWidth={1.5} />
  }

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

  function startEditVital(v: VitalLog) {
    setEditingVital(v)
    setForm({
      systolic: String(v.systolic),
      diastolic: String(v.diastolic),
      pulse: v.pulse !== undefined ? String(v.pulse) : '',
      measuredAt: v.measuredAt.slice(0, 16),
      notes: v.notes ?? '',
    })
  }

  function cancelEdit() {
    setEditingVital(null)
    setForm({ systolic: '', diastolic: '', pulse: '', measuredAt: new Date().toISOString().slice(0, 16), notes: '' })
  }

  async function add() {
    if (!form.systolic || !form.diastolic) return
    const data = {
      measuredAt: new Date(form.measuredAt).toISOString(),
      systolic: Number(form.systolic),
      diastolic: Number(form.diastolic),
      pulse: form.pulse ? Number(form.pulse) : undefined,
      notes: form.notes || undefined,
    }
    if (editingVital?.id !== undefined) {
      await db.vitals.update(editingVital.id, data)
      setEditingVital(null)
    } else {
      await db.vitals.add(data)
    }
    setForm({ systolic: '', diastolic: '', pulse: '', measuredAt: new Date().toISOString().slice(0, 16), notes: '' })
  }


  return (
    <div className="content-grid">

      {/* ── Edit BP bottom sheet ── */}
      {editingVital && (
        <div
          className="sheet-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) cancelEdit() }}
        >
          <div className="sheet" style={{ maxWidth: 480 }}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <h3>Edit reading</h3>
              <button type="button" className="icon-button" onClick={cancelEdit}><X size={16} /></button>
            </div>
            <div className="form-grid sheet-body">
              <label>Systolic<input inputMode="numeric" value={form.systolic} onChange={(e) => setForm({ ...form, systolic: e.target.value })} /></label>
              <label>Diastolic<input inputMode="numeric" value={form.diastolic} onChange={(e) => setForm({ ...form, diastolic: e.target.value })} /></label>
              <label>Pulse<input inputMode="numeric" value={form.pulse} onChange={(e) => setForm({ ...form, pulse: e.target.value })} /></label>
              <label>Measured at<input type="datetime-local" value={form.measuredAt} onChange={(e) => setForm({ ...form, measuredAt: e.target.value })} /></label>
              <label className="wide-field">Notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
              <button type="button" className="primary-button wide-field" style={{ height: 50, fontSize: 16 }} onClick={add} disabled={!form.systolic || !form.diastolic}>
                <Edit2 size={16} /> Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BP trend — full width ── */}
      <section className="surface col-12">
        <div className="panel-header">
          <div>
            <span className="section-label">Blood pressure</span>
            <h3>Trend
              {stats && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-dim)', marginLeft: 8 }}>
                mean {stats.meanSys.toFixed(0)}/{stats.meanDia.toFixed(0)}

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
              <CartesianGrid stroke={colors.grid} vertical={false} />
              {/* BP bands — thresholds for steroid users (not general population) */}
              <ReferenceArea y1={160} y2={200} fill="rgba(255,59,48,0.10)" />
              <ReferenceArea y1={145} y2={160} fill="rgba(255,59,48,0.06)" />
              <ReferenceArea y1={135} y2={145} fill="rgba(255,149,0,0.07)" />
              <ReferenceArea y1={60}  y2={135} fill="rgba(52,199,89,0.04)" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 10 }} />
              <YAxis domain={[60, 180]} tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 10, fontSize: 12, color: colors.tooltipText }} />
              <Area type="monotone" dataKey="systolic" stroke="#0f766e" strokeWidth={2.5} fill="url(#sysFill)" dot={<StatusDot />} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="diastolic" stroke="#98a2af" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="pulse" stroke="#c084fc" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState icon={HeartPulse} title="No readings in this range" detail="Use the + button above to log." />
        )}

        {/* TRT-aware BP insight — testosterone is a common cause of raised BP */}
        {stats && (() => {
          const meanStatus = classifyBp(Math.round(stats.meanSys), Math.round(stats.meanDia))
          if (meanStatus === 'optimal' || meanStatus === 'good') {
            return (
              <p className="panel-note" style={{ marginTop: 8, color: 'var(--good)' }}>
                ✓ BP is well controlled ({stats.meanSys.toFixed(0)}/{stats.meanDia.toFixed(0)} avg). Keep logging — anabolics can push it up over time.
              </p>
            )
          }
          const m = BP_META[meanStatus]
          return (
            <div style={{ marginTop: 10, padding: '10px 12px', background: m.soft, borderRadius: 10, borderLeft: `3px solid ${m.color}` }}>
              <strong style={{ fontSize: 13, color: m.color }}>
                {meanStatus === 'danger' ? '⚠ Action needed' : meanStatus === 'high' ? 'BP is high' : 'BP needs monitoring'}
                {' '}— avg {stats.meanSys.toFixed(0)}/{stats.meanDia.toFixed(0)}
              </strong>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-dim)', lineHeight: 1.5 }}>
                {meanStatus === 'danger'
                  ? 'This is too high on-cycle. Consider a blast break, reduce dose/compound count, add cardio, and see a doctor. Check haematocrit ASAP.'
                  : meanStatus === 'high'
                  ? 'Common on high-dose blasts or compounds like Tren, Anadrol, or Deca. Reduce sodium, increase cardio, consider an AI or dose cut. Check haematocrit next bloods.'
                  : 'Expected on anabolic protocols. Stay hydrated, manage sodium, log readings consistently. If climbing, review your compound selection or dose.'}
              </p>
            </div>
          )
        })()}
      </section>

      {/* ── Row 2: Recent readings (full width) ── */}
      <section className="surface col-12">
        <div className="panel-header">
          <div><span className="section-label">History</span><h3>Recent readings</h3></div>
        </div>
        {filtered.length > 0 ? (
          <div className="stack">
            {filtered.slice().reverse().slice(0, 20).map((v) => {
              const status = classifyBp(v.systolic, v.diastolic)
              const meta = BP_META[status]
              return (
              <div className="row" key={v.id} style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto auto auto', alignItems: 'center' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <strong style={{ color: meta.color }}>
                    {v.systolic}/{v.diastolic}
                    <span className="chip hide-mobile" style={{ background: meta.soft, color: meta.color, fontSize: 10, marginLeft: 8, verticalAlign: 'middle' }}>{meta.label}</span>
                  </strong>
                  <span className="sub">{meta.label} · {v.pulse ? `${v.pulse} bpm` : 'no pulse'}{v.notes ? ` · ${v.notes}` : ''}</span>
                </div>
                <time style={{ whiteSpace: 'nowrap' }}>{format(parseISO(v.measuredAt), 'MMM d HH:mm')}</time>
                <button type="button" className="icon-button" style={{ width: 32, height: 32 }} onClick={() => startEditVital(v)} aria-label="Edit">
                  <Edit2 size={13} />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  style={{ width: 32, height: 32 }}
                  onClick={() => {
                    const snapshot = { ...v }
                    void deleteWithUndo({
                      label: 'Reading deleted',
                      remove: () => db.vitals.delete(v.id!),
                      restore: () => db.vitals.put(snapshot),
                    })
                  }}
                  aria-label="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )})}
          </div>
        ) : (
          <EmptyState icon={HeartPulse} title="No readings yet" detail="Tap the + button above to log your first reading." />
        )}
      </section>

    </div>
  )
}
