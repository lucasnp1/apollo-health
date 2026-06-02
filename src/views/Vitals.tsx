import { useMemo, useState } from 'react'
import { Edit2, HeartPulse, Scale, Target, Trash2, X } from 'lucide-react'
import { useTheme } from '../lib/useTheme'
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
  const [range, setRange] = useState<TimeRange>('3M')
  const [form, setForm] = useState({ systolic: '', diastolic: '', pulse: '', measuredAt: new Date().toISOString().slice(0, 16), notes: '' })
  const [editingVital, setEditingVital] = useState<VitalLog | null>(null)
  const [weightForm, setWeightForm] = useState({ weightKg: '', measuredAt: new Date().toISOString().slice(0, 16) })
  const [goalEditKind, setGoalEditKind] = useState<'weight' | 'bp' | null>(null)
  const [goalForm, setGoalForm] = useState({ target: '', label: '' })
  const goals = useLiveQuery(() => db.goals.toArray(), [], [])
  const bodyMetrics = useLiveQuery(() => db.bodyMetrics.orderBy('measuredAt').reverse().limit(50).toArray(), [], [])
  const bpGoal = goals.find((g) => g.kind === 'bp' && !g.achievedAt)
  const weightGoalRow = goals.find((g) => g.kind === 'weight' && !g.achievedAt)

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

  async function addWeight() {
    if (!weightForm.weightKg) return
    await db.bodyMetrics.add({
      measuredAt: new Date(weightForm.measuredAt).toISOString(),
      source: 'manual',
      weightKg: Number(weightForm.weightKg),
    })
    setWeightForm({ weightKg: '', measuredAt: new Date().toISOString().slice(0, 16) })
  }

  async function saveGoal() {
    if (!goalEditKind || !goalForm.target) return
    // Soft-delete existing active goal of same kind
    const existing = goals.find((g) => g.kind === goalEditKind && !g.achievedAt)
    if (existing?.id) await db.goals.update(existing.id, { achievedAt: new Date().toISOString() })
    await db.goals.add({
      kind: goalEditKind,
      label: goalForm.label || (goalEditKind === 'weight' ? 'Target weight' : 'BP target'),
      target: Number(goalForm.target),
      startedAt: new Date().toISOString(),
    })
    setGoalEditKind(null)
    setGoalForm({ target: '', label: '' })
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
              {bpGoal && (
                <ReferenceLine y={bpGoal.target} stroke="#0f766e" strokeDasharray="4 4"
                  label={{ value: `Goal ${bpGoal.target}`, position: 'insideTopRight', fill: '#0f766e', fontSize: 10 }} />
              )}
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
                <button type="button" className="icon-button danger" style={{ width: 32, height: 32 }} onClick={() => db.vitals.delete(v.id!)} aria-label="Delete">
                  <Trash2 size={13} />
                </button>
              </div>
            )})}
          </div>
        ) : (
          <EmptyState icon={HeartPulse} title="No readings yet" detail="Tap the + button above to log your first reading." />
        )}
      </section>

      {/* ── Row 3: Weight logging ── */}
      <section className="surface col-5">
        <div className="panel-header">
          <div><span className="section-label">Body weight</span><h3>Log weight</h3></div>
        </div>
        <div className="form-grid">
          <label>
            Weight (kg)
            <input inputMode="decimal" placeholder="e.g. 82.5" value={weightForm.weightKg} onChange={(e) => setWeightForm({ ...weightForm, weightKg: e.target.value })} />
          </label>
          <label>
            Measured at
            <input type="datetime-local" value={weightForm.measuredAt} onChange={(e) => setWeightForm({ ...weightForm, measuredAt: e.target.value })} />
          </label>
          <button type="button" className="primary-button wide-field" onClick={addWeight} disabled={!weightForm.weightKg}>
            <Scale size={14} /> Save weight
          </button>
        </div>
      </section>

      {/* Weight history */}
      <section className="surface col-7">
        <div className="panel-header">
          <div><span className="section-label">History</span><h3>Weight log</h3></div>
        </div>
        {(bodyMetrics?.filter((m) => m.weightKg !== undefined).length ?? 0) > 0 ? (
          <div className="stack">
            {bodyMetrics?.filter((m) => m.weightKg !== undefined).slice(0, 15).map((m) => (
              <div className="row" key={m.id}>
                <Scale size={13} style={{ color: 'var(--ink-mute)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <strong>{m.weightKg?.toFixed(1)} kg</strong>
                  <span className="sub">{m.source === 'manual' ? 'Manual entry' : m.source}</span>
                </div>
                <time>{format(parseISO(m.measuredAt), 'MMM d HH:mm')}</time>
                <button type="button" className="icon-button danger" onClick={() => db.bodyMetrics.delete(m.id!)} aria-label="Delete">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Scale} title="No weight logs" detail="Use the Weight section below." />
        )}
      </section>

      {/* ── Row 4: Goals ── */}
      <section className="surface col-12">
        <div className="panel-header">
          <div><span className="section-label">Targets</span><h3>Goals</h3></div>
        </div>

        {goalEditKind && (
          <div className="form-grid" style={{ marginBottom: 16, padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
            <label>
              {goalEditKind === 'weight' ? 'Target weight (kg)' : 'Target systolic (mmHg)'}
              <input inputMode="decimal" placeholder={goalEditKind === 'weight' ? '80' : '120'}
                value={goalForm.target} onChange={(e) => setGoalForm({ ...goalForm, target: e.target.value })} autoFocus />
            </label>
            <label>
              Label (optional)
              <input placeholder={goalEditKind === 'weight' ? 'e.g. Bulk target' : 'e.g. Keep BP low'}
                value={goalForm.label} onChange={(e) => setGoalForm({ ...goalForm, label: e.target.value })} />
            </label>
            <div className="wide-field" style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="primary-button" onClick={saveGoal} disabled={!goalForm.target}>Save goal</button>
              <button type="button" className="ghost-button" onClick={() => setGoalEditKind(null)}><X size={13} /> Cancel</button>
            </div>
          </div>
        )}

        <div className="stack">
          {/* BP goal */}
          <div className="row" style={{ alignItems: 'center' }}>
            <Target size={14} style={{ color: 'var(--ink-mute)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <strong>Blood pressure</strong>
              <span className="sub">{bpGoal ? `Target: ${bpGoal.target} mmHg systolic` : 'No target set'}</span>
            </div>
            <button type="button" className="ghost-button" style={{ fontSize: 12 }}
              onClick={() => { setGoalEditKind('bp'); setGoalForm({ target: bpGoal ? String(bpGoal.target) : '', label: bpGoal?.label ?? '' }) }}>
              <Edit2 size={12} /> {bpGoal ? 'Edit' : 'Set target'}
            </button>
            {bpGoal && (
              <button type="button" className="icon-button danger" aria-label="Remove goal"
                onClick={() => db.goals.update(bpGoal.id!, { achievedAt: new Date().toISOString() })}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
          {/* Weight goal */}
          <div className="row" style={{ alignItems: 'center' }}>
            <Scale size={14} style={{ color: 'var(--ink-mute)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <strong>Body weight</strong>
              <span className="sub">{weightGoalRow ? `Target: ${weightGoalRow.target} kg` : 'No target set'}</span>
            </div>
            <button type="button" className="ghost-button" style={{ fontSize: 12 }}
              onClick={() => { setGoalEditKind('weight'); setGoalForm({ target: weightGoalRow ? String(weightGoalRow.target) : '', label: weightGoalRow?.label ?? '' }) }}>
              <Edit2 size={12} /> {weightGoalRow ? 'Edit' : 'Set target'}
            </button>
            {weightGoalRow && (
              <button type="button" className="icon-button danger" aria-label="Remove goal"
                onClick={() => db.goals.update(weightGoalRow.id!, { achievedAt: new Date().toISOString() })}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </section>

    </div>
  )
}
