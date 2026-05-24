// Quick-log modal — opens from topbar/sidebar without navigating away.
// Two tabs: Injection | Blood Pressure.
// Symptoms are embedded inline in each form.
// Weight is a field on the injection form.

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Droplet, HeartPulse, Plus, X } from 'lucide-react'
import { db, type Compound, type Symptom, type Unit } from '../lib/db'
import { logInjection, pickActiveVial } from '../lib/injections'
import { useLiveQuery } from 'dexie-react-hooks'
import { SiteCombobox } from './SiteCombobox'
import { COMMON_SITES } from '../lib/sites'
import type { QuickLogPrefill } from '../App'

type Tab = 'injection' | 'bp'

// ── Symptom chip definitions ───────────────────────────────────────────────

type ChipDef = {
  label: string
  key: keyof Symptom
  positiveValue: number   // value written when chip is selected
}

const CHIPS: ChipDef[] = [
  { label: 'Good mood', key: 'mood', positiveValue: 4 },
  { label: 'Low mood', key: 'mood', positiveValue: 2 },
  { label: 'High energy', key: 'energy', positiveValue: 4 },
  { label: 'Tired', key: 'energy', positiveValue: 1 },
  { label: 'Good sleep', key: 'sleep', positiveValue: 4 },
  { label: 'Poor sleep', key: 'sleep', positiveValue: 1 },
  { label: 'High libido', key: 'libido', positiveValue: 4 },
  { label: 'Low libido', key: 'libido', positiveValue: 1 },
  { label: 'Acne', key: 'acne', positiveValue: 3 },
  { label: 'Joint pain', key: 'jointPain', positiveValue: 3 },
  { label: 'Water retention', key: 'waterRetention', positiveValue: 3 },
  { label: 'Nipple sensitivity', key: 'nippleSensitivity', positiveValue: 3 },
  { label: 'Headache', key: 'headache', positiveValue: 3 },
]

// Map selected chip labels → a partial Symptom record
function chipsToSymptom(selected: string[]): Partial<Symptom> {
  const out: Partial<Symptom> = {}
  for (const label of selected) {
    const def = CHIPS.find((c) => c.label === label)
    if (def) (out as Record<string, number>)[def.key as string] = def.positiveValue
  }
  return out
}

// ── Inline symptom chip picker ─────────────────────────────────────────────

