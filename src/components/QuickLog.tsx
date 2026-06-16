// Quick-log sheet — a full-screen takeover on mobile, centered card on desktop.
// Two tabs: Injection | Blood pressure. The injection form has an inline
// syringe calculator (mg ⇄ units), a rotation-aware site picker, and a
// collapsible "How do you feel?" section that also holds weight + notes.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Droplet, HeartPulse, Plus, Star, TriangleAlert } from 'lucide-react'
import { db, type Compound, type InjectionLog, type Symptom, type Unit } from '../lib/db'
import { logInjection, pickActiveVial } from '../lib/injections'
import { parseConcentrationMgPerMl } from '../lib/vials'
import { IM_SITES, SUBQ_SITES } from '../lib/sites'
import { useLiveQuery } from 'dexie-react-hooks'
import { SiteCombobox } from './SiteCombobox'
import type { QuickLogPrefill } from '../App'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

type Tab = 'injection' | 'bp'
type Route = 'IM' | 'SubQ' | 'Oral' | 'Other'

// ── Segmented control ───────────────────────────────────────────────────────
// Plain-button segmented toggle. Used instead of Radix Tabs for the small
// in-form switches: Tabs' focus management fights the Dialog dismiss layer and
// can collapse the sheet on toggle. Plain buttons just flip controlled state.

