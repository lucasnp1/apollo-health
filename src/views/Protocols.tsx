import { useMemo, useState } from 'react'
import type { SimpleScheduleItem } from '../lib/schedule'
import { useTheme } from '../lib/useTheme'
import {
  Archive, CheckCircle2, Clock, Pencil, Plus, Syringe, Trash2, X,
} from 'lucide-react'
import { differenceInHours, format, parseISO, subDays } from 'date-fns'
import {
  Bar, CartesianGrid, ComposedChart,
  Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  type Compound,
  type InjectionLog,
  type Protocol,
} from '../lib/db'
import {
  buildWeightDoseSeries,
  weightSummary,
} from '../lib/insights'
import { describeCadence, simpleUpcomingSchedule } from '../lib/schedule'
import { skipScheduledDose } from '../lib/injections'
import { deleteInjection } from '../lib/injections'
import { findPKCompound, buildDailyReleaseCurve } from '../lib/pk'
import { EmptyState } from '../components/EmptyState'
import { SiteCombobox } from '../components/SiteCombobox'
import { TimeRangePicker } from '../components/TimeRangePicker'
import type { TimeRange } from '../lib/timeRange'

export function Protocols({
  compounds,
  injections,
  onOpenQuickLog,
  onOpenWizard,
  onEditProtocol,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  onOpenQuickLog: (tab: 'injection', prefill?: import('../App').QuickLogPrefill) => void
  onOpenWizard: () => void
  onEditProtocol: (p: Protocol & { id: number }) => void
}) {
  const protocols = useLiveQuery(() => db.protocols.toArray(), [], [])
  const protocolDoses = useLiveQuery(() => db.protocolDoses.toArray(), [], [])
  const activeProtocols = useMemo(
    () => (protocols ?? []).filter(p => !p.archived),
    [protocols],
  )
  const schedule = useMemo(
    () => simpleUpcomingSchedule(activeProtocols, injections, protocolDoses),
    [activeProtocols, injections, protocolDoses],
  )

  return (
    <div className="content-grid">

      {/* ── 1. MY COMPOUNDS ──────────────────────────────────────────────── */}
      <section className="surface col-12">
        <div className="panel-header">
          <div>
            <span className="section-label">Active</span>
            <h3>My compounds</h3>
          </div>
        </div>
        {activeProtocols.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeProtocols.map((p) => {
              const schedItem = schedule.find(s => s.protocol.id === p.id)
              return (
                <CompoundCard
                  key={p.id}
                  protocol={p}
                  compounds={compounds}
                  injections={injections}
                  schedItem={schedItem}
                  onLog={onOpenQuickLog}
                  onEdit={p.id !== undefined ? () => onEditProtocol(p as Protocol & { id: number }) : undefined}
                />
              )
            })}
          </div>
        ) : (
          <div className="empty">
            <Syringe size={22} />
            <strong>Nothing set up yet</strong>
            <span>Add a compound to track your schedule and doses.</span>
            <button type="button" className="primary-button" onClick={onOpenWizard}>
              <Plus size={14} /> Add compound
            </button>
          </div>
        )}
      </section>

      {/* ── 2. RECENT DOSES ─────────────────────────────────────────────── */}
      <section className="surface col-12">
        <RecentDoses injections={injections} compounds={compounds} />
      </section>

    </div>
  )
}

// ── Compound card — shows next due, last injection, Log button ─────────────

