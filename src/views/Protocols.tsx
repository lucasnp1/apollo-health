import { useMemo, useState } from 'react'
import {
  Calendar, ChevronRight, Droplet, Pencil, Plus, Syringe, Trash2, X,
} from 'lucide-react'
import { differenceInHours, format, parseISO } from 'date-fns'
import {
  Area, AreaChart, Bar, CartesianGrid, ComposedChart,
  Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
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
import { deleteInjection, pickActiveVial } from '../lib/injections'
import { EmptyState } from '../components/EmptyState'

const UNITS: Unit[] = ['mg', 'mcg', 'iu', 'ml', 'tablet', 'capsule']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const COMPOUND_COLORS = ['#0f766e', '#6366f1', '#f59e0b', '#ec4899', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6']
const ESTER_OPTIONS: TestosteroneEster[] = ['Enanthate', 'Cypionate', 'Propionate', 'Undecanoate', 'Custom']

export function Protocols({
  compounds,
  injections,
  onOpenQuickLog,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  onOpenQuickLog: (tab: 'injection', prefill?: import('../App').QuickLogPrefill) => void
}) {
  const protocols = useLiveQuery(() => db.protocols.toArray(), [], [])
  const vials = useLiveQuery(() => db.vials.toArray(), [], [])
  const [showSetup, setShowSetup] = useState(false)

  const activeProtocols = (protocols ?? []).filter((p) => !p.archived)

  // Recent sites from history for combobox suggestions
  const recentSites = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const inj of injections) {
      if (inj.site && !seen.has(inj.site)) {
        seen.add(inj.site)
        out.push(inj.site)
        if (out.length >= 8) break
      }
    }
    return out
  }, [injections])

  return (
    <div className="content-grid">

      {/* ── 1. ACTIVE PROTOCOLS + QUICK LOG ─────────────────────────────── */}
      <section className="surface col-12">
        <div className="panel-header">
          <div>
            <span className="section-label">Active</span>
            <h3>My protocols</h3>
          </div>
          <button type="button" className="ghost-button" onClick={() => setShowSetup((v) => !v)}>
            <Plus size={12} /> {showSetup ? 'Hide setup' : 'Add protocol'}
          </button>
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
            <span>Click "Add protocol" to set up your first compound and schedule.</span>
          </div>
        )}
      </section>

      {/* ── 2. SETUP / ADD — shown only when toggled ─────────────────────── */}
      {showSetup && (
        <section className="surface col-7">
          <SetupPanel compounds={compounds} />
        </section>
      )}
      {showSetup && (
        <section className="surface col-5">
          <ProtocolManage protocols={activeProtocols} compounds={compounds} vials={vials ?? []} />
        </section>
      )}

      {/* ── 3. CHARTS ─────────────────────────────────────────────────────── */}
      {injections.length > 0 && (
        <>
          <section className="surface col-7">
            <TestosteroneCurvePanel compounds={compounds} injections={injections} />
          </section>
          <section className="surface col-5">
            <SiteRotation injections={injections} recentSites={recentSites} />
          </section>
          <section className="surface col-7">
            <RetaChart compounds={compounds} injections={injections} />
          </section>
        </>
      )}

      {/* ── 4. HISTORY ───────────────────────────────────────────────────── */}
      <section className={injections.length > 0 ? 'surface col-5' : 'surface col-12'}>
        <RecentDoses injections={injections} compounds={compounds} vials={vials ?? []} />
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

// ── Setup panel — compound + protocol + vial in one form ──────────────────

type SetupStep = 'compound' | 'protocol' | 'vial'