function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  className,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div className={cn('inline-flex rounded-lg bg-muted p-1', size === 'sm' && 'p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-md font-medium transition-colors',
            size === 'sm' ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-sm',
            value === o.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Symptom chip definitions ───────────────────────────────────────────────

type ChipDef = {
  label: string
  key: keyof Symptom
  positiveValue: number
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

function chipsToSymptom(selected: string[]): Partial<Symptom> {
  const out: Partial<Symptom> = {}
  for (const label of selected) {
    const def = CHIPS.find((c) => c.label === label)
    if (def) (out as Record<string, number>)[def.key as string] = def.positiveValue
  }
  return out
}

// ── Collapsible "How do you feel?" — chips + optional top slot + notes ──────

function FeelSection({
  selected,
  notes,
  topSlot,
  onChangeSelected,
  onChangeNotes,
}: {
  selected: string[]
  notes: string
  topSlot?: ReactNode
  onChangeSelected: (s: string[]) => void
  onChangeNotes: (n: string) => void
}) {
  const [open, setOpen] = useState(false)

  function toggle(label: string) {
    const def = CHIPS.find((c) => c.label === label)!
    const conflicting = CHIPS.filter((c) => c.key === def.key && c.label !== label).map((c) => c.label)
    const next = selected.includes(label)
      ? selected.filter((s) => s !== label)
      : [...selected.filter((s) => !conflicting.includes(s)), label]
    onChangeSelected(next)
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card/40 px-3.5 py-3">
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm font-medium transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        <span className="flex-1 text-left">
          How do you feel?
          {!open && selected.length > 0 && (
            <span className="ml-1.5 font-normal text-muted-foreground">{selected.join(' · ')}</span>
          )}
          {!open && selected.length === 0 && (
            <span className="ml-1.5 font-normal text-muted-foreground">weight · symptoms · notes</span>
          )}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 pt-1">
          {topSlot}
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

// ── Main QuickLog sheet ─────────────────────────────────────────────────────

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
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="sr-only">Quick log</SheetTitle>
          <Segmented
            value={tab}
            onChange={(v) => setTab(v)}
            className="w-full"
            options={[
              { value: 'injection' as Tab, label: <span className="flex items-center justify-center gap-1.5"><Droplet className="size-3.5" /> Injection</span> },
              { value: 'bp' as Tab, label: <span className="flex items-center justify-center gap-1.5"><HeartPulse className="size-3.5" /> Blood pressure</span> },
            ]}
          />
        </SheetHeader>

        {tab === 'injection'
          ? <InjectionForm compounds={compounds} prefill={prefill} onSaved={onClose} />
          : <BPForm onSaved={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

// ── Inline syringe calculator field ─────────────────────────────────────────

const SYRINGE_UNITS_PER_ML = 100 // standard U-100 insulin syringe

// Given everything known, derive the canonical dose in the compound's unit
// plus the mL / unit equivalents for the readout.
function computeDose(opts: {
  entryMode: 'dose' | 'units'
  amount: number
  unit: Unit
  concentration?: number // mg/mL
}): { doseInUnit?: number; mg?: number; ml?: number; units?: number } {
  const { entryMode, amount, unit, concentration } = opts
  if (!Number.isFinite(amount) || amount <= 0) return {}

  // Units mode: the user dialed a number on the syringe → back out mL/mg.
  if (entryMode === 'units') {
    const ml = amount / SYRINGE_UNITS_PER_ML
    const mg = concentration ? ml * concentration : undefined
    return { doseInUnit: mg, mg, ml, units: amount }
  }

  // Dose mode: the user typed the dose in the compound's own unit.
  const doseInUnit = amount
  const mg = unit === 'mg' ? amount : unit === 'mcg' ? amount / 1000 : undefined
  const ml = unit === 'ml' ? amount : (concentration && mg !== undefined ? mg / concentration : undefined)
  const units = ml !== undefined ? ml * SYRINGE_UNITS_PER_ML : undefined
  return { doseInUnit, mg, ml, units }
}

function DoseField({
  unit,
  concentration,
  concentrationSource,
  entryMode,
  amount,
  onChangeMode,
  onChangeAmount,
  onChangeConcentration,
  derived,
}: {
  unit: Unit
  concentration?: number
  concentrationSource?: string
  entryMode: 'dose' | 'units'
  amount: string
  onChangeMode: (m: 'dose' | 'units') => void
  onChangeAmount: (v: string) => void
  onChangeConcentration: (v: string) => void
  derived: ReturnType<typeof computeDose>
}) {
  const [concOpen, setConcOpen] = useState(false)
  const canUseUnits = unit === 'mg' || unit === 'mcg'
  const { mg, ml, units } = derived
  const overdraw = ml !== undefined && ml > 1

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="ql-amount">{entryMode === 'units' ? 'Draw on syringe' : `Dose (${unit})`}</Label>
        {canUseUnits && (
          <Segmented
            value={entryMode}
            onChange={onChangeMode}
            size="sm"
            options={[
              { value: 'dose', label: unit },
              { value: 'units', label: 'units' },
            ]}
          />
        )}
      </div>

      <div className="relative">
        <Input
          id="ql-amount"
          inputMode="decimal"
          autoFocus
          placeholder={entryMode === 'units' ? 'e.g. 40' : ''}
          value={amount}
          onChange={(e) => onChangeAmount(e.target.value)}
          className="pr-14 text-base"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          {entryMode === 'units' ? 'units' : unit}
        </span>
      </div>

      {/* Live conversion readout */}
      {amount && (mg !== undefined || ml !== undefined) && (
        <div className={cn(
          'flex flex-col gap-1.5 rounded-lg border-l-2 bg-muted/40 px-3 py-2.5 text-sm',
          overdraw ? 'border-l-destructive' : 'border-l-primary',
        )}>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono tabular-nums">
            {entryMode === 'units' && mg !== undefined && (
              <span className="text-base font-semibold">{mg.toFixed(mg < 10 ? 1 : 0)} <small className="text-xs font-normal text-muted-foreground">mg</small></span>
            )}
            {ml !== undefined && (
              <span className={cn(entryMode === 'dose' && 'text-base font-semibold')}>{ml.toFixed(2)} <small className="text-xs font-normal text-muted-foreground">mL</small></span>
            )}
            {entryMode === 'dose' && units !== undefined && (
              <span>{units.toFixed(0)} <small className="text-xs font-normal text-muted-foreground">units (U-100)</small></span>
            )}
          </div>
          {overdraw && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
              <TriangleAlert className="size-3.5 shrink-0" /> Over 1 mL — split across two draws or use a bigger barrel.
            </p>
          )}
        </div>
      )}

      {/* Concentration source / override */}
      {(unit === 'mg' || unit === 'mcg') && (
        concentration && !concOpen ? (
          <button type="button" onClick={() => setConcOpen(true)} className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline">
            Using {concentration} mg/mL{concentrationSource ? ` · ${concentrationSource}` : ''} — change
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <Label htmlFor="ql-conc" className="shrink-0 text-xs text-muted-foreground">Concentration</Label>
            <Input
              id="ql-conc"
              inputMode="decimal"
              placeholder="mg/mL (e.g. 250)"
              defaultValue={concentration ?? ''}
              onChange={(e) => onChangeConcentration(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        )
      )}
    </div>
  )
}

// ── Rotation-aware site picker ──────────────────────────────────────────────

type SiteStat = { site: string; lastMs: number; daysAgo: number; lastCompoundId?: number }

// Recency tinting:
//   selected         → primary ring
//   < 7 days         → red (you injected here recently — avoid)
//   ≥ 7 days unused  → neutral / fresh (safe to use)
function recencyChip(daysAgo: number, selected: boolean): string {
  if (selected) return 'border-primary bg-primary/15 text-foreground ring-1 ring-primary'
  if (daysAgo < 7) return 'border-destructive/50 bg-destructive/10 text-destructive'
  return 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
}

function daysLabel(daysAgo: number): string {
  if (!Number.isFinite(daysAgo)) return 'unused'
  if (daysAgo < 0.5) return 'today'
  if (daysAgo < 1.5) return '1d'
  return `${Math.round(daysAgo)}d`
}

function SitePicker({
  route,
  value,
  injections,
  compounds,
  onChange,
}: {
  route: Route
  value: string
  injections: InjectionLog[]
  compounds: Compound[]
  onChange: (site: string) => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const now = Date.now()

  const groupSites = useMemo(
    () => (route === 'SubQ' ? SUBQ_SITES : IM_SITES).flatMap((g) => g.sites),
    [route],
  )
  const compoundName = (id?: number) => compounds.find((c) => c.id === id)?.name

  // Per-site recency across all compounds.
  const stats = useMemo<SiteStat[]>(() => {
    const map = new Map<string, SiteStat>()
    for (const inj of injections) {
      if (!inj.site) continue
      const t = new Date(inj.takenAt).getTime()
      const cur = map.get(inj.site)
      if (!cur || t > cur.lastMs) {
        map.set(inj.site, { site: inj.site, lastMs: t, daysAgo: (now - t) / 86_400_000, lastCompoundId: inj.compoundId })
      }
    }
    return [...map.values()]
  }, [injections, now])

  // Most recent injection overall (any site) — "what you last did".
  const lastOverall = useMemo(
    () => stats.slice().sort((a, b) => b.lastMs - a.lastMs)[0],
    [stats],
  )

  // Default chips = only sites that have been used (sorted by least-recent first
  // so the safest options surface at the top). Unused sites live behind 'More'.
  const usedRanked = useMemo(
    () => stats.slice().sort((a, b) => b.daysAgo - a.daysAgo),
    [stats],
  )

  // Recommendation logic:
  //   - If there's any used site with ≥ 7 days of rest, star the freshest one.
  //   - Otherwise nothing gets a star (everything is "recently used" / red).
  const recommended = useMemo(() => {
    const fresh = usedRanked.find((s) => s.daysAgo >= 7)
    return fresh?.site
  }, [usedRanked])

  // Recent custom sites (logged but not in the standard group list).
  const recentCustom = useMemo(
    () => stats
      .filter((s) => !groupSites.includes(s.site))
      .sort((a, b) => b.lastMs - a.lastMs)
      .slice(0, 6),
    [stats, groupSites],
  )

  // Unused group sites — kept hidden by default, revealed by 'More sites'.
  const unusedGroupSites = useMemo(
    () => groupSites.filter((site) => !stats.some((s) => s.site === site)),
    [groupSites, stats],
  )

  const recentSites = useMemo(
    () => stats.slice().sort((a, b) => b.lastMs - a.lastMs).map((s) => s.site).slice(0, 8),
    [stats],
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label>Site</Label>
        {lastOverall && (
          <span className="truncate text-xs text-muted-foreground">
            Last: <span className="font-medium text-foreground">{lastOverall.site}</span>
            {compoundName(lastOverall.lastCompoundId) ? ` · ${compoundName(lastOverall.lastCompoundId)}` : ''} · {daysLabel(lastOverall.daysAgo)}
          </span>
        )}
      </div>

      {usedRanked.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {usedRanked.map(({ site, daysAgo }) => {
            const selected = value === site
            const isRec = site === recommended
            return (
              <button
                key={site}
                type="button"
                onClick={() => onChange(site)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  recencyChip(daysAgo, selected),
                )}
              >
                {isRec && !selected && <Star className="size-3 fill-current text-primary" />}
                {site}
                <small className="text-[10px] font-normal opacity-70">{daysLabel(daysAgo)}</small>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No sites used yet — pick one from <em>More sites</em>.</p>
      )}

      {recommended && value !== recommended && (
        <button
          type="button"
          onClick={() => onChange(recommended)}
          className="flex items-center gap-1.5 self-start text-xs text-primary hover:underline"
        >
          <Star className="size-3 fill-current" /> Use {recommended} (freshest for rotation)
        </button>
      )}

      {/* Hidden unused sites + custom */}
      {moreOpen ? (
        <div className="flex flex-col gap-2 pt-1">
          {unusedGroupSites.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {unusedGroupSites.map((site) => (
                <button
                  key={site}
                  type="button"
                  onClick={() => onChange(site)}
                  className={cn(
                    'rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors',
                    value === site
                      ? 'border-primary bg-primary/15 text-foreground ring-1 ring-primary'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {site}
                </button>
              ))}
            </div>
          )}
          <SiteCombobox value={value} onChange={onChange} recentSites={[...recentSites, ...recentCustom.map((s) => s.site)]} />
        </div>
      ) : (
        <button type="button" onClick={() => setMoreOpen(true)} className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline">
          More sites / custom…
        </button>
      )}
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
  const injections = useLiveQuery(() => db.injections.orderBy('takenAt').reverse().limit(80).toArray(), [], [])

  const lastWeightKg = useMemo(() => {
    for (const inj of injections ?? []) {
      if (inj.weightKg !== undefined) return inj.weightKg
    }
    return undefined
  }, [injections])

  const [compoundId, setCompoundId] = useState<number | ''>(prefill?.compoundId ?? compounds[0]?.id ?? '')
  const [entryMode, setEntryMode] = useState<'dose' | 'units'>('dose')
  const [amount, setAmount] = useState(prefill?.dose !== undefined ? String(prefill.dose) : '')
  const [concOverride, setConcOverride] = useState('')
  const [route, setRoute] = useState<Route>('IM')
  const [showMoreRoutes, setShowMoreRoutes] = useState(false)
  const [site, setSite] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [notes, setNotes] = useState('')
  const [symptomChips, setSymptomChips] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const compound = compounds.find((c) => c.id === compoundId)
  const unit = (compound?.unit ?? 'mg') as Unit
  const activeVial = vials && compound ? pickActiveVial(vials, compound.id!) : undefined

  // Concentration priority: manual override → active vial → compound text.
  const concentration =
    parseConcentrationMgPerMl(concOverride) ??
    activeVial?.concentrationMgPerMl ??
    parseConcentrationMgPerMl(compound?.concentration)
  const concentrationSource = concOverride
    ? undefined
    : activeVial?.concentrationMgPerMl
      ? (activeVial.label || 'vial')
      : compound?.concentration
        ? 'from compound'
        : undefined

  const derived = computeDose({ entryMode, amount: parseFloat(amount), unit, concentration })

  useEffect(() => {
    if (prefill?.compoundId !== undefined) setCompoundId(prefill.compoundId)
    else if (compounds[0]?.id) setCompoundId(compounds[0].id)
    setEntryMode('dose')
    setAmount(prefill?.dose !== undefined ? String(prefill.dose) : '')
    setConcOverride('')
    setNotes('')
    setWeightKg('')
    setSymptomChips([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.compoundId, prefill?.dose, prefill?.scheduledAt])

  useEffect(() => {
    if (compounds.length > 0 && compoundId === '') setCompoundId(compounds[0].id ?? '')
  }, [compounds, compoundId])

  // Switching to units mode requires a known concentration to be meaningful.
  const injectable = route === 'IM' || route === 'SubQ'
  const doseValue = derived.doseInUnit
  const canSave = Boolean(compound) && doseValue !== undefined && doseValue > 0 && !busy

  async function save() {
    if (!compound || doseValue === undefined || doseValue <= 0) return
    setBusy(true)
    try {
      const activeVialId = activeVial?.id
      const link = prefill?.protocolId && prefill.scheduledAt
        ? { protocolId: prefill.protocolId, scheduledAt: prefill.scheduledAt }
        : undefined
      await logInjection(
        {
          compoundId: compound.id!,
          takenAt: new Date().toISOString(),
          dose: Number(doseValue.toFixed(unit === 'mcg' ? 1 : 3)),
          unit,
          route,
          site: injectable ? (site || undefined) : undefined,
          notes: notes || undefined,
          vialId: activeVialId,
          weightKg: weightKg ? Number(weightKg) : undefined,
        },
        link ? { link } : undefined,
      )
      if (symptomChips.length > 0 || notes) {
        await db.symptoms.add({
          recordedAt: new Date().toISOString(),
          ...chipsToSymptom(symptomChips),
          notes: notes || undefined,
        })
      }
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  if (compounds.length === 0) {
    return (
      <SheetBody>
        <p className="text-sm text-muted-foreground">Add a compound first in the Protocols page.</p>
      </SheetBody>
    )
  }

  return (
    <>
      <SheetBody>
        <div className="flex flex-col gap-4">
          {/* Compound — native select avoids the Radix popover overlap inside a sheet */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ql-compound">Compound</Label>
            <select
              id="ql-compound"
              value={String(compoundId)}
              onChange={(e) => setCompoundId(Number(e.target.value))}
              className="h-10 w-full appearance-none rounded-md border border-input bg-transparent bg-[length:1em_1em] bg-[right_0.75rem_center] bg-no-repeat pr-8 pl-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              style={{ backgroundImage: "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e\")" }}
            >
              {compounds.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
          </div>

          {/* Dose + syringe calculator */}
          <DoseField
            unit={unit}
            concentration={concentration}
            concentrationSource={concentrationSource}
            entryMode={entryMode}
            amount={amount}
            onChangeMode={setEntryMode}
            onChangeAmount={setAmount}
            onChangeConcentration={setConcOverride}
            derived={derived}
          />

          {/* Route — IM / SubQ prominent; Oral/Other tucked away */}
          <div className="flex flex-col gap-1.5">
            <Label>Route</Label>
            <Segmented
              value={injectable ? route : 'IM'}
              onChange={(v) => setRoute(v)}
              className="w-full"
              options={[
                { value: 'IM' as Route, label: 'IM' },
                { value: 'SubQ' as Route, label: 'SubQ' },
              ]}
            />
            {showMoreRoutes || !injectable ? (
              <Segmented
                value={route === 'Oral' || route === 'Other' ? route : 'Oral'}
                onChange={(v) => setRoute(v)}
                size="sm"
                className="w-full"
                options={[
                  { value: 'Oral' as Route, label: 'Oral' },
                  { value: 'Other' as Route, label: 'Other' },
                ]}
              />
            ) : (
              <button type="button" onClick={() => setShowMoreRoutes(true)} className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline">
                Oral / other…
              </button>
            )}
          </div>

          {/* Site — only for injections */}
          {injectable && (
            <SitePicker
              route={route}
              value={site}
              injections={injections ?? []}
              compounds={compounds}
              onChange={setSite}
            />
          )}

          {/* Weight + symptoms + notes */}
          <FeelSection
            selected={symptomChips}
            notes={notes}
            onChangeSelected={setSymptomChips}
            onChangeNotes={setNotes}
            topSlot={
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ql-weight" className="text-xs text-muted-foreground">Weight (kg)</Label>
                <Input
                  id="ql-weight"
                  inputMode="decimal"
                  placeholder={lastWeightKg !== undefined ? `${lastWeightKg} (last)` : 'e.g. 82.5'}
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="h-9"
                />
              </div>
            }
          />
        </div>
      </SheetBody>

      <SheetFooter>
        <Button size="lg" onClick={save} disabled={!canSave}>
          <Plus className="size-4" /> {busy ? 'Saving…' : 'Log injection'}
        </Button>
      </SheetFooter>
    </>
  )
}

// ── Blood Pressure ─────────────────────────────────────────────────────────

function BPForm({ onSaved }: { onSaved: () => void }) {
  const [sys, setSys] = useState('')
  const [dia, setDia] = useState('')
  const [pulse, setPulse] = useState('')
  const [symptomChips, setSymptomChips] = useState<string[]>([])
  const [notes, setNotes] = useState('')
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
        notes: notes || undefined,
      })
      if (symptomChips.length > 0 || notes) {
        await db.symptoms.add({
          recordedAt: new Date().toISOString(),
          ...chipsToSymptom(symptomChips),
          notes: notes || undefined,
        })
      }
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SheetBody>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bp-sys">Systolic</Label>
              <Input id="bp-sys" inputMode="numeric" placeholder="120" value={sys} onChange={(e) => setSys(e.target.value)} autoFocus className="text-base" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bp-dia">Diastolic</Label>
              <Input id="bp-dia" inputMode="numeric" placeholder="80" value={dia} onChange={(e) => setDia(e.target.value)} className="text-base" />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="bp-pulse">Pulse (bpm)</Label>
              <Input id="bp-pulse" inputMode="numeric" placeholder="65" value={pulse} onChange={(e) => setPulse(e.target.value)} />
            </div>
          </div>
          <FeelSection
            selected={symptomChips}
            notes={notes}
            onChangeSelected={setSymptomChips}
            onChangeNotes={setNotes}
          />
        </div>
      </SheetBody>

      <SheetFooter>
        <Button size="lg" onClick={save} disabled={busy || !sys || !dia}>
          <Plus className="size-4" /> {busy ? 'Saving…' : 'Save reading'}
        </Button>
      </SheetFooter>
    </>
  )
}