function CompoundCard({
  protocol,
  compounds,
  injections,
  schedItem,
  onLog,
  onEdit,
}: {
  protocol: Protocol
  compounds: Compound[]
  injections: InjectionLog[]
  schedItem?: SimpleScheduleItem
  onLog: (tab: 'injection', prefill?: import('../App').QuickLogPrefill) => void
  onEdit?: () => void
}) {
  const compound = compounds.find(c => c.id === protocol.compoundId)
  const color = compound?.color ?? 'var(--accent)'
  const lastInj = injections.find(i => i.compoundId === protocol.compoundId)
  const hoursSince = lastInj ? differenceInHours(new Date(), parseISO(lastInj.takenAt)) : undefined

  const lastLabel = hoursSince === undefined ? 'Never injected'
    : hoursSince < 1   ? 'Just now'
    : hoursSince < 24  ? `${Math.round(hoursSince)}h ago`
    : `${Math.round(hoursSince / 24)}d ago`

  const overdue = schedItem?.isOverdue ?? false
  const nextLabel = !schedItem ? null
    : overdue
      ? `${Math.round(Math.abs(schedItem.daysUntil))}d overdue`
      : schedItem.daysUntil < 0.5 ? 'Due now'
      : schedItem.daysUntil < 1   ? 'Due today'
      : `Due ${format(schedItem.nextDue, 'EEE MMM d')}`

  return (
    <div style={{
      background: 'var(--surface-2)',
      borderRadius: 'var(--radius)',
      border: `1.5px solid ${overdue ? 'var(--bad)' : 'var(--line)'}`,
      borderLeft: `4px solid ${color}`,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Top row: name + actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.01 }}>
            {compound?.name ?? protocol.name}
            {compound?.ester && <span style={{ fontWeight: 400, color: 'var(--ink-mute)', marginLeft: 6, fontSize: 13 }}>{compound.ester}</span>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 2 }}>
            {protocol.dose} {protocol.unit} · {describeCadence(protocol.cadence)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {onEdit && (
            <button type="button" className="icon-button" style={{ width: 30, height: 30 }} onClick={onEdit} aria-label="Edit">
              <Pencil size={13} />
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            style={{ width: 30, height: 30 }}
            onClick={() => protocol.id !== undefined && db.protocols.update(protocol.id, { archived: true })}
            aria-label="Archive"
          >
            <Archive size={13} />
          </button>
        </div>
      </div>

      {/* Bottom row: last injection + next due + Log button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Last injection */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <CheckCircle2 size={13} style={{ color: hoursSince !== undefined ? 'var(--good)' : 'var(--ink-mute)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--ink-mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {lastLabel}
          </span>
        </div>

        {/* Next due */}
        {nextLabel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <Clock size={12} style={{ color: overdue ? 'var(--bad)' : 'var(--accent)', flexShrink: 0 }} />
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: overdue ? 'var(--bad)' : 'var(--accent)',
              background: overdue ? 'var(--bad-soft)' : 'var(--accent-soft)',
              padding: '2px 8px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
            }}>
              {nextLabel}
            </span>
          </div>
        )}

        {/* Skip (only shown for overdue rows — lets the user clear an
            already-missed dose without logging a fake injection) */}
        {overdue && schedItem?.nextDue && protocol.id !== undefined && (
          <button
            type="button"
            className="ghost-button"
            style={{ height: 34, fontSize: 12, padding: '0 12px', flexShrink: 0 }}
            onClick={() => skipScheduledDose(protocol.id!, schedItem.nextDue.toISOString())}
            title="Mark this dose as skipped"
          >
            Skip
          </button>
        )}
        {/* Log button */}
        <button
          type="button"
          className="primary-button"
          style={{ height: 34, fontSize: 13, padding: '0 16px', background: color, flexShrink: 0 }}
          onClick={() => onLog('injection', {
            compoundId: protocol.compoundId,
            dose: protocol.dose,
            unit: protocol.unit,
            protocolId: protocol.id,
            scheduledAt: schedItem?.nextDue.toISOString(),
          })}
        >
          Log
        </button>
      </div>
    </div>
  )
}

// ── Site rotation heatmap (compact) ───────────────────────────────────────

// ── Multi-compound PK curve chart ─────────────────────────────────────────

function PKCurvePanel({ compounds, injections }: { compounds: Compound[]; injections: InjectionLog[] }) {
  const { chart: colors } = useTheme()
  const [range, setRange] = useState<TimeRange>('3M')

  // Determine window: past N days + 30-day clearance tail
  const windowDays = range === '1M' ? 30 : range === '3M' ? 90 : range === '6M' ? 180 : 365
  const tailDays = 30
  const totalDays = windowDays + tailDays
  const startDate = useMemo(() => subDays(new Date(), windowDays), [windowDays])

  // Group injections by compoundId — only those within a relevant lookback (5 half-lives before start)
  const compoundMap = useMemo(() => new Map(compounds.map((c) => [c.id!, c])), [compounds])

  // Build chart data: one row per day, one key per compound
  const { chartData, traces } = useMemo(() => {
    const startMs = startDate.getTime()

    // Find unique compounds that have injection logs
    const usedIds = [...new Set(injections.map((i) => i.compoundId))]
    const usedCompounds = usedIds.map((id) => compoundMap.get(id)).filter(Boolean) as Compound[]

    if (usedCompounds.length === 0) return { chartData: [], traces: [] }

    // Group by resolved PK compound (compound + form key).
    // Multiple user compounds that map to the same PK profile are MERGED into one
    // trace — their injections are pooled and their release curves are summed.
    // This prevents duplicate stat-cards/lines when the user has e.g. both a
    // "Testosterone E" and an older "Test E" compound that both resolve to
    // Testosterone Enanthate.
    type MergeEntry = {
      compound: Compound                           // first compound found (for display)
      pk: NonNullable<ReturnType<typeof findPKCompound>>
      compoundIds: number[]                        // all compound ids contributing
      injList: Array<{ takenAt: string; dose: number }>
    }
    const pkKey = (pk: NonNullable<ReturnType<typeof findPKCompound>>) =>
      `${pk.compound}|${pk.form}`
    const mergedMap = new Map<string, MergeEntry>()

    for (const c of usedCompounds) {
      const pk = findPKCompound(c.name, c.ester ?? undefined)
      if (!pk) continue
      const key = pkKey(pk)
      if (!mergedMap.has(key)) {
        mergedMap.set(key, { compound: c, pk, compoundIds: [], injList: [] })
      }
      const entry = mergedMap.get(key)!
      entry.compoundIds.push(c.id!)
      const cInj = injections
        .filter((i) => i.compoundId === c.id && i.dose !== undefined && !i.deletedAtSync)
        .map((i) => ({ takenAt: i.takenAt, dose: i.dose! }))
      entry.injList.push(...cInj)
    }

    // Build a curve per merged group
    const traceData: {
      compound: Compound
      pk: NonNullable<ReturnType<typeof findPKCompound>>
      compoundIds: number[]
      values: number[]
    }[] = []

    for (const { compound, pk, compoundIds, injList } of mergedMap.values()) {
      if (injList.length === 0) continue
      const lookback = pk.halfLifeDays * 5
      const raw = buildDailyReleaseCurve(
        pk, injList,
        startMs - lookback * 86_400_000,
        totalDays + Math.ceil(lookback),
      )
      const offset = Math.ceil(lookback)
      traceData.push({ compound, pk, compoundIds, values: raw.slice(offset, offset + totalDays) })
    }

    // Assign stable chart-key using the PK compound label (e.g. "Testosterone · Enanthate")
    // so that even if two user compounds merge, the key is unique and stable.
    const traceKey = (t: (typeof traceData)[0]) =>
      t.pk.form ? `${t.pk.compound} · ${t.pk.form}` : t.pk.compound

    // Merge into chart format
    const rows: Record<string, number | string>[] = []
    for (let d = 0; d < totalDays; d++) {
      const row: Record<string, number | string> = {
        date: format(new Date(startMs + d * 86_400_000), 'MMM d'),
        dayOffset: d - windowDays,
      }
      for (const t of traceData) {
        row[traceKey(t)] = parseFloat((t.values[d] ?? 0).toFixed(2))
      }
      rows.push(row)
    }

    return {
      chartData: rows,
      traces: traceData.map((t) => ({
        name: traceKey(t),
        color: t.compound.color ?? '#0f766e',
        halfLifeDays: t.pk.halfLifeDays,
        activeDosePct: t.pk.activeDosePct,
        form: t.pk.form,
        activeNow: parseFloat((t.values[windowDays - 1] ?? 0).toFixed(1)),
        lastInj: injections
          .filter((i) => t.compoundIds.includes(i.compoundId) && !i.deletedAtSync)
          .sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0],
      })),
    }
  }, [injections, compoundMap, startDate, windowDays, totalDays])

  const todayLabel = format(new Date(), 'MMM d')

  if (traces.length === 0) return null

  return (
    <section className="surface col-12">
      <div className="panel-header">
        <div>
          <span className="section-label">Pharmacokinetics</span>
          <h3>Release rate — all compounds</h3>
        </div>
        <TimeRangePicker value={range} onChange={setRange} />
      </div>

      {/* Stats row — one card per active compound */}
      <div className="stat-grid" style={{ marginBottom: 12 }}>
        {traces.map((t) => (
          <div className="stat" key={t.name} style={{ borderLeft: `3px solid ${t.color}`, paddingLeft: 10 }}>
            <span className="stat-label">{t.name}{t.form ? ` · ${t.form}` : ''}</span>
            <span className="stat-value" style={{ color: t.color }}>{t.activeNow > 0 ? `${t.activeNow} mg/d` : '—'}</span>
            <span className="stat-detail">
              t½ {t.halfLifeDays}d · {t.activeDosePct}% active
              {t.lastInj ? ` · last ${format(parseISO(t.lastInj.takenAt), 'MMM d')}` : ''}
            </span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 10, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={colors.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fill: colors.tick, fontSize: 10 }}
            interval={Math.floor(totalDays / 8)}
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: '#a8a29e', fontSize: 10 }} unit=" mg/d" width={56} />
          <Tooltip
            contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 10, fontSize: 12, color: colors.tooltipText }}
            formatter={(v: unknown, name: unknown) => [`${Number(v).toFixed(1)} mg/day`, String(name)]}
          />
          <ReferenceLine
            x={todayLabel}
            stroke="#94a3b8"
            strokeDasharray="4 3"
            label={{ value: 'Today', position: 'insideTopRight', fill: '#94a3b8', fontSize: 10 }}
          />
          {traces.map((t) => (
            <Line
              key={t.name}
              type="monotone"
              dataKey={t.name}
              stroke={t.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <p className="panel-note">
        Release(t) = Dose × active% × e<sup>−t×λ</sup> × λ &nbsp;·&nbsp; λ = ln 2 / t½ &nbsp;·&nbsp; Source: Behre &amp; Nieschlag 1998
      </p>
    </section>
  )
}

// ── Weight / dose chart ────────────────────────────────────────────────────

function RetaChart({ compounds, injections }: { compounds: Compound[]; injections: InjectionLog[] }) {
  const { chart: colors } = useTheme()
  const series = buildWeightDoseSeries(compounds, injections)
  const stats = weightSummary(series)
  const chartData = series.filter((p) => p.weight !== undefined || p.dose !== undefined).slice(-24)
  if (chartData.length === 0) return null

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Peptide</span>
          <h3>Dose vs weight</h3>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {stats.latest && <span className="chip">{stats.latest.toFixed(1)} kg</span>}
          {stats.delta !== undefined && (
            <span className={`chip ${stats.delta < 0 ? 'good' : ''}`}>{stats.delta.toFixed(1)} kg</span>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={colors.grid} vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 11 }} />
          <YAxis yAxisId="weight" tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 11 }} />
          <YAxis yAxisId="dose" orientation="right" tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 11 }} />
          <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 10, fontSize: 12 }} />
          <Bar yAxisId="dose" dataKey="dose" fill="#60a5fa" opacity={0.45} radius={[4, 4, 0, 0]} />
          <Line yAxisId="weight" type="monotone" dataKey="weight" stroke="#0f766e" strokeWidth={2.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  )
}

