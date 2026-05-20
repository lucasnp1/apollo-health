import { useMemo, useState } from 'react'
import { Calendar, Droplet, Plus, Syringe, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  type Compound,
  type InjectionLog,
  type Protocol,
  type ProtocolCadence,
  type TestosteroneEster,
  type Unit,
  type Vial,
} from '../lib/db'
import {
  buildTestosteroneCurve,
  buildWeightDoseSeries,
  esterProfiles,
  inferEster,
  weightSummary,
} from '../lib/insights'
import { describeCadence } from '../lib/schedule'
import { mlFromDose, projectedEmptyDate, recentWeeklyMl, weeklyMlForProtocol } from '../lib/vials'
import { deleteInjection, logInjection, pickActiveVial } from '../lib/injections'
import { EmptyState } from '../components/EmptyState'

const UNITS: Unit[] = ['mg', 'mcg', 'iu', 'ml', 'tablet', 'capsule']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SITES = ['Glute L', 'Glute R', 'Quad L', 'Quad R', 'Delt L', 'Delt R', 'Abdomen L', 'Abdomen R']

export function Protocols({ compounds, injections }: { compounds: Compound[]; injections: InjectionLog[] }) {
  const protocols = useLiveQuery(() => db.protocols.toArray(), [], [])
  const vials = useLiveQuery(() => db.vials.toArray(), [], [])

  return (
    <div className="content-grid">
      <section className="surface col-7">
        <ProtocolList protocols={protocols} compounds={compounds} />
      </section>
      <section className="surface col-5">
        <ProtocolBuilder compounds={compounds} />
      </section>

      <section className="surface col-7">
        <TestosteroneCurvePanel compounds={compounds} injections={injections} />
      </section>
      <section className="surface col-5">
        <SiteRotation injections={injections} />
      </section>

      <section className="surface col-7">
        <RetaChart compounds={compounds} injections={injections} />
      </section>
      <section className="surface col-5">
        <VialInventory vials={vials} protocols={protocols} injections={injections} compounds={compounds} />
      </section>

      <section className="surface col-12">
        <QuickLog compounds={compounds} vials={vials} />
      </section>

      <section className="surface col-12">
        <RecentDoses injections={injections} compounds={compounds} vials={vials} />
      </section>
    </div>
  )
}

// --- Protocol list & builder ---

