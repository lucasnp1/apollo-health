import { useMemo, useState } from 'react'
import {
  Calendar, Droplet, Pencil, Plus, Syringe, Trash2, X,
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
  type Vial,
} from '../lib/db'
import {
  buildWeightDoseSeries,
  weightSummary,
} from '../lib/insights'
import { describeCadence } from '../lib/schedule'
import { deleteInjection, pickActiveVial } from '../lib/injections'
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
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  onOpenQuickLog: (tab: 'injection', prefill?: import('../App').QuickLogPrefill) => void
  onOpenWizard: () => void
}) {
  const protocols = useLiveQuery(() => db.protocols.toArray(), [], [])
  const vials = useLiveQuery(() => db.vials.toArray(), [], [])

  const activeProtocols = (protocols ?? []).filter((p) => !p.archived)

  return (
    <div className="content-grid">

      {/* ── 1. ACTIVE PROTOCOLS ──────────────────────────────────────────── */}
      <section className="surface col-12">
        <div className="panel-header">
          <div>
            <span className="section-label">Active</span>
            <h3>My protocols</h3>
          </div>
        </div>
        {activeProtocols.length > 0 ? (
          <div className="stack">
            {activeProtocols.map((p) => (
              <ProtocolQuickRow
                key={p.id}
                protocol={p}
                compounds={compounds}
                vials={vials ?? []}
                injections={injections}
                onLog={onOpenQuickLog}
              />
            ))}
          </div>
        ) : (
          <div className="empty">
            <Syringe size={16} />
            <strong>No protocols yet</strong>
            <span>Tap "Create protocol" to set up your first compound and schedule.</span>
            <button type="button" className="primary-button" onClick={onOpenWizard}>
              <Plus size={14} /> Create protocol
            </button>
          </div>
        )}
      </section>

      {/* ── 2. RECENT DOSES ─────────────────────────────────────────────── */}
      <section className="surface col-12">
        <RecentDoses injections={injections} compounds={compounds} vials={vials ?? []} />
      </section>

      {/* ── 3. VIALS & ARCHIVE ──────────────────────────────────────────── */}
      <section className="surface col-12">
        <ProtocolManage protocols={activeProtocols} compounds={compounds} vials={vials ?? []} />
      </section>

    </div>
  )
}

// ── Compact protocol row — tap Log to open prefilled QuickLog modal ─────────

function ProtocolQuickRow({
  protocol,
  compounds,
  vials,
  injections,
  onLog,
}: {
  protocol: Protocol
  compounds: Compound[]
  vials: Vial[]
  injections: InjectionLog[]
  onLog: (tab: 'injection', prefill?: import('../App').QuickLogPrefill) => void
}) {
  const compound = compounds.find((c) => c.id === protocol.compoundId)
  const activeVial = compound ? pickActiveVial(vials, compound.id!) : undefined
  const lastInj = injections.find((i) => i.compoundId === protocol.compoundId)
  const hoursSince = lastInj ? differenceInHours(new Date(), parseISO(lastInj.takenAt)) : undefined

  const lastLabel = hoursSince !== undefined
    ? hoursSince < 1 ? 'Just now'
    : hoursSince < 24 ? `${hoursSince}h ago`
    : `${Math.round(hoursSince / 24)}d ago`
    : 'Never'

  const vialPct = activeVial ? (activeVial.remainingMl / Math.max(activeVial.totalMl, 0.001)) * 100 : 100
  const vialTone = vialPct < 15 ? 'var(--bad)' : vialPct < 35 ? 'var(--warn)' : 'var(--good)'

  return (
    <div className="row" style={{ gridTemplateColumns: 'auto 1fr auto auto auto auto' }}>
      <span className="dot" style={{ background: compound?.color ?? 'var(--accent)', width: 10, height: 10 }} />
      <div>
        <strong style={{ fontSize: 13 }}>{protocol.name}</strong>
        <span className="sub">{compound?.name} · {protocol.dose} {protocol.unit} · {describeCadence(protocol.cadence)}</span>
      </div>
      <span className="chip">{protocol.phase ?? 'Active'}</span>
      <span style={{ fontSize: 11, color: hoursSince !== undefined && hoursSince < 24 ? 'var(--warn)' : 'var(--ink-mute)', whiteSpace: 'nowrap' }}>
        {lastLabel}
      </span>
      {activeVial ? (
        <span style={{ fontSize: 11, color: vialTone, whiteSpace: 'nowrap' }}>
          <Droplet size={10} style={{ verticalAlign: -1 }} /> {activeVial.remainingMl.toFixed(1)} mL
        </span>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--ink-mute)' }}>No vial</span>
      )}
      <button
        type="button"
        className="primary-button"
        style={{ height: 28, fontSize: 11, padding: '0 12px', background: compound?.color ?? undefined, whiteSpace: 'nowrap' }}
        onClick={() => onLog('injection', { compoundId: protocol.compoundId, dose: protocol.dose, unit: protocol.unit, protocolId: protocol.id })}
      >
        Log
      </button>
    </div>
  )
}