// ── Recent doses ──────────────────────────────────────────────────────────

function RecentDoses({ injections, compounds }: { injections: InjectionLog[]; compounds: Compound[] }) {
  const compoundMap = new Map(compounds.map((c) => [c.id, c]))
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [editEntry, setEditEntry] = useState<InjectionLog | null>(null)

  async function handleDelete(id: number) {
    await deleteInjection(id)
    setConfirmId(null)
  }

  return (
    <>
      {confirmId !== null && (
        <ConfirmDialog
          message="Delete this injection log?"
          onConfirm={() => handleDelete(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}
      {editEntry && (
        <EditInjectionModal
          entry={editEntry}
          compounds={compounds}
          onClose={() => setEditEntry(null)}
        />
      )}
      <div className="panel-header">
        <div>
          <span className="section-label">History</span>
          <h3>Recent doses</h3>
        </div>
      </div>
      {injections.length > 0 ? (
        <div className="stack">
          {injections.slice(0, 10).map((entry) => {
            const c = compoundMap.get(entry.compoundId)
            return (
              <div className="row" key={entry.id} style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto auto auto' }}>
                <span className="dot" style={{ background: c?.color ?? 'var(--accent)' }} />
                <div style={{ minWidth: 0 }}>
                  <strong>{c?.name ?? 'Unknown'}</strong>
                  <span className="sub">
                    {entry.rawDose ?? `${entry.dose ?? ''} ${entry.unit}`}
                    {entry.site ? ` · ${entry.site}` : ''}
                    {entry.weightKg !== undefined ? ` · ${entry.weightKg} kg` : ''}
                    {entry.notes ? ` · ${entry.notes}` : ''}
                  </span>
                </div>
                <time>{format(parseISO(entry.takenAt), 'MMM d HH:mm')}</time>
                <button type="button" className="icon-button" onClick={() => setEditEntry(entry)} aria-label="Edit">
                  <Pencil size={13} />
                </button>
                <button type="button" className="icon-button danger" onClick={() => setConfirmId(entry.id!)} aria-label="Delete">
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState icon={Syringe} title="No injections logged" detail="Tap Log on a protocol row or use Quick Log in the sidebar." />
      )}
    </>
  )
}

// ── Confirm dialog ─────────────────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,10,10,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onCancel}
    >
      <div
        style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: '24px', maxWidth: 360, width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <strong style={{ fontSize: 15, display: 'block', marginBottom: 6 }}>Are you sure?</strong>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-dim)' }}>{message}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary-button" style={{ background: 'var(--bad)' }} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── Edit injection modal ───────────────────────────────────────────────────

function EditInjectionModal({ entry, compounds, onClose }: { entry: InjectionLog; compounds: Compound[]; onClose: () => void }) {
  const [compoundId, setCompoundId] = useState(entry.compoundId)
  const [dose, setDose] = useState(String(entry.dose ?? ''))
  const [route, setRoute] = useState<'IM' | 'SubQ' | 'Oral' | 'Other'>(entry.route ?? 'IM')
  const [site, setSite] = useState(entry.site ?? '')
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [takenAt, setTakenAt] = useState(entry.takenAt.slice(0, 16))
  const [busy, setBusy] = useState(false)
  const compound = compounds.find((c) => c.id === compoundId)

  // Recent sites for the combobox
  const recentInjections = useLiveQuery(() => db.injections.orderBy('takenAt').reverse().limit(30).toArray(), [], [])
  const recentSites = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const inj of recentInjections ?? []) {
      if (inj.site && !seen.has(inj.site)) { seen.add(inj.site); out.push(inj.site) }
      if (out.length >= 6) break
    }
    return out
  }, [recentInjections])

  async function save() {
    setBusy(true)
    try {
      await db.injections.update(entry.id!, {
        compoundId,
        dose: dose ? Number(dose) : undefined,
        rawDose: dose ? `${dose} ${compound?.unit ?? entry.unit}` : entry.rawDose,
        unit: (compound?.unit ?? entry.unit) as InjectionLog['unit'],
        route,
        site: site || undefined,
        notes: notes || undefined,
        takenAt: new Date(takenAt).toISOString(),
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h3>Edit injection</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <div className="sheet-body">
          <div className="form-grid">
            <label className="wide-field">
              Compound
              <select value={compoundId} onChange={(e) => setCompoundId(Number(e.target.value))}>
                {compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>
              Dose ({compound?.unit ?? entry.unit})
              <input inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} />
            </label>
            <label>
              Route
              <select value={route} onChange={(e) => setRoute(e.target.value as typeof route)}>
                <option value="IM">IM (Intramuscular)</option>
                <option value="SubQ">SubQ (Subcutaneous)</option>
                <option value="Oral">Oral</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label>
              Site
              <SiteCombobox value={site} onChange={setSite} recentSites={recentSites} />
            </label>
            <label className="wide-field">
              Date &amp; time
              <input type="datetime-local" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} />
            </label>
            <label className="wide-field">
              Notes
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
            </label>
            <button type="button" className="primary-button wide-field" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Retained for future use — not currently rendered
void PKCurvePanel; void RetaChart