function SetupPanel({ compounds }: { compounds: Compound[] }) {
  const [step, setStep] = useState<SetupStep>('compound')
  const [showAddCompound, setShowAddCompound] = useState(false)

  // Compound fields
  const [cName, setCName] = useState('')
  const [cCategory, setCCategory] = useState<Compound['category']>('TRT')
  const [cUnit, setCUnit] = useState<Unit>('mg')
  const [cColor, setCColor] = useState(COMPOUND_COLORS[0])
  const [cEster, setCEster] = useState<TestosteroneEster>('Enanthate')
  const [cDefaultDose, setCDefaultDose] = useState('')

  // Protocol fields
  const [pCompoundId, setPCompoundId] = useState<string>('')
  const [pName, setPName] = useState('')
  const [pDose, setPDose] = useState('')
  const [pUnit, setPUnit] = useState<Unit>('mg')
  const [pKind, setPKind] = useState<ProtocolCadence['kind']>('everyNDays')
  const [pN, setPN] = useState('3.5')
  const [pDow, setPDow] = useState<number[]>([1, 4])
  const [pTime, setPTime] = useState('09:00')
  const [pPhase, setPPhase] = useState<Protocol['phase']>('Maintenance')
  const [savedCompoundId, setSavedCompoundId] = useState<number | null>(null)

  // Vial fields
  const [vLabel, setVLabel] = useState('Vial #1')
  const [vTotalMl, setVTotalMl] = useState('')
  const [vConc, setVConc] = useState('')
  const [savedProtocolCompoundId, setSavedProtocolCompoundId] = useState<number | null>(null)

  const isTRT = cCategory === 'TRT' || (
    compounds.find((c) => c.id === Number(pCompoundId))?.category === 'TRT'
  )

  async function saveCompound() {
    if (!cName) return
    const id = await db.compounds.add({
      name: cName,
      category: cCategory,
      defaultDose: Number(cDefaultDose) || 100,
      unit: cUnit,
      color: cColor,
      schedule: '',
      ester: isTRT ? cEster : undefined,
      halfLifeDays: isTRT ? esterProfiles[cEster]?.halfLifeDays : undefined,
      peakHours: isTRT ? esterProfiles[cEster]?.peakHours : undefined,
    })
    setSavedCompoundId(id)
    setPCompoundId(String(id))
    setPDose(cDefaultDose)
    setPUnit(cUnit)
    setPName(`${cName} protocol`)
    setStep('protocol')
    setShowAddCompound(false)
    // reset form
    setCName(''); setCDefaultDose('')
  }

  async function saveProtocol() {
    const cid = Number(pCompoundId) || savedCompoundId
    if (!cid || !pDose) return
    let cadence: ProtocolCadence
    if (pKind === 'everyNDays') cadence = { kind: pKind, n: Number(pN) || 1, timeOfDay: pTime }
    else if (pKind === 'weekly') cadence = { kind: pKind, daysOfWeek: pDow, timeOfDay: pTime }
    else if (pKind === 'daily') cadence = { kind: pKind, timesOfDay: [pTime] }
    else cadence = { kind: 'asNeeded' }

    await db.protocols.add({
      name: pName || `${compounds.find((c) => c.id === cid)?.name ?? ''} protocol`,
      compoundId: cid,
      dose: Number(pDose),
      unit: pUnit,
      cadence,
      startedAt: new Date().toISOString(),
      phase: pPhase,
    })
    setSavedProtocolCompoundId(cid)
    setStep('vial')
    setPName(''); setPDose('')
  }

  async function saveVial() {
    const cid = Number(pCompoundId) || savedCompoundId || savedProtocolCompoundId
    if (!cid || !vTotalMl) return
    await db.vials.add({
      compoundId: cid,
      label: vLabel || 'Vial #1',
      totalMl: Number(vTotalMl),
      remainingMl: Number(vTotalMl),
      concentrationMgPerMl: Number(vConc) || undefined,
      openedAt: new Date().toISOString(),
    })
    setVLabel('Vial #1'); setVTotalMl(''); setVConc('')
    setStep('compound')
  }

  const effectivePCompoundId = pCompoundId || (savedCompoundId ? String(savedCompoundId) : '')

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Setup</span>
          <h3>Add compound, protocol &amp; vial</h3>
        </div>
      </div>

      {/* Step indicator */}
      <div className="pill-tabs" style={{ alignSelf: 'flex-start', marginBottom: 16 }}>
        {(['compound', 'protocol', 'vial'] as SetupStep[]).map((s, i) => (
          <button
            key={s}
            type="button"
            role="tab"
            className={step === s ? 'active' : undefined}
            onClick={() => setStep(s)}
            style={{ gap: 4 }}
          >
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 16, height: 16, borderRadius: '50%',
              background: step === s ? 'var(--accent)' : 'var(--line)',
              color: step === s ? '#fff' : 'var(--ink-mute)',
              fontSize: 10, fontWeight: 700, flexShrink: 0,
            }}>{i + 1}</span>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Step 1: Compound */}
      {step === 'compound' && (
        <div className="form-grid">
          {!showAddCompound && compounds.length > 0 ? (
            <>
              <p className="panel-note wide-field">
                You have {compounds.length} compound{compounds.length !== 1 ? 's' : ''} set up.
                Add a new one, or skip to <button type="button" className="link-button" style={{ display: 'inline' }} onClick={() => setStep('protocol')}>Protocol</button>.
              </p>
              <button type="button" className="primary-button wide-field" onClick={() => setShowAddCompound(true)}>
                <Plus size={14} /> Add new compound
              </button>
            </>
          ) : (
            <>
              <label className="wide-field">
                Name
                <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Testosterone Enanthate" autoFocus />
              </label>
              <label>
                Category
                <select value={cCategory} onChange={(e) => setCCategory(e.target.value as Compound['category'])}>
                  {['TRT', 'Peptide', 'Ancillary', 'Supplement', 'Other'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label>
                Default dose
                <input inputMode="decimal" value={cDefaultDose} onChange={(e) => setCDefaultDose(e.target.value)} placeholder="100" />
              </label>
              <label>
                Unit
                <select value={cUnit} onChange={(e) => setCUnit(e.target.value as Unit)}>
                  {UNITS.map((u) => <option key={u}>{u}</option>)}
                </select>
              </label>
              {cCategory === 'TRT' && (
                <label className="wide-field">
                  Ester
                  <select value={cEster} onChange={(e) => setCEster(e.target.value as TestosteroneEster)}>
                    {ESTER_OPTIONS.map((e) => <option key={e}>{e}</option>)}
                  </select>
                </label>
              )}
              <label className="wide-field">
                Color
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {COMPOUND_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setCColor(col)}
                      style={{
                        width: 24, height: 24, borderRadius: '50%', background: col, border: 'none',
                        outline: cColor === col ? `2px solid ${col}` : 'none',
                        outlineOffset: 2, cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
              </label>
              <div style={{ display: 'flex', gap: 8 }} className="wide-field">
                <button type="button" className="primary-button" onClick={saveCompound} disabled={!cName} style={{ flex: 1, justifyContent: 'center' }}>
                  Save &amp; next <ChevronRight size={14} />
                </button>
                {compounds.length > 0 && (
                  <button type="button" className="ghost-button" onClick={() => { setShowAddCompound(false); setStep('protocol') }}>
                    <X size={13} /> Cancel
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 2: Protocol */}
      {step === 'protocol' && (
        <div className="form-grid">
          <label>
            Compound
            <select value={effectivePCompoundId} onChange={(e) => {
              setPCompoundId(e.target.value)
              const c = compounds.find((x) => String(x.id) === e.target.value)
              if (c) { setPDose(String(c.defaultDose)); setPUnit(c.unit) }
            }}>
              {compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            Protocol name
            <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="TestE cruise" />
          </label>
          <label>
            Dose
            <input inputMode="decimal" value={pDose} onChange={(e) => setPDose(e.target.value)} />
          </label>
          <label>
            Unit
            <select value={pUnit} onChange={(e) => setPUnit(e.target.value as Unit)}>
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </label>
          <label>
            Phase
            <select value={pPhase} onChange={(e) => setPPhase(e.target.value as Protocol['phase'])}>
              {['Blast', 'Cruise', 'Maintenance', 'PCT', 'Bridge', 'Trial'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="wide-field">
            Cadence
            <select value={pKind} onChange={(e) => setPKind(e.target.value as ProtocolCadence['kind'])}>
              <option value="everyNDays">Every N days</option>
              <option value="weekly">Days of week</option>
              <option value="daily">Daily at fixed time</option>
              <option value="asNeeded">As needed</option>
            </select>
          </label>
          {pKind === 'everyNDays' && (
            <label>
              Every N days
              <input inputMode="decimal" value={pN} onChange={(e) => setPN(e.target.value)} />
            </label>
          )}
          {pKind === 'weekly' && (
            <label className="wide-field">
              Days of week
              <div className="chip-row" style={{ marginTop: 4 }}>
                {DOW.map((d, i) => (
                  <button type="button" key={d} className={pDow.includes(i) ? 'chip active' : 'chip'}
                    onClick={() => setPDow((cur) => cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort())}
                  >{d}</button>
                ))}
              </div>
            </label>
          )}
          {pKind !== 'asNeeded' && (
            <label>
              Time
              <input type="time" value={pTime} onChange={(e) => setPTime(e.target.value)} />
            </label>
          )}
          <button type="button" className="primary-button wide-field" onClick={saveProtocol} disabled={!pDose || !effectivePCompoundId} style={{ justifyContent: 'center' }}>
            Save &amp; add vial <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Step 3: Vial */}
      {step === 'vial' && (
        <div className="form-grid">
          <p className="panel-note wide-field">Protocol saved. Add a vial to track volume and get run-out estimates. You can add more vials later.</p>
          <label>
            Label
            <input value={vLabel} onChange={(e) => setVLabel(e.target.value)} placeholder="Vial #1" />
          </label>
          <label>
            Total mL
            <input inputMode="decimal" value={vTotalMl} onChange={(e) => setVTotalMl(e.target.value)} placeholder="10" />
          </label>
          <label>
            Concentration (mg/mL)
            <input inputMode="decimal" value={vConc} onChange={(e) => setVConc(e.target.value)} placeholder="200" />
          </label>
          <div style={{ display: 'flex', gap: 8 }} className="wide-field">
            <button type="button" className="primary-button" onClick={saveVial} disabled={!vTotalMl} style={{ flex: 1, justifyContent: 'center' }}>
              <Plus size={14} /> Save vial
            </button>
            <button type="button" className="ghost-button" onClick={() => setStep('compound')}>
              Skip
            </button>
          </div>
        </div>
      )}
    </>
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

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Manage</span>
          <h3>Archive &amp; vials</h3>
        </div>
      </div>
      {protocols.length > 0 ? (
        <div className="stack">
          {protocols.map((p) => {
            const c = compoundMap.get(p.compoundId)
            const protVials = vials.filter((v) => v.compoundId === p.compoundId && !v.archived)
            return (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
                <div className="row" style={{ gridTemplateColumns: 'auto 1fr auto auto', borderBottom: 0, paddingBottom: 0 }}>
                  <span className="dot" style={{ background: c?.color ?? 'var(--accent)' }} />
                  <div>
                    <strong>{p.name}</strong>
                    <span className="sub">{c?.name ?? '?'} · {p.dose} {p.unit} · {describeCadence(p.cadence)}</span>
                  </div>
                  <span className="chip">{p.phase ?? 'Maintenance'}</span>
                  <button type="button" className="icon-button danger" onClick={() => db.protocols.update(p.id!, { archived: true })} aria-label="Archive">
                    <Trash2 size={14} />
                  </button>
                </div>
                {/* Vials for this protocol */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 24 }}>
                  {protVials.map((v) => {
                    const pct = (v.remainingMl / Math.max(v.totalMl, 0.001)) * 100
                    const tone = pct < 15 ? 'bad' : pct < 35 ? 'warn' : 'good'
                    return (
                      <div key={v.id} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-2)', border: '1px solid var(--line)', fontSize: 12,
                      }}>
                        <Droplet size={11} style={{ color: `var(--${tone})` }} />
                        <span>{v.label}</span>
                        <span style={{ color: 'var(--ink-dim)' }}>{v.remainingMl.toFixed(1)}/{v.totalMl} mL</span>
                        <button type="button" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink-mute)', lineHeight: 1 }}
                          onClick={() => db.vials.update(v.id!, { archived: true })}><X size={11} /></button>
                      </div>
                    )
                  })}
                  {showAddVial === p.id ? (
                    <AddVialInline compoundId={p.compoundId} onDone={() => setShowAddVial(null)} />
                  ) : (
                    <button type="button" className="ghost-button" style={{ height: 28, fontSize: 11 }} onClick={() => setShowAddVial(p.id!)}>
                      <Plus size={11} /> Add vial
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState icon={Calendar} title="No protocols yet" detail="Use the setup panel to add your first compound + protocol." />
      )}
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

function SiteRotation({ injections, recentSites }: { injections: InjectionLog[]; recentSites: string[] }) {
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

  // Only show sites that have been used
  const usedSites = [...lastUseBySite.keys()]
  const displaySites = usedSites.length > 0 ? usedSites : recentSites.slice(0, 8)

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Rotation</span>
          <h3>Site history</h3>
        </div>
      </div>
      {displaySites.length > 0 ? (
        <div className="body-diagram">
          {displaySites.map((site) => (
            <div key={site} className={`body-cell ${tone(site)}`}>
              {site}
              <small>{daysAgo(site) ?? 'never'}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="panel-note">Log injections to track site rotation.</p>
      )}
      <p className="panel-note" style={{ marginTop: 8 }}>Red = used recently. Rotate to avoid scar tissue.</p>
    </>
  )
}

// ── Testosterone curve ─────────────────────────────────────────────────────

function TestosteroneCurvePanel({ compounds, injections }: { compounds: Compound[]; injections: InjectionLog[] }) {
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
        ester: next, halfLifeDays: esterProfiles[next].halfLifeDays, peakHours: esterProfiles[next].peakHours,
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
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={curve.points} margin={{ top: 8, right: 10, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="testFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f766e" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e7e5e4" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#a8a29e', fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: '#a8a29e', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 10, fontSize: 12 }} />
          {lastDoseDate && <ReferenceLine x={lastDoseDate} stroke="#a8a29e" strokeDasharray="3 3" />}
          <Area type="monotone" dataKey="active" stroke="#0f766e" strokeWidth={2} fill="url(#testFill)" />
        </AreaChart>
      </ResponsiveContainer>
      <p className="panel-note">{profile.note}</p>
    </>
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
  const [weightKg, setWeightKg] = useState(entry.weightKg !== undefined ? String(entry.weightKg) : '')
  const [takenAt, setTakenAt] = useState(entry.takenAt.slice(0, 16))
  const [busy, setBusy] = useState(false)
  const compound = compounds.find((c) => c.id === compoundId)

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
        weightKg: weightKg ? Number(weightKg) : undefined,
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
        style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 460, overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0' }}>
          <div>
            <span className="section-label">Edit</span>
            <h3 style={{ margin: '2px 0 0' }}>Injection log</h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <div style={{ padding: '16px 20px 20px' }}>
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
              <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="e.g. Ventrogluteal L" />
            </label>
            <label>
              Weight (kg)
              <input inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="optional" />
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