function SymptomsChipPicker({
  selected,
  notes,
  onChangeSelected,
  onChangeNotes,
}: {
  selected: string[]
  notes: string
  onChangeSelected: (s: string[]) => void
  onChangeNotes: (n: string) => void
}) {
  const [open, setOpen] = useState(false)

  function toggle(label: string) {
    // chips sharing the same key are mutually exclusive (e.g. Good mood / Low mood)
    const def = CHIPS.find((c) => c.label === label)!
    const conflicting = CHIPS.filter((c) => c.key === def.key && c.label !== label).map((c) => c.label)
    const next = selected.includes(label)
      ? selected.filter((s) => s !== label)
      : [...selected.filter((s) => !conflicting.includes(s)), label]
    onChangeSelected(next)
  }

  const summary = selected.length > 0
    ? selected.join(' · ')
    : open ? '' : 'No symptoms logged'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        type="button"
        className="symptom-section-toggle"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        <span style={{ flex: 1, textAlign: 'left' }}>
          How do you feel?
          {!open && selected.length > 0 && (
            <span style={{ color: 'var(--accent-ink)', marginLeft: 6, fontWeight: 600 }}>
              {summary}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="symptom-chips">
            {CHIPS.map(({ label }) => (
              <button
                key={label}
                type="button"
                className={`symptom-chip${selected.includes(label) ? ' selected' : ''}`}
                onClick={() => toggle(label)}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => onChangeNotes(e.target.value)}
            style={{ width: '100%', fontSize: 13 }}
          />
        </div>
      )}
    </div>
  )
}

// ── Main QuickLog modal ────────────────────────────────────────────────────

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
              <HeartPulse size={12} /> BP
            </button>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>

        {/* Body — scrollable */}
        <div style={{ overflowY: 'auto', padding: '20px 24px 28px' }}>
          {tab === 'injection' && <InjectionForm compounds={compounds} prefill={prefill} onSaved={onClose} />}
          {tab === 'bp' && <BPForm onSaved={onClose} />}
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
  const injections = useLiveQuery(() => db.injections.orderBy('takenAt').reverse().limit(50).toArray(), [], [])

  const recentSites = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const inj of injections ?? []) {
      if (inj.site && !seen.has(inj.site)) { seen.add(inj.site); out.push(inj.site) }
      if (out.length >= 8) break
    }
    return out
  }, [injections])

  // Last recorded weight for placeholder
  const lastWeightKg = useMemo(() => {
    for (const inj of injections ?? []) {
      if (inj.weightKg !== undefined) return inj.weightKg
    }
    return undefined
  }, [injections])

  const [compoundId, setCompoundId] = useState<number | ''>(prefill?.compoundId ?? compounds[0]?.id ?? '')
  const [dose, setDose] = useState(prefill?.dose !== undefined ? String(prefill.dose) : '')
  const [route, setRoute] = useState<'IM' | 'SubQ' | 'Oral' | 'Other'>('IM')
  const [site, setSite] = useState(COMMON_SITES[0])
  const [weightKg, setWeightKg] = useState('')
  const [notes, setNotes] = useState('')
  const [symptomChips, setSymptomChips] = useState<string[]>([])
  const [symptomNotes, setSymptomNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const compound = compounds.find((c) => c.id === compoundId)

  useEffect(() => {
    if (prefill?.compoundId !== undefined) setCompoundId(prefill.compoundId)
    else if (compounds[0]?.id) setCompoundId(compounds[0].id)
    setDose(prefill?.dose !== undefined ? String(prefill.dose) : '')
    setNotes('')
    setWeightKg('')
    setSymptomChips([])
    setSymptomNotes('')
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
        route,
        site,
        notes: notes || undefined,
        vialId: activeVialId,
        weightKg: weightKg ? Number(weightKg) : undefined,
      })
      if (prefill?.protocolId && prefill?.scheduledAt) {
        await db.protocolDoses.add({
          protocolId: prefill.protocolId,
          scheduledAt: prefill.scheduledAt,
          status: 'done',
          injectionId,
        })
      }
      // Save symptom snapshot if any chips selected or notes written
      if (symptomChips.length > 0 || symptomNotes) {
        await db.symptoms.add({
          recordedAt: new Date().toISOString(),
          ...chipsToSymptom(symptomChips),
          notes: symptomNotes || undefined,
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
      <label className="wide-field">
        Route
        <div className="pill-tabs" role="group" style={{ marginTop: 6 }}>
          {(['IM', 'SubQ', 'Oral', 'Other'] as const).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={route === r} className={route === r ? 'active' : undefined} onClick={() => setRoute(r)}>{r}</button>
          ))}
        </div>
      </label>
      <label>
        Site
        <SiteCombobox value={site} onChange={setSite} recentSites={recentSites} />
      </label>
      <label>
        Weight (kg)
        <input
          inputMode="decimal"
          placeholder={lastWeightKg !== undefined ? `${lastWeightKg} (last)` : 'e.g. 82.5'}
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
        />
      </label>
      <label className="wide-field">
        Notes (optional)
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="wide-field" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <SymptomsChipPicker
          selected={symptomChips}
          notes={symptomNotes}
          onChangeSelected={setSymptomChips}
          onChangeNotes={setSymptomNotes}
        />
      </div>
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
  const [symptomChips, setSymptomChips] = useState<string[]>([])
  const [symptomNotes, setSymptomNotes] = useState('')
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
      })
      if (symptomChips.length > 0 || symptomNotes) {
        await db.symptoms.add({
          recordedAt: new Date().toISOString(),
          ...chipsToSymptom(symptomChips),
          notes: symptomNotes || undefined,
        })
      }
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
      <label className="wide-field">
        Pulse (bpm)
        <input inputMode="numeric" placeholder="65" value={pulse} onChange={(e) => setPulse(e.target.value)} />
      </label>
      <div className="wide-field" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <SymptomsChipPicker
          selected={symptomChips}
          notes={symptomNotes}
          onChangeSelected={setSymptomChips}
          onChangeNotes={setSymptomNotes}
        />
      </div>
      <button type="button" className="primary-button wide-field" onClick={save} disabled={busy || !sys || !dia}>
        <Plus size={14} /> {busy ? 'Saving…' : 'Save reading'}
      </button>
    </div>
  )
}