function ProtocolList({ protocols, compounds }: { protocols: Protocol[]; compounds: Compound[] }) {
  const compoundMap = new Map(compounds.map((c) => [c.id, c]))
  const active = protocols.filter((p) => !p.archived)

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Active</span>
          <h3>Protocols</h3>
        </div>
        <span className="chip">{active.length} running</span>
      </div>
      {active.length > 0 ? (
        <div className="stack">
          {active.map((p) => {
            const c = compoundMap.get(p.compoundId)
            return (
              <div className="row" key={p.id}>
                <span className="dot" style={{ background: c?.color ?? 'var(--accent)' }} />
                <div>
                  <strong>{p.name}</strong>
                  <span className="sub">
                    {c?.name ?? 'Unknown'} · {p.dose} {p.unit} · {describeCadence(p.cadence)}
                  </span>
                </div>
                <span className="chip">{p.phase ?? 'Maintenance'}</span>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label="Archive protocol"
                  onClick={() => db.protocols.update(p.id!, { archived: true })}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState icon={Calendar} title="No protocols yet" detail="Define one to get an Up Next, vial run-out estimates, and a forward timeline." />
      )}
    </>
  )
}

function ProtocolBuilder({ compounds }: { compounds: Compound[] }) {
  const [name, setName] = useState('')
  const [compoundId, setCompoundId] = useState('')
  const [dose, setDose] = useState('')
  const [unit, setUnit] = useState<Unit>('mg')
  const [kind, setKind] = useState<ProtocolCadence['kind']>('everyNDays')
  const [n, setN] = useState('3.5')
  const [dow, setDow] = useState<number[]>([1, 4])
  const [time, setTime] = useState('09:00')
  const [phase, setPhase] = useState<Protocol['phase']>('Maintenance')

  const effectiveCompoundId = compoundId || String(compounds[0]?.id ?? '')

  async function create() {
    const compound = compounds.find((c) => String(c.id) === effectiveCompoundId)
    if (!compound?.id || !dose) return
    let cadence: ProtocolCadence
    if (kind === 'everyNDays') cadence = { kind, n: Number(n) || 1, timeOfDay: time }
    else if (kind === 'weekly') cadence = { kind, daysOfWeek: dow, timeOfDay: time }
    else if (kind === 'daily') cadence = { kind, timesOfDay: [time] }
    else cadence = { kind: 'asNeeded' }

    await db.protocols.add({
      name: name || `${compound.name} protocol`,
      compoundId: compound.id,
      dose: Number(dose),
      unit,
      cadence,
      startedAt: new Date().toISOString(),
      phase,
    })
    setName('')
    setDose('')
  }

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Plan</span>
          <h3>New protocol</h3>
        </div>
        <Syringe size={18} style={{ color: 'var(--ink-mute)' }} />
      </div>
      <div className="form-grid">
        <label className="wide-field">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="TestE 100mg E3.5D" />
        </label>
        <label>
          Compound
          <select value={effectiveCompoundId} onChange={(e) => setCompoundId(e.target.value)}>
            {compounds.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>
          Dose
          <input inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} />
        </label>
        <label>
          Unit
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </label>
        <label>
          Phase
          <select value={phase} onChange={(e) => setPhase(e.target.value as Protocol['phase'])}>
            {['Blast', 'Cruise', 'Maintenance', 'PCT', 'Bridge', 'Trial'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label className="wide-field">
          Cadence
          <select value={kind} onChange={(e) => setKind(e.target.value as ProtocolCadence['kind'])}>
            <option value="everyNDays">Every N days</option>
            <option value="weekly">Days of week</option>
            <option value="daily">Daily at fixed time</option>
            <option value="asNeeded">As needed</option>
          </select>
        </label>
        {kind === 'everyNDays' && (
          <label>
            N (days)
            <input inputMode="decimal" value={n} onChange={(e) => setN(e.target.value)} />
          </label>
        )}
        {kind === 'weekly' && (
          <label className="wide-field">
            Days
            <div className="chip-row" style={{ marginTop: 4 }}>
              {DOW.map((d, i) => (
                <button
                  type="button"
                  key={d}
                  className={dow.includes(i) ? 'chip active' : 'chip'}
                  onClick={() => setDow((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort()))}
                >
                  {d}
                </button>
              ))}
            </div>
          </label>
        )}
        {(kind === 'everyNDays' || kind === 'weekly' || kind === 'daily') && (
          <label>
            Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        )}
        <button type="button" className="primary-button wide-field" onClick={create}>
          <Plus size={15} /> Add protocol
        </button>
      </div>
    </>
  )
}

// --- Testosterone curve panel ---

function TestosteroneCurvePanel({
  compounds,
  injections,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
}) {
  const testosterone = compounds.find((c) => c.name.toLowerCase().includes('testosterone'))
  const [esterChoice, setEsterChoice] = useState<TestosteroneEster | ''>('')
  const ester = esterChoice || inferEster(testosterone)
  const curve = buildTestosteroneCurve(compounds, injections, ester)
  const profile = esterProfiles[ester]
  const lastDoseDate = curve.lastInjection ? format(parseISO(curve.lastInjection.takenAt), 'MMM d') : undefined

  async function updateEster(next: TestosteroneEster) {
    setEsterChoice(next)
    if (testosterone?.id) {
      await db.compounds.update(testosterone.id, {
        ester: next,
        halfLifeDays: esterProfiles[next].halfLifeDays,
        peakHours: esterProfiles[next].peakHours,
      })
    }
  }

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Pharmacokinetics</span>
          <h3>Testosterone — estimated active load</h3>
        </div>
        <select className="ghost-button" style={{ height: 30 }} value={ester} onChange={(e) => updateEster(e.target.value as TestosteroneEster)}>
          {(Object.keys(esterProfiles) as TestosteroneEster[]).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">Active now</span>
          <span className="stat-value">{curve.activeNow ? `${curve.activeNow} mg` : '—'}</span>
          <span className="stat-detail">{ester} model</span>
        </div>
        <div className="stat">
          <span className="stat-label">Half-life</span>
          <span className="stat-value">{profile.halfLifeDays}d</span>
          <span className="stat-detail">Peak {profile.peakHours}h</span>
        </div>
        <div className="stat">
          <span className="stat-label">Last dose</span>
          <span className="stat-value">{lastDoseDate ?? '—'}</span>
          <span className="stat-detail">{curve.lastInjection?.rawDose ?? ''}</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={curve.points} margin={{ top: 10, right: 10, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="testFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5eead4" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#5eead4" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1f242b" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#6b7480', fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: '#6b7480', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: '#13171c', border: '1px solid #2a313a', borderRadius: 8, color: '#e6ebf1' }} />
          {lastDoseDate && <ReferenceLine x={lastDoseDate} stroke="#6b7480" strokeDasharray="3 3" />}
          <Area type="monotone" dataKey="active" stroke="#5eead4" strokeWidth={2} fill="url(#testFill)" />
        </AreaChart>
      </ResponsiveContainer>
      <p className="panel-note">{profile.note}</p>
    </>
  )
}

// --- Retatrutide weight chart ---

function RetaChart({ compounds, injections }: { compounds: Compound[]; injections: InjectionLog[] }) {
  const series = buildWeightDoseSeries(compounds, injections)
  const stats = weightSummary(series)
  const chartData = series.filter((p) => p.weight !== undefined || p.dose !== undefined).slice(-24)

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Retatrutide</span>
          <h3>Dose vs weight</h3>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className="chip">{stats.latest ? `${stats.latest.toFixed(1)} kg` : 'No weight'}</span>
          <span className={`chip ${stats.delta !== undefined && stats.delta < 0 ? 'good' : ''}`}>
            {stats.delta !== undefined ? `${stats.delta.toFixed(1)} kg` : '—'}
          </span>
        </div>
      </div>
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#1f242b" vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#6b7480', fontSize: 11 }} />
            <YAxis yAxisId="weight" tickLine={false} axisLine={false} tick={{ fill: '#6b7480', fontSize: 11 }} />
            <YAxis yAxisId="dose" orientation="right" tickLine={false} axisLine={false} tick={{ fill: '#6b7480', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#13171c', border: '1px solid #2a313a', borderRadius: 8, color: '#e6ebf1' }} />
            <Bar yAxisId="dose" dataKey="dose" name="Dose" fill="#60a5fa" opacity={0.45} radius={[4, 4, 0, 0]} />
            <Line yAxisId="weight" type="monotone" dataKey="weight" name="Weight" stroke="#5eead4" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <EmptyState icon={Droplet} title="No retatrutide logs" detail="Log a dose with weight to see response timing." />
      )}
    </>
  )
}

// --- Vial inventory ---

function VialInventory({
  vials,
  protocols,
  injections,
  compounds,
}: {
  vials: Vial[]
  protocols: Protocol[]
  injections: InjectionLog[]
  compounds: Compound[]
}) {
  const compoundMap = new Map(compounds.map((c) => [c.id, c]))
  const [form, setForm] = useState({ compoundId: '', label: '', totalMl: '', concentration: '' })

  async function add() {
    if (!form.compoundId || !form.totalMl) return
    await db.vials.add({
      compoundId: Number(form.compoundId),
      label: form.label || 'New vial',
      totalMl: Number(form.totalMl),
      remainingMl: Number(form.totalMl),
      concentrationMgPerMl: Number(form.concentration) || undefined,
      openedAt: new Date().toISOString(),
    })
    setForm({ compoundId: '', label: '', totalMl: '', concentration: '' })
  }

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Inventory</span>
          <h3>Vials</h3>
        </div>
      </div>
      {vials.length > 0 ? (
        <div className="stack">
          {vials
            .filter((v) => !v.archived)
            .map((v) => {
              const compound = compoundMap.get(v.compoundId)
              const conc = v.concentrationMgPerMl ?? 0
              const proto = protocols.find((p) => p.compoundId === v.compoundId && !p.archived)
              const weekly =
                proto && conc > 0
                  ? weeklyMlForProtocol(proto, conc)
                  : conc > 0
                  ? recentWeeklyMl(injections, v.compoundId, conc)
                  : 0
              const empty = projectedEmptyDate(v, weekly)
              const pct = (v.remainingMl / Math.max(v.totalMl, 0.0001)) * 100
              const tone = pct < 15 ? 'empty' : pct < 35 ? 'low' : ''
              const weeksLeft = weekly > 0 ? v.remainingMl / weekly : undefined
              const stockTone = weeksLeft !== undefined && weeksLeft < 1 ? 'bad' : weeksLeft !== undefined && weeksLeft < 2 ? 'warn' : ''
              return (
                <div className="row" key={v.id} style={{ gridTemplateColumns: '1fr auto auto', alignItems: 'start' }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <strong>
                      {compound?.name ?? 'Compound'} · {v.label}
                    </strong>
                    <span className="sub">
                      {v.remainingMl.toFixed(2)} / {v.totalMl} mL{conc ? ` · ${conc} mg/mL` : ''}
                      {empty ? ` · empty ${format(empty, 'MMM d')}` : ''}
                    </span>
                    <div className={`vial-bar ${tone}`}><span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
                  </div>
                  {weeksLeft !== undefined && (
                    <span className={`chip ${stockTone}`}>{weeksLeft < 1 ? '<1w left' : `${weeksLeft.toFixed(1)}w left`}</span>
                  )}
                  <button type="button" className="icon-button danger" onClick={() => db.vials.update(v.id!, { archived: true })} aria-label="Archive vial">
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
        </div>
      ) : (
        <EmptyState icon={Droplet} title="No vials tracked" detail="Add a vial to track remaining volume, cost, and projected run-out." />
      )}
      <div className="form-grid">
        <label>
          Compound
          <select value={form.compoundId} onChange={(e) => setForm({ ...form, compoundId: e.target.value })}>
            <option value="">Select</option>
            {compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          Label
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Vial #1" />
        </label>
        <label>
          Total mL
          <input inputMode="decimal" value={form.totalMl} onChange={(e) => setForm({ ...form, totalMl: e.target.value })} />
        </label>
        <label>
          mg/mL
          <input inputMode="decimal" value={form.concentration} onChange={(e) => setForm({ ...form, concentration: e.target.value })} />
        </label>
        <button type="button" className="primary-button wide-field" onClick={add}><Plus size={15} /> Add vial</button>
      </div>
    </>
  )
}

// --- Site rotation heatmap ---

function SiteRotation({ injections }: { injections: InjectionLog[] }) {
  const [now] = useState(() => Date.now())
  const lastUseBySite = useMemo(() => {
    const map = new Map<string, number>()
    for (const inj of injections) {
      if (!inj.site) continue
      const t = new Date(inj.takenAt).getTime()
      const cur = map.get(inj.site)
      if (cur === undefined || t > cur) map.set(inj.site, t)
    }
    return map
  }, [injections])

  function tone(site: string) {
    const t = lastUseBySite.get(site)
    if (!t) return ''
    const days = (now - t) / (1000 * 60 * 60 * 24)
    if (days < 1.5) return 'recent-1'
    if (days < 3.5) return 'recent-3'
    if (days < 7) return 'recent-7'
    return ''
  }

  function daysAgo(site: string): string | null {
    const t = lastUseBySite.get(site)
    if (!t) return null
    const days = Math.round((now - t) / (1000 * 60 * 60 * 24))
    return days === 0 ? 'today' : `${days}d`
  }

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Rotation</span>
          <h3>Injection sites</h3>
        </div>
      </div>
      <p className="panel-note">Heat = days since last use. Avoid red cells.</p>
      <div className="body-diagram">
        {SITES.map((site) => (
          <div key={site} className={`body-cell ${tone(site)}`}>
            {site}
            <small>{daysAgo(site) ?? 'never'}</small>
          </div>
        ))}
      </div>
    </>
  )
}

// --- Quick log ---

function QuickLog({ compounds, vials }: { compounds: Compound[]; vials: Vial[] }) {
  const [compoundId, setCompoundId] = useState('')
  const [dose, setDose] = useState('')
  const [unit, setUnit] = useState<Unit>('mg')
  const [site, setSite] = useState('Glute L')
  const [takenAt, setTakenAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [vialId, setVialId] = useState<string>('')

  const effectiveId = compoundId || String(compounds[0]?.id ?? '')
  const effectiveCompoundIdNum = Number(effectiveId)
  const matchingVials = useMemo(
    () => vials.filter((v) => v.compoundId === effectiveCompoundIdNum && !v.archived),
    [vials, effectiveCompoundIdNum],
  )
  const activeVial = useMemo(() => pickActiveVial(vials, effectiveCompoundIdNum), [vials, effectiveCompoundIdNum])
  const effectiveVial = matchingVials.find((v) => String(v.id) === vialId) ?? activeVial

  // Live preview of mL that would be drawn
  const previewMl = useMemo(() => {
    if (!effectiveVial || !dose) return undefined
    return mlFromDose(Number(dose), unit, effectiveVial.concentrationMgPerMl)
  }, [effectiveVial, dose, unit])
  const previewExceeds = previewMl !== undefined && effectiveVial && previewMl > effectiveVial.remainingMl

  async function save() {
    const compound = compounds.find((c) => String(c.id) === effectiveId)
    if (!compound?.id || !dose) return
    await logInjection({
      compoundId: compound.id,
      takenAt: new Date(takenAt).toISOString(),
      dose: Number(dose),
      unit,
      route: 'SubQ',
      site,
      rawDose: `${dose} ${unit}`,
      vialId: effectiveVial?.id,
    })
    setDose('')
  }

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Quick add</span>
          <h3>Log injection</h3>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Compound
          <select value={effectiveId} onChange={(e) => {
            setCompoundId(e.target.value)
            const c = compounds.find((x) => String(x.id) === e.target.value)
            if (c) { setDose(String(c.defaultDose)); setUnit(c.unit) }
          }}>
            {compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          Dose
          <input inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} />
        </label>
        <label>
          Unit
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </label>
        <label>
          Site
          <select value={site} onChange={(e) => setSite(e.target.value)}>
            {SITES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Taken at
          <input type="datetime-local" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} />
        </label>
        <label>
          Vial
          <select value={vialId} onChange={(e) => setVialId(e.target.value)}>
            <option value="">{activeVial ? `Auto · ${activeVial.label}` : 'None'}</option>
            {matchingVials.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} · {v.remainingMl.toFixed(2)}/{v.totalMl} mL{v.concentrationMgPerMl ? ` · ${v.concentrationMgPerMl} mg/mL` : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="primary-button" onClick={save}><Plus size={15} /> Save</button>
        {previewMl !== undefined && (
          <p className="panel-note wide-field">
            Will draw <strong style={{ color: previewExceeds ? 'var(--bad)' : 'var(--ink)' }}>{previewMl.toFixed(3)} mL</strong>
            {' '}from <strong>{effectiveVial?.label}</strong>
            {previewExceeds ? ' — vial does not have enough remaining; save will leave it at 0.' : '.'}
          </p>
        )}
      </div>
    </>
  )
}

function RecentDoses({ injections, compounds, vials }: { injections: InjectionLog[]; compounds: Compound[]; vials: Vial[] }) {
  const compoundMap = new Map(compounds.map((c) => [c.id, c]))
  const vialMap = new Map(vials.map((v) => [v.id, v]))
  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">History</span>
          <h3>Recent doses</h3>
        </div>
      </div>
      <div className="stack">
        {injections.slice(0, 20).map((entry) => {
          const c = compoundMap.get(entry.compoundId)
          const v = entry.vialId ? vialMap.get(entry.vialId) : undefined
          return (
            <div className="row" key={entry.id}>
              <span className="dot" style={{ background: c?.color ?? 'var(--accent)' }} />
              <div>
                <strong>{c?.name ?? 'Unknown'}</strong>
                <span className="sub">
                  {entry.rawDose ?? `${entry.dose ?? ''} ${entry.unit}`} · {entry.route} · {entry.site || '—'}
                  {v ? ` · ${v.label}` : ''}
                  {entry.vialAmount ? ` · ${entry.vialAmount}` : ''}
                </span>
              </div>
              <time>{format(parseISO(entry.takenAt), 'MMM d HH:mm')}</time>
              <button type="button" className="icon-button danger" onClick={() => deleteInjection(entry.id!)} aria-label="Delete">
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
