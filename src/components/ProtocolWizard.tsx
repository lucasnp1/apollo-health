import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Plus, Search, X } from 'lucide-react'
import { db, type Compound, type Protocol, type ProtocolCadence, type TestosteroneEster, type Unit } from '../lib/db'
import { esterProfiles } from '../lib/insights'
import { PK_COMPOUND_NAMES, formsForCompound } from '../lib/pk'

const UNITS: Unit[] = ['mg', 'mcg', 'iu', 'ml', 'tablet', 'capsule']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const COMPOUND_COLORS = ['#0f766e', '#6366f1', '#f59e0b', '#ec4899', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6']
const ESTER_OPTIONS: TestosteroneEster[] = ['Enanthate', 'Cypionate', 'Propionate', 'Undecanoate', 'Custom']

// Mapping of PK compound name → default unit
const COMPOUND_DEFAULT_UNIT: Record<string, Unit> = {
  'Anadrol': 'mg', 'Anavar': 'mg', 'Arimidex': 'mg', 'Aromasin': 'mg',
  'Boldenone': 'mg', 'Dianabol': 'mg', 'Halotestin': 'mg',
  'Masteron': 'mg', 'Nandrolone': 'mg', 'Primobolan': 'mg',
  'Superdrol': 'mg', 'Testosterone': 'mg', 'Trenbolone': 'mg',
  'Trestolone (MENT)': 'mg', 'Turinabol': 'mg', 'Winstrol': 'mg',
}

type Step = 'compound' | 'protocol' | 'vial'
const STEPS: Step[] = ['compound', 'protocol', 'vial']
const STEP_LABELS: Record<Step, string> = { compound: 'Compound', protocol: 'Protocol', vial: 'Vial' }

export function ProtocolWizard({
  open,
  onClose,
  compounds,
  editProtocol,
}: {
  open: boolean
  onClose: () => void
  compounds: Compound[]
  editProtocol?: Protocol & { id: number }
}) {
  const isEditMode = editProtocol !== undefined
  const [step, setStep] = useState<Step>('compound')
  const [showAddCompound, setShowAddCompound] = useState(false)

  // Preset search
  const [presetQuery, setPresetQuery] = useState('')
  const [presetForm, setPresetForm] = useState('')
  const filteredPresets = useMemo(() => {
    if (!presetQuery.trim()) return []
    const q = presetQuery.toLowerCase()
    return PK_COMPOUND_NAMES.filter((n) => n.toLowerCase().includes(q)).slice(0, 8)
  }, [presetQuery])

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

  // Reset when opening
  useEffect(() => {
    if (open) {
      if (editProtocol) {
        // Edit mode: pre-fill from existing protocol
        setStep('protocol')
        setShowAddCompound(false)
        setPCompoundId(String(editProtocol.compoundId))
        setPName(editProtocol.name)
        setPDose(String(editProtocol.dose))
        setPUnit(editProtocol.unit)
        setPPhase(editProtocol.phase ?? 'Maintenance')
        const cad = editProtocol.cadence
        setPKind(cad.kind)
        if (cad.kind === 'everyNDays') setPN(String(cad.n))
        if (cad.kind === 'weekly') setPDow(cad.daysOfWeek)
        if (cad.kind === 'everyNDays' || cad.kind === 'weekly') setPTime(cad.timeOfDay ?? '09:00')
        if (cad.kind === 'daily') setPTime(cad.timesOfDay?.[0] ?? '09:00')
        setSavedCompoundId(null)
        setSavedProtocolCompoundId(null)
      } else {
        setStep('compound')
        setShowAddCompound(compounds.length === 0)
        setSavedCompoundId(null)
        setSavedProtocolCompoundId(null)
        setCName(''); setCDefaultDose('')
        setPresetQuery(''); setPresetForm('')
        setPCompoundId(''); setPName(''); setPDose('')
        setVLabel('Vial #1'); setVTotalMl(''); setVConc('')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editProtocol?.id, compounds.length])

  // Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const isTRT = cCategory === 'TRT' || (
    compounds.find((c) => c.id === Number(pCompoundId))?.category === 'TRT'
  )

  const effectivePCompoundId = pCompoundId || (savedCompoundId ? String(savedCompoundId) : '')
  const stepIndex = STEPS.indexOf(step)

  async function saveCompound() {
    if (!cName) return
    // If a preset form was chosen and it looks like an ester, match it
    const detectedEster = ESTER_OPTIONS.find((e) => presetForm.toLowerCase().includes(e.toLowerCase()))
    const effectiveEster = detectedEster ?? cEster
    const id = await db.compounds.add({
      name: cName,
      category: cCategory,
      defaultDose: Number(cDefaultDose) || 100,
      unit: cUnit,
      color: cColor,
      schedule: '',
      ester: isTRT ? effectiveEster : undefined,
      halfLifeDays: isTRT ? esterProfiles[effectiveEster]?.halfLifeDays : undefined,
      peakHours: isTRT ? esterProfiles[effectiveEster]?.peakHours : undefined,
    })
    setSavedCompoundId(id)
    setPCompoundId(String(id))
    setPDose(cDefaultDose)
    setPUnit(cUnit)
    setPName(`${cName} protocol`)
    setStep('protocol')
    setShowAddCompound(false)
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
    const data = {
      name: pName || `${compounds.find((c) => c.id === cid)?.name ?? ''} protocol`,
      compoundId: cid,
      dose: Number(pDose),
      unit: pUnit,
      cadence,
      phase: pPhase,
    }
    if (isEditMode && editProtocol.id) {
      await db.protocols.update(editProtocol.id, data)
      onClose()
    } else {
      await db.protocols.add({ ...data, startedAt: new Date().toISOString() })
      setSavedProtocolCompoundId(cid)
      setStep('vial')
      setPName(''); setPDose('')
    }
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
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(10,10,10,0.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal
    >
      <div style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        width: '100%', maxWidth: 480,
        maxHeight: '90dvh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '22px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <span className="section-label">{isEditMode ? 'Edit protocol' : 'New protocol'}</span>
            <h3 style={{ margin: 0 }}>
              {STEP_LABELS[step]}
              {!isEditMode && (
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-dim)', marginLeft: 8 }}>
                  Step {stepIndex + 1} of 3
                </span>
              )}
            </h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', gap: 6, padding: '12px 24px 0', alignItems: 'center' }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: i <= stepIndex ? 'var(--accent)' : 'var(--line)',
                transition: 'background 200ms',
              }} />
              {i < STEPS.length - 1 && (
                <div style={{ width: 20, height: 2, background: i < stepIndex ? 'var(--accent)' : 'var(--line)', borderRadius: 1 }} />
              )}
            </div>
          ))}
          <span style={{ fontSize: 11, color: 'var(--ink-mute)', marginLeft: 4 }}>
            {STEP_LABELS[step]}
          </span>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '20px 24px 28px' }}>

          {/* ── Step 1: Compound ── */}
          {step === 'compound' && (
            <div className="form-grid">
              {!showAddCompound && compounds.length > 0 ? (
                <>
                  <p className="panel-note wide-field">
                    You have {compounds.length} compound{compounds.length !== 1 ? 's' : ''} set up.
                    Jump to protocol or add a new compound.
                  </p>
                  <button type="button" className="ghost-button wide-field" onClick={() => setShowAddCompound(true)}>
                    <Plus size={14} /> Add new compound
                  </button>
                  <button type="button" className="primary-button wide-field" onClick={() => setStep('protocol')} style={{ justifyContent: 'center' }}>
                    Use existing compound <ChevronRight size={14} />
                  </button>
                </>
              ) : (
                <>
                  {/* Preset search */}
                  <div className="wide-field" style={{ position: 'relative' }}>
                    <label>
                      Quick-start from library
                      <div style={{ position: 'relative', marginTop: 4 }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-mute)', pointerEvents: 'none' }} />
                        <input
                          value={presetQuery}
                          onChange={(e) => setPresetQuery(e.target.value)}
                          placeholder="Search Testosterone, Nandrolone…"
                          style={{ paddingLeft: 30 }}
                        />
                      </div>
                    </label>
                    {filteredPresets.length > 0 && (
                      <div style={{
                        border: '1px solid var(--line)', borderRadius: 'var(--radius)', background: 'var(--surface)',
                        boxShadow: 'var(--shadow-lg)', marginTop: 4, overflow: 'hidden',
                      }}>
                        {filteredPresets.map((name) => {
                          const forms = formsForCompound(name).filter(Boolean)
                          return (
                            <button
                              key={name}
                              type="button"
                              style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '8px 12px', background: 'none', border: 'none',
                                borderBottom: '1px solid var(--line)', cursor: 'pointer',
                                color: 'var(--ink)', fontSize: 13,
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                              onClick={() => {
                                setCName(name + (forms.length === 1 && forms[0] ? ` ${forms[0]}` : ''))
                                setCCategory(name === 'Testosterone' ? 'TRT' : 'Other')
                                setCUnit(COMPOUND_DEFAULT_UNIT[name] ?? 'mg')
                                if (forms.length === 1 && forms[0]) setPresetForm(forms[0])
                                setPresetQuery('')
                              }}
                            >
                              <span style={{ fontWeight: 500 }}>{name}</span>
                              {forms.filter(Boolean).length > 0 && (
                                <span style={{ color: 'var(--ink-mute)', fontSize: 11, marginLeft: 8 }}>
                                  {forms.filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

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
                    Colour
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {COMPOUND_COLORS.map((col) => (
                        <button key={col} type="button" onClick={() => setCColor(col)} style={{
                          width: 24, height: 24, borderRadius: '50%', background: col, border: 'none',
                          outline: cColor === col ? `2px solid ${col}` : 'none',
                          outlineOffset: 2, cursor: 'pointer',
                        }} />
                      ))}
                    </div>
                  </label>
                  <div style={{ display: 'flex', gap: 8 }} className="wide-field">
                    <button type="button" className="primary-button" onClick={saveCompound} disabled={!cName} style={{ flex: 1, justifyContent: 'center' }}>
                      Save &amp; next <ChevronRight size={14} />
                    </button>
                    {compounds.length > 0 && (
                      <button type="button" className="ghost-button" onClick={() => { setShowAddCompound(false) }}>
                        <X size={13} /> Cancel
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Step 2: Protocol ── */}
          {step === 'protocol' && (
            <div className="form-grid">
              <label>
                Compound
                <select value={effectivePCompoundId} onChange={(e) => {
                  setPCompoundId(e.target.value)
                  const c = compounds.find((x) => String(x.id) === e.target.value)
                  if (c) { setPDose(String(c.defaultDose)); setPUnit(c.unit) }
                }}>
                  <option value="">Select compound…</option>
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
              <div style={{ display: 'flex', gap: 8 }} className="wide-field">
                {!isEditMode && (
                  <button type="button" className="ghost-button" onClick={() => setStep('compound')}>
                    ← Back
                  </button>
                )}
                <button type="button" className="primary-button" onClick={saveProtocol} disabled={!pDose || !effectivePCompoundId} style={{ flex: 1, justifyContent: 'center' }}>
                  {isEditMode ? 'Save changes' : (<>Save &amp; next <ChevronRight size={14} /></>)}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Vial ── */}
          {step === 'vial' && (
            <div className="form-grid">
              <p className="panel-note wide-field">
                Protocol saved. Optionally add a vial to track volume and get run-out estimates.
              </p>
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
                <button type="button" className="ghost-button" onClick={onClose}>
                  Skip
                </button>
                <button type="button" className="primary-button" onClick={saveVial} disabled={!vTotalMl} style={{ flex: 1, justifyContent: 'center' }}>
                  <Plus size={14} /> Create
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
