// Quick-log modal — opens from sidebar buttons without navigating away.
// Three tabs: Injection | Blood Pressure | Symptoms.

import { useEffect, useMemo, useState } from 'react'
import { Brain, Droplet, HeartPulse, Plus, Scale, X } from 'lucide-react'
import { db, type BodyMetric, type Compound, type Symptom, type Unit } from '../lib/db'
import { logInjection, pickActiveVial } from '../lib/injections'
import { useLiveQuery } from 'dexie-react-hooks'
import { SiteCombobox } from './SiteCombobox'
import { COMMON_SITES } from '../lib/sites'
import type { QuickLogPrefill } from '../App'

type Tab = 'injection' | 'bp' | 'symptoms' | 'weight'

const SLIDERS: Array<{ key: keyof Symptom; label: string }> = [
  { key: 'libido', label: 'Libido' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'mood', label: 'Mood' },
  { key: 'energy', label: 'Energy' },
  { key: 'waterRetention', label: 'Water retention' },
  { key: 'acne', label: 'Acne' },
  { key: 'nippleSensitivity', label: 'Nipple sensitivity' },
  { key: 'jointPain', label: 'Joint pain' },
  { key: 'headache', label: 'Headache' },
]

export function QuickLog({
  open,
  initialTab,
  prefill,
  compounds,
  onClose,
}: {
  open: boolean
  initialTab: Tab
  prefill?: QuickLogPrefill
  compounds: Compound[]
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>(initialTab)

  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

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
        width: '100%', maxWidth: 540,
        maxHeight: '90dvh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 24px 0' }}>
          <div className="pill-tabs" role="tablist">
            <button type="button" role="tab" className={tab === 'injection' ? 'active' : undefined} onClick={() => setTab('injection')}>
              <Droplet size={12} /> Injection
            </button>
            <button type="button" role="tab" className={tab === 'bp' ? 'active' : undefined} onClick={() => setTab('bp')}>
              <HeartPulse size={12} /> Blood pressure
            </button>
            <button type="button" role="tab" className={tab === 'symptoms' ? 'active' : undefined} onClick={() => setTab('symptoms')}>
              <Brain size={12} /> Symptoms
            </button>
            <button type="button" role="tab" className={tab === 'weight' ? 'active' : undefined} onClick={() => setTab('weight')}>
              <Scale size={12} /> Weight
            </button>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>

        {/* Body — scrollable */}
        <div style={{ overflowY: 'auto', padding: '20px 24px 28px' }}>
          {tab === 'injection' && <InjectionForm compounds={compounds} prefill={prefill} onSaved={onClose} />}
          {tab === 'bp' && <BPForm onSaved={onClose} />}
          {tab === 'symptoms' && <SymptomsForm onSaved={onClose} />}
          {tab === 'weight' && <WeightForm onSaved={onClose} />}
        </div>
      </div>
    </div>
  )
}

// ── Injection ──────────────────────────────────────────────────────────────

