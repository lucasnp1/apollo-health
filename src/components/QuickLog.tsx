// Quick-log modal — opens from topbar/sidebar without navigating away.
// Two tabs: Injection | Blood Pressure.
// Symptoms are embedded inline in each form.
// Weight is a field on the injection form.

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Droplet, HeartPulse, Plus } from 'lucide-react'
import { db, type Compound, type Symptom, type Unit } from '../lib/db'
import { logInjection, pickActiveVial } from '../lib/injections'
import { useLiveQuery } from 'dexie-react-hooks'
import { SiteCombobox } from './SiteCombobox'
import { COMMON_SITES } from '../lib/sites'
import type { QuickLogPrefill } from '../App'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

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

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        <span className="flex-1 text-left">
          How do you feel?
          {!open && selected.length > 0 && (
            <span className="ml-1.5 font-medium text-foreground">{selected.join(' · ')}</span>
          )}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            {CHIPS.map(({ label }) => {
              const active = selected.includes(label)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggle(label)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    active
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <Input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => onChangeNotes(e.target.value)}
            className="text-sm"
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="sr-only">Quick log</DialogTitle>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="injection"><Droplet className="size-3.5" /> Injection</TabsTrigger>
              <TabsTrigger value="bp"><HeartPulse className="size-3.5" /> BP</TabsTrigger>
            </TabsList>
          </Tabs>
        </DialogHeader>

        {tab === 'injection' && <InjectionForm compounds={compounds} prefill={prefill} onSaved={onClose} />}
        {tab === 'bp' && <BPForm onSaved={onClose} />}
      </DialogContent>
    </Dialog>
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
      // Protocol-dose linking is centralized in logInjection:
      //   - When `link` is provided (Overview "Mark taken" knows the exact
      //     scheduled instant), that exact dose is marked done.
      //   - Otherwise logInjection auto-matches the nearest pending dose for
      //     any protocol on this compound within ±48h.
      const link = prefill?.protocolId && prefill.scheduledAt
        ? { protocolId: prefill.protocolId, scheduledAt: prefill.scheduledAt }
        : undefined
      await logInjection(
        {
          compoundId: compound.id!,
          takenAt: new Date().toISOString(),
          dose: Number(dose),
          unit,
          route,
          site,
          notes: notes || undefined,
          vialId: activeVialId,
          weightKg: weightKg ? Number(weightKg) : undefined,
        },
        link ? { link } : undefined,
      )
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
    return <p className="text-sm text-muted-foreground">Add a compound first in the Protocols page.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 flex flex-col gap-1.5">
        <Label>Compound</Label>
        <Select value={String(compoundId)} onValueChange={(v) => setCompoundId(Number(v))}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {compounds.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ql-dose">Dose ({compound?.unit ?? 'mg'})</Label>
        <Input id="ql-dose" inputMode="decimal" placeholder={String(compound?.defaultDose ?? '')} value={dose} onChange={(e) => setDose(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Route</Label>
        <Tabs value={route} onValueChange={(v) => setRoute(v as typeof route)}>
          <TabsList className="h-9 w-full">
            {(['IM', 'SubQ', 'Oral', 'Other'] as const).map((r) => (
              <TabsTrigger key={r} value={r} className="px-1.5 text-xs">{r}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Site</Label>
        <SiteCombobox value={site} onChange={setSite} recentSites={recentSites} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ql-weight">Weight (kg)</Label>
        <Input
          id="ql-weight"
          inputMode="decimal"
          placeholder={lastWeightKg !== undefined ? `${lastWeightKg} (last)` : 'e.g. 82.5'}
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
        />
      </div>
      <div className="col-span-2 flex flex-col gap-1.5">
        <Label htmlFor="ql-notes">Notes (optional)</Label>
        <Input id="ql-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="col-span-2 border-t pt-3">
        <SymptomsChipPicker
          selected={symptomChips}
          notes={symptomNotes}
          onChangeSelected={setSymptomChips}
          onChangeNotes={setSymptomNotes}
        />
      </div>
      <Button className="col-span-2" onClick={save} disabled={busy || !dose}>
        <Plus className="size-4" /> {busy ? 'Saving…' : 'Log injection'}
      </Button>
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
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bp-sys">Systolic</Label>
        <Input id="bp-sys" inputMode="numeric" placeholder="120" value={sys} onChange={(e) => setSys(e.target.value)} autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bp-dia">Diastolic</Label>
        <Input id="bp-dia" inputMode="numeric" placeholder="80" value={dia} onChange={(e) => setDia(e.target.value)} />
      </div>
      <div className="col-span-2 flex flex-col gap-1.5">
        <Label htmlFor="bp-pulse">Pulse (bpm)</Label>
        <Input id="bp-pulse" inputMode="numeric" placeholder="65" value={pulse} onChange={(e) => setPulse(e.target.value)} />
      </div>
      <div className="col-span-2 border-t pt-3">
        <SymptomsChipPicker
          selected={symptomChips}
          notes={symptomNotes}
          onChangeSelected={setSymptomChips}
          onChangeNotes={setSymptomNotes}
        />
      </div>
      <Button className="col-span-2" onClick={save} disabled={busy || !sys || !dia}>
        <Plus className="size-4" /> {busy ? 'Saving…' : 'Save reading'}
      </Button>
    </div>
  )
}