// ── Protocol management — archive + vials ──────────────────────────────────

function ProtocolManage({
  protocols,
  compounds,
  vials,
}: {
  protocols: Protocol[]
  compounds: Compound[]
  vials: Vial[]
}) {
  const compoundMap = new Map(compounds.map((c) => [c.id, c]))
  const [showAddVial, setShowAddVial] = useState<number | null>(null) // protocolId

  if (protocols.length === 0) {
    return (
      <>
        <div className="panel-header">
          <div><span className="section-label">Manage</span><h3>Vials</h3></div>
        </div>
        <EmptyState icon={Calendar} title="No protocols yet" detail="Use the setup panel to add your first compound + protocol." />
      </>
    )
  }

  return (
    <>
      <div className="panel-header">
        <div><span className="section-label">Manage</span><h3>Vials &amp; archive</h3></div>
      </div>
      <div className="stack">
        {protocols.map((p) => {
          const c = compoundMap.get(p.compoundId)
          const protVials = vials.filter((v) => v.compoundId === p.compoundId && !v.archived)
          return (
            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Protocol row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="dot" style={{ background: c?.color ?? 'var(--accent)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 13 }}>{p.name}</strong>
                  <span className="sub">{c?.name ?? '?'} · {p.dose} {p.unit} · {describeCadence(p.cadence)}</span>
                </div>
                {p.phase && <span className="chip" style={{ flexShrink: 0 }}>{p.phase}</span>}
                <button
                  type="button"
                  className="ghost-button"
                  style={{ height: 28, fontSize: 11, flexShrink: 0 }}
                  onClick={() => db.protocols.update(p.id!, { archived: true })}
                >
                  Archive
                </button>
              </div>
              {/* Vials */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 20 }}>
                {protVials.map((v) => {
                  const pct = (v.remainingMl / Math.max(v.totalMl, 0.001)) * 100
                  const tone = pct < 15 ? 'bad' : pct < 35 ? 'warn' : 'good'
                  return (
                    <div key={v.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-2)', border: '1px solid var(--line)',
                    }}>
                      <Droplet size={12} style={{ color: `var(--${tone})`, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{v.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>{v.remainingMl.toFixed(1)} / {v.totalMl} mL</span>
                      {/* progress bar */}
                      <div style={{ width: 48, height: 4, borderRadius: 2, background: 'var(--line)', flexShrink: 0, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: `var(--${tone})`, borderRadius: 2 }} />
                      </div>
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink-mute)', lineHeight: 1, flexShrink: 0 }}
                        onClick={() => db.vials.update(v.id!, { archived: true })}
                        aria-label="Remove vial"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )
                })}
                {showAddVial === p.id ? (
                  <AddVialInline compoundId={p.compoundId} onDone={() => setShowAddVial(null)} />
                ) : (
                  <button
                    type="button"
                    className="ghost-button"
                    style={{ height: 30, fontSize: 12, alignSelf: 'flex-start' }}
                    onClick={() => setShowAddVial(p.id!)}
                  >
                    <Plus size={11} /> Add vial
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function AddVialInline({ compoundId, onDone }: { compoundId: number; onDone: () => void }) {
  const [label, setLabel] = useState('')
  const [totalMl, setTotalMl] = useState('')
  const [conc, setConc] = useState('')

  async function save() {
    if (!totalMl) return
    await db.vials.add({
      compoundId,
      label: label || 'Vial',
      totalMl: Number(totalMl),
      remainingMl: Number(totalMl),
      concentrationMgPerMl: Number(conc) || undefined,
      openedAt: new Date().toISOString(),
    })
    onDone()
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
      <input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} style={{ width: 80, height: 28, fontSize: 12 }} />
      <input placeholder="mL" inputMode="decimal" value={totalMl} onChange={(e) => setTotalMl(e.target.value)} style={{ width: 60, height: 28, fontSize: 12 }} />
      <input placeholder="mg/mL" inputMode="decimal" value={conc} onChange={(e) => setConc(e.target.value)} style={{ width: 70, height: 28, fontSize: 12 }} />
      <button type="button" className="primary-button" style={{ height: 28, fontSize: 12 }} onClick={save} disabled={!totalMl}><Plus size={11} /></button>
      <button type="button" className="ghost-button" style={{ height: 28, fontSize: 12 }} onClick={onDone}><X size={11} /></button>
    </div>
  )
}

// ── Site rotation heatmap (compact) ───────────────────────────────────────

// ── Multi-compound PK curve chart ─────────────────────────────────────────

function PKCurvePanel({ compounds, injections }: { compounds: Compound[]; injections: InjectionLog[] }) {
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
          <CartesianGrid stroke="#e7e5e4" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#a8a29e', fontSize: 10 }}
            interval={Math.floor(totalDays / 8)}
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: '#a8a29e', fontSize: 10 }} unit=" mg/d" width={56} />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 10, fontSize: 12 }}
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
          <CartesianGrid stroke="#e7e5e4" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#a8a29e', fontSize: 11 }} />
          <YAxis yAxisId="weight" tickLine={false} axisLine={false} tick={{ fill: '#a8a29e', fontSize: 11 }} />
          <YAxis yAxisId="dose" orientation="right" tickLine={false} axisLine={false} tick={{ fill: '#a8a29e', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 10, fontSize: 12 }} />
          <Bar yAxisId="dose" dataKey="dose" fill="#60a5fa" opacity={0.45} radius={[4, 4, 0, 0]} />
          <Line yAxisId="weight" type="monotone" dataKey="weight" stroke="#0f766e" strokeWidth={2.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  )
}

// ── Recent doses ──────────────────────────────────────────────────────────

function RecentDoses({ injections, compounds, vials }: { injections: InjectionLog[]; compounds: Compound[]; vials: Vial[] }) {
  const compoundMap = new Map(compounds.map((c) => [c.id, c]))
  const vialMap = new Map(vials.map((v) => [v.id, v]))
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
          message="Delete this injection log? The vial volume will be restored."
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
            const v = entry.vialId ? vialMap.get(entry.vialId) : undefined
            return (
              <div className="row" key={entry.id} style={{ gridTemplateColumns: 'auto 1fr auto auto auto' }}>
                <span className="dot" style={{ background: c?.color ?? 'var(--accent)' }} />
                <div>
                  <strong>{c?.name ?? 'Unknown'}</strong>
                  <span className="sub">
                    {entry.rawDose ?? `${entry.dose ?? ''} ${entry.unit}`}
                    {entry.site ? ` · ${entry.site}` : ''}
                    {v ? ` · ${v.label}` : ''}
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
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,10,10,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 540, overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 24px 0' }}>
          <div>
            <span className="section-label">Edit</span>
            <h3 style={{ margin: '2px 0 0' }}>Injection log</h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <div style={{ padding: '20px 24px 28px' }}>
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
