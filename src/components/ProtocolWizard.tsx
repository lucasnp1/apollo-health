/**
 * ProtocolWizard — simplified single-screen form.
 *
 * Creates (or edits) a compound + protocol in one step.
 * No vials, no multi-step pagination.
 */
import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { db, type Compound, type Protocol, type ProtocolCadence, type TestosteroneEster, type Unit } from '../lib/db'
import { esterProfiles } from '../lib/insights'
import { PK_COMPOUND_NAMES, formsForCompound } from '../lib/pk'

const UNITS: Unit[] = ['mg', 'mcg', 'iu', 'ml', 'tablet', 'capsule']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const COLORS = ['#0891b2', '#6366f1', '#f59e0b', '#ec4899', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#0f766e', '#d97706']
const ESTERS: TestosteroneEster[] = ['Enanthate', 'Cypionate', 'Propionate', 'Undecanoate', 'Custom']

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
  const isEdit = !!editProtocol

  // Compound
  const [compoundMode, setCompoundMode] = useState<'existing' | 'new'>('existing')
  const [selectedCompoundId, setSelectedCompoundId] = useState('')
  const [presetQuery, setPresetQuery]   = useState('')
  const [presetForm, setPresetForm]     = useState('')
  const [cName, setCName]       = useState('')
  const [cEster, setCEster]     = useState<TestosteroneEster>('Enanthate')
  const [cColor, setCColor]     = useState(COLORS[0])
  const [cCategory, setCCategory] = useState<Compound['category']>('TRT')

  const filteredPresets = useMemo(() => {
    if (!presetQuery.trim()) return []
    const q = presetQuery.toLowerCase()
    return PK_COMPOUND_NAMES.filter(n => n.toLowerCase().includes(q)).slice(0, 6)
  }, [presetQuery])

  const formOptions = useMemo(() => {
    if (!cName) return []
    return formsForCompound(cName)
  }, [cName])

  // Protocol
  const [pName,  setPName]  = useState('')
  const [pDose,  setPDose]  = useState('')
  const [pUnit,  setPUnit]  = useState<Unit>('mg')
  const [pKind,  setPKind]  = useState<ProtocolCadence['kind']>('everyNDays')
  const [pN,     setPN]     = useState('3.5')
  const [pDow,   setPDow]   = useState<number[]>([1, 4])
  const [pTime,  setPTime]  = useState('09:00')
  const [pPhase, setPPhase] = useState<Protocol['phase']>('Maintenance')
  const [saving, setSaving] = useState(false)

  // Init / reset
  useEffect(() => {
    if (!open) return
    if (isEdit && editProtocol) {
      setCompoundMode('existing')
      setSelectedCompoundId(String(editProtocol.compoundId))
      setPName(editProtocol.name)
      setPDose(String(editProtocol.dose))
      setPUnit(editProtocol.unit)
      setPPhase(editProtocol.phase ?? 'Maintenance')
      const cad = editProtocol.cadence
      setPKind(cad.kind)
      if (cad.kind === 'everyNDays') setPN(String(cad.n))
      if (cad.kind === 'weekly')     setPDow(cad.daysOfWeek)
      if ((cad.kind === 'everyNDays' || cad.kind === 'weekly')) setPTime(cad.timeOfDay ?? '09:00')
      if (cad.kind === 'daily') setPTime(cad.timesOfDay?.[0] ?? '09:00')
    } else {
      setCompoundMode(compounds.length === 0 ? 'new' : 'existing')
      setSelectedCompoundId('')
      setCName(''); setCEster('Enanthate'); setCColor(COLORS[0]); setCCategory('TRT')
      setPresetQuery(''); setPresetForm('')
      setPName(''); setPDose(''); setPUnit('mg')
      setPKind('everyNDays'); setPN('3.5'); setPDow([1, 4]); setPTime('09:00')
      setPPhase('Maintenance')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editProtocol?.id])

  // Escape key
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  const selectedCompound = compounds.find(c => String(c.id) === selectedCompoundId)
  const isTRT = compoundMode === 'new'
    ? cCategory === 'TRT'
    : selectedCompound?.category === 'TRT'

  const canSave = pDose && (
    (compoundMode === 'existing' && selectedCompoundId) ||
    (compoundMode === 'new' && cName)
  )

  async function save() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      let compoundId: number
      if (compoundMode === 'new') {
        const detectedEster = ESTERS.find(e => presetForm.toLowerCase().includes(e.toLowerCase()))
        const effectiveEster = detectedEster ?? cEster
        compoundId = await db.compounds.add({
          name: cName,
          category: cCategory,
          defaultDose: Number(pDose) || 100,
          unit: pUnit,
          color: cColor,
          schedule: '',
          ester: isTRT ? effectiveEster : undefined,
          halfLifeDays: isTRT ? esterProfiles[effectiveEster]?.halfLifeDays : undefined,
          peakHours:    isTRT ? esterProfiles[effectiveEster]?.peakHours    : undefined,
        })
      } else {
        compoundId = Number(selectedCompoundId)
      }

      let cadence: ProtocolCadence
      if      (pKind === 'everyNDays') cadence = { kind: 'everyNDays', n: Number(pN) || 1, timeOfDay: pTime }
      else if (pKind === 'weekly')     cadence = { kind: 'weekly', daysOfWeek: pDow, timeOfDay: pTime }
      else if (pKind === 'daily')      cadence = { kind: 'daily', timesOfDay: [pTime] }
      else                             cadence = { kind: 'asNeeded' }

      const name = pName.trim() || (
        compoundMode === 'new' ? `${cName}` : `${selectedCompound?.name ?? ''}`
      )
      const proto = { name, compoundId, dose: Number(pDose), unit: pUnit, cadence, phase: pPhase }

      if (isEdit && editProtocol.id) {
        await db.protocols.update(editProtocol.id, proto)
      } else {
        await db.protocols.add({ ...proto, startedAt: new Date().toISOString() })
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="sheet-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="sheet" style={{ maxWidth: 560 }}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h3>{isEdit ? 'Edit protocol' : 'New protocol'}</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="sheet-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Compound section ── */}
          {!isEdit && (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Compound</span>
                {compounds.length > 0 && (
                  <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 2, gap: 1 }}>
                    {(['existing', 'new'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setCompoundMode(m)}
                        style={{
                          padding: '4px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          background: compoundMode === m ? 'var(--surface)' : 'transparent',
                          color: compoundMode === m ? 'var(--ink)' : 'var(--ink-mute)',
                          boxShadow: compoundMode === m ? 'var(--shadow-sm)' : 'none',
                        }}
                      >
                        {m === 'existing' ? 'Existing' : 'New'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {compoundMode === 'existing' ? (
                <select
                  value={selectedCompoundId}
                  onChange={e => {
                    setSelectedCompoundId(e.target.value)
                    const c = compounds.find(x => String(x.id) === e.target.value)
                    if (c && !pDose) { setPDose(String(c.defaultDose)); setPUnit(c.unit) }
                  }}
                  style={{ width: '100%' }}
                >
                  <option value="">Select compound…</option>
                  {compounds.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.ester ? ` (${c.ester})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Preset search */}
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-mute)', pointerEvents: 'none' }} />
                    <input
                      value={presetQuery}
                      onChange={e => { setPresetQuery(e.target.value); if (!e.target.value) setPresetForm('') }}
                      placeholder="Search compound (e.g. Testosterone)…"
                      style={{ paddingLeft: 34, width: '100%' }}
                    />
                    {filteredPresets.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, marginTop: 4, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
                        {filteredPresets.map(name => (
                          <button
                            key={name}
                            type="button"
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 14, fontWeight: 500, color: 'var(--ink)', borderBottom: '1px solid var(--line)' }}
                            onClick={() => {
                              setCName(name)
                              setPresetQuery(name)
                              setPresetForm('')
                              if (filteredPresets.length) setPresetQuery('')
                              // Clear dropdown
                              setTimeout(() => setPresetQuery(''), 0)
                              const forms = formsForCompound(name)
                              if (forms.length === 1) setPresetForm(forms[0])
                            }}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Manual name if no preset selected */}
                  {!filteredPresets.length && (
                    <input
                      value={cName}
                      onChange={e => setCName(e.target.value)}
                      placeholder="Compound name"
                      style={{ width: '100%' }}
                    />
                  )}

                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-dim)' }}>Category</span>
                      <select value={cCategory} onChange={e => setCCategory(e.target.value as Compound['category'])}>
                        {(['TRT', 'Ancillary', 'Peptide', 'Supplement', 'Other'] as Compound['category'][]).map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    {isTRT && formOptions.length > 0 && (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-dim)' }}>Ester</span>
                        <select value={presetForm || cEster} onChange={e => { setPresetForm(e.target.value); setCEster(e.target.value as TestosteroneEster) }}>
                          {formOptions.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                    )}
                    {isTRT && formOptions.length === 0 && (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-dim)' }}>Ester</span>
                        <select value={cEster} onChange={e => setCEster(e.target.value as TestosteroneEster)}>
                          {ESTERS.map(e => <option key={e}>{e}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Color swatches */}
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-dim)', display: 'block', marginBottom: 8 }}>Colour</span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {COLORS.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCColor(c)}
                          aria-label={c}
                          style={{
                            width: 28, height: 28, borderRadius: '50%', background: c, flexShrink: 0,
                            outline: cColor === c ? `3px solid ${c}` : 'none',
                            outlineOffset: 2,
                            boxShadow: cColor === c ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : 'none',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── Schedule section ── */}
          <section>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 10 }}>
              Schedule
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Dose row */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-dim)' }}>Dose</span>
                  <input inputMode="decimal" value={pDose} onChange={e => setPDose(e.target.value)} placeholder="200" />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-dim)' }}>Unit</span>
                  <select value={pUnit} onChange={e => setPUnit(e.target.value as Unit)}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-dim)' }}>Phase</span>
                  <select value={pPhase} onChange={e => setPPhase(e.target.value as Protocol['phase'])}>
                    {['TRT', 'Blast', 'Cruise', 'PCT', 'Maintenance', 'Bridge', 'Trial'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {/* Frequency */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-dim)' }}>Frequency</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {([
                    { kind: 'everyNDays', label: 'Every N days' },
                    { kind: 'weekly',     label: 'Days of week' },
                    { kind: 'daily',      label: 'Daily' },
                    { kind: 'asNeeded',   label: 'As needed' },
                  ] as const).map(opt => (
                    <button
                      key={opt.kind}
                      type="button"
                      onClick={() => setPKind(opt.kind)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        fontSize: 13,
                        fontWeight: 600,
                        textAlign: 'left',
                        background: pKind === opt.kind ? 'var(--accent-soft)' : 'var(--surface-2)',
                        color: pKind === opt.kind ? 'var(--accent)' : 'var(--ink-dim)',
                        border: pKind === opt.kind ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                        transition: 'all 120ms',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Cadence detail */}
                {pKind === 'everyNDays' && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-dim)', whiteSpace: 'nowrap' }}>Every</span>
                    <input inputMode="decimal" value={pN} onChange={e => setPN(e.target.value)} style={{ width: 72 }} />
                    <span style={{ fontSize: 13, color: 'var(--ink-dim)', whiteSpace: 'nowrap' }}>days</span>
                  </div>
                )}
                {pKind === 'weekly' && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {DOW.map((d, i) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setPDow(cur => cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i].sort())}
                        style={{
                          width: 40, height: 40,
                          borderRadius: '50%',
                          fontSize: 12,
                          fontWeight: 700,
                          background: pDow.includes(i) ? 'var(--accent)' : 'var(--surface-2)',
                          color: pDow.includes(i) ? '#fff' : 'var(--ink-dim)',
                          transition: 'all 120ms',
                        }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}
                {pKind !== 'asNeeded' && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>Time</span>
                    <input type="time" value={pTime} onChange={e => setPTime(e.target.value)} style={{ width: 120 }} />
                  </div>
                )}
              </div>

              {/* Optional protocol name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-dim)' }}>Label <span style={{ fontWeight: 400, color: 'var(--ink-mute)' }}>(optional)</span></span>
                <input
                  value={pName}
                  onChange={e => setPName(e.target.value)}
                  placeholder={compoundMode === 'new' ? cName || 'e.g. Test E 200mg' : selectedCompound?.name || 'e.g. Test E 200mg'}
                />
              </div>
            </div>
          </section>

          {/* Save */}
          <button
            type="button"
            className="primary-button"
            style={{ width: '100%', justifyContent: 'center', height: 50, fontSize: 16 }}
            onClick={save}
            disabled={!canSave || saving}
          >
            <Plus size={16} /> {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add protocol'}
          </button>
        </div>
      </div>
    </div>
  )
}