function InjectionForm({
  compounds,
  prefill,
  onSaved,
}: {
  compounds: Compound[]
  prefill?: QuickLogPrefill
  onSaved: () => void
}) {
  const vials = useLiveQuery(() => db.vials.toArray(), [], [])
  const injections = useLiveQuery(() => db.injections.orderBy('takenAt').reverse().limit(30).toArray(), [], [])
  const recentSites = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const inj of injections ?? []) {
      if (inj.site && !seen.has(inj.site)) { seen.add(inj.site); out.push(inj.site) }
      if (out.length >= 6) break
    }
    return out
  }, [injections])

  const [compoundId, setCompoundId] = useState<number | ''>(prefill?.compoundId ?? compounds[0]?.id ?? '')
  const [dose, setDose] = useState(prefill?.dose !== undefined ? String(prefill.dose) : '')
  const [site, setSite] = useState(COMMON_SITES[0])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const compound = compounds.find((c) => c.id === compoundId)

  // Re-initialise when modal opens with a different prefill
  useEffect(() => {
    if (prefill?.compoundId !== undefined) setCompoundId(prefill.compoundId)
    else if (compounds[0]?.id) setCompoundId(compounds[0].id)
    setDose(prefill?.dose !== undefined ? String(prefill.dose) : '')
    setNotes('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.compoundId, prefill?.dose, prefill?.scheduledAt])

  useEffect(() => {
    if (compounds.length > 0 && compoundId === '') setCompoundId(compounds[0].id ?? '')
  }, [compounds, compoundId])

  async function save() {
    if (!compound || !dose) return
    setBusy(true)
    try {
      const unit = compound.unit as Unit
      const activeVialId = vials ? pickActiveVial(vials, compound.id!)?.id : undefined
      const injectionId = await logInjection({
        compoundId: compound.id!,
        takenAt: new Date().toISOString(),
        dose: Number(dose),
        unit,
        route: 'SubQ',
        site,
        notes: notes || undefined,
        vialId: activeVialId,
      })
      // If triggered from a scheduled protocol dose, mark it as done
      if (prefill?.protocolId && prefill?.scheduledAt) {
        await db.protocolDoses.add({
          protocolId: prefill.protocolId,
          scheduledAt: prefill.scheduledAt,
          status: 'done',
          injectionId,
        })
      }
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  if (compounds.length === 0) {
    return <p className="panel-note">Add a compound first in the Protocols page.</p>
  }

  return (
    <div className="form-grid">
      <label className="wide-field">
        Compound
        <select value={compoundId} onChange={(e) => setCompoundId(Number(e.target.value))}>
          {compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>
        Dose ({compound?.unit ?? 'mg'})
        <input inputMode="decimal" placeholder={String(compound?.defaultDose ?? '')} value={dose} onChange={(e) => setDose(e.target.value)} />
      </label>
      <label>
        Site
        <SiteCombobox value={site} onChange={setSite} recentSites={recentSites} />
      </label>
      <label className="wide-field">
        Notes (optional)
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button type="button" className="primary-button wide-field" onClick={save} disabled={busy || !dose}>
        <Plus size={14} /> {busy ? 'Saving…' : 'Log injection'}
      </button>
    </div>
  )
}

// ── Blood Pressure ─────────────────────────────────────────────────────────

function BPForm({ onSaved }: { onSaved: () => void }) {
  const [sys, setSys] = useState('')
  const [dia, setDia] = useState('')
  const [pulse, setPulse] = useState('')
  const [weight, setWeight] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!sys || !dia) return
    setBusy(true)
    try {
      await db.vitals.add({
        measuredAt: new Date().toISOString(),
        systolic: Number(sys),
        diastolic: Number(dia),
        pulse: pulse ? Number(pulse) : undefined,
        weightKg: weight ? Number(weight) : undefined,
      })
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form-grid">
      <label>
        Systolic
        <input inputMode="numeric" placeholder="120" value={sys} onChange={(e) => setSys(e.target.value)} autoFocus />
      </label>
      <label>
        Diastolic
        <input inputMode="numeric" placeholder="80" value={dia} onChange={(e) => setDia(e.target.value)} />
      </label>
      <label>
        Pulse (bpm)
        <input inputMode="numeric" placeholder="65" value={pulse} onChange={(e) => setPulse(e.target.value)} />
      </label>
      <label>
        Weight (kg)
        <input inputMode="decimal" placeholder="82.5" value={weight} onChange={(e) => setWeight(e.target.value)} />
      </label>
      <button type="button" className="primary-button wide-field" onClick={save} disabled={busy || !sys || !dia}>
        <Plus size={14} /> {busy ? 'Saving…' : 'Save reading'}
      </button>
    </div>
  )
}

// ── Weight & body composition ──────────────────────────────────────────────

function WeightForm({ onSaved }: { onSaved: () => void }) {
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [waist, setWaist] = useState('')
  const [busy, setBusy] = useState(false)
  const canSave = !!(weight || bodyFat || waist)

  async function save() {
    if (!canSave) return
    setBusy(true)
    try {
      const entry: Omit<BodyMetric, 'id'> = {
        measuredAt: new Date().toISOString(),
        source: 'manual',
        weightKg: weight ? Number(weight) : undefined,
        bodyFatPct: bodyFat ? Number(bodyFat) : undefined,
        waistCm: waist ? Number(waist) : undefined,
      }
      await db.bodyMetrics.add(entry)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form-grid">
      <label>
        Weight (kg)
        <input inputMode="decimal" placeholder="82.5" value={weight} onChange={(e) => setWeight(e.target.value)} autoFocus />
      </label>
      <label>
        Body fat (%)
        <input inputMode="decimal" placeholder="18.5" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} />
      </label>
      <label className="wide-field">
        Waist (cm)
        <input inputMode="decimal" placeholder="86" value={waist} onChange={(e) => setWaist(e.target.value)} />
      </label>
      <button type="button" className="primary-button wide-field" onClick={save} disabled={busy || !canSave}>
        <Plus size={14} /> {busy ? 'Saving…' : 'Save measurement'}
      </button>
    </div>
  )
}

// ── Symptoms ───────────────────────────────────────────────────────────────

function SymptomsForm({ onSaved }: { onSaved: () => void }) {
  const [draft, setDraft] = useState<Partial<Symptom>>({})
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await db.symptoms.add({
        recordedAt: new Date().toISOString(),
        ...draft,
        notes: notes || undefined,
      })
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="symptom-grid" style={{ '--symptom-cols': 2 } as React.CSSProperties}>
        {SLIDERS.map(({ key, label }) => {
          const val = (draft[key] as number | undefined) ?? 0
          return (
            <div className="symptom-cell" key={key as string}>
              <label>
                {label}
                <strong style={{ minWidth: 16, textAlign: 'right' }}>{val}</strong>
              </label>
              <input
                type="range" min={0} max={5} step={1}
                value={val}
                onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
              />
            </div>
          )
        })}
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-dim)', fontWeight: 500 }}>
        Notes (optional)
        <textarea
          rows={2}
          style={{ resize: 'none', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', fontSize: 13 }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <button type="button" className="primary-button" style={{ alignSelf: 'flex-start' }} onClick={save} disabled={busy}>
        <Plus size={14} /> {busy ? 'Saving…' : 'Save snapshot'}
      </button>
    </div>
  )
}
