// Full-page injection logger. Redesigned for room to breathe (Apple-forms
// style): one route per syringe, a primary compound container plus optional
// extra compounds in the SAME syringe, a route-scoped site picker that makes
// fresh vs recently-used obvious, and per-compound values that persist for
// next time (mg/mL, dose, route live on the compound now that protocols are gone).

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Plus, TriangleAlert, X } from 'lucide-react'
import { db, type Compound, type InjectionLog, type Unit } from '../lib/db'
import { logInjection, pickActiveVial } from '../lib/injections'
import { parseConcentrationMgPerMl } from '../lib/vials'
import { IM_SITES, SUBQ_SITES } from '../lib/sites'
import { useLiveQuery } from 'dexie-react-hooks'
import { SiteCombobox } from '../components/SiteCombobox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type Route = 'IM' | 'SubQ'
const SYRINGE_UNITS_PER_ML = 100
const NEW = '__new__'

const COLORS = ['#f4c95c', '#2566c4', '#2f8b54', '#c43c2f', '#7c5cff', '#d98324', '#3aa5a0']

// ── tiny segmented control ──────────────────────────────────────────────────
function Segmented<T extends string>({
  value, options, onChange, className,
}: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-lg bg-muted p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            value === o.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// mg ⇄ units for one line, given its concentration.
function derive(entryMode: 'dose' | 'units', amount: number, unit: Unit, conc?: number) {
  if (!Number.isFinite(amount) || amount <= 0) return {} as { mg?: number; ml?: number; units?: number; doseInUnit?: number }
  if (entryMode === 'units') {
    const ml = amount / SYRINGE_UNITS_PER_ML
    const mg = conc ? ml * conc : undefined
    return { mg, ml, units: amount, doseInUnit: mg }
  }
  const mg = unit === 'mg' ? amount : unit === 'mcg' ? amount / 1000 : undefined
  const ml = conc && mg !== undefined ? mg / conc : undefined
  const units = ml !== undefined ? ml * SYRINGE_UNITS_PER_ML : undefined
  return { mg, ml, units, doseInUnit: amount }
}

type Line = {
  key: string
  compoundId: number | typeof NEW | ''
  newName: string
  conc: string          // mg/mL
  entryMode: 'dose' | 'units'
  amount: string        // dose in the compound's unit, or units on the syringe
}

let counter = 0
function blankLine(): Line {
  counter += 1
  return { key: `l${counter}`, compoundId: '', newName: '', conc: '', entryMode: 'dose', amount: '' }
}

// Prefill a line from a saved compound (mg/mL, last dose).
function lineFromCompound(c: Compound): Line {
  counter += 1
  const conc = c.concentrationMgPerMl ?? parseConcentrationMgPerMl(c.concentration)
  const dose = c.lastDose ?? c.defaultDose
  return {
    key: `l${counter}`,
    compoundId: c.id ?? '',
    newName: '',
    conc: conc !== undefined ? String(conc) : '',
    entryMode: 'dose',
    amount: dose ? String(dose) : '',
  }
}

export function AddInjection({
  compounds: rawCompounds,
  injections,
  onBack,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  onBack: () => void
}) {
  // Dedupe compounds by name (sync can leave duplicates).
  const compounds = useMemo(() => {
    const seen = new Map<string, Compound>()
    for (const c of rawCompounds) {
      const k = c.name.trim().toLowerCase()
      if (!seen.has(k)) seen.set(k, c)
    }
    return [...seen.values()]
  }, [rawCompounds])
  const vials = useLiveQuery(() => db.vials.toArray(), [], [])

  // Primary compound = the most-recently injected one, prefilled with its saved
  // values. Route defaults to that compound's usual route.
  const primary = useMemo(() => {
    for (const inj of injections) {
      const c = compounds.find((x) => x.id === inj.compoundId)
      if (c) return c
    }
    return compounds[0]
  }, [compounds, injections])

  const [route, setRoute] = useState<Route>(primary?.defaultRoute ?? 'IM')
  const [lines, setLines] = useState<Line[]>(() => [primary ? lineFromCompound(primary) : blankLine()])
  const [site, setSite] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  // Once compounds finish loading, seed the primary line if it was blank.
  useEffect(() => {
    if (primary && lines.length === 1 && lines[0].compoundId === '' && lines[0].newName === '') {
      setRoute(primary.defaultRoute ?? 'IM')
      setLines([lineFromCompound(primary)])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary])

  function update(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }
  function pickCompound(key: string, value: string) {
    if (value === NEW) { update(key, { compoundId: NEW, newName: '', conc: '', amount: '' }); return }
    const c = compounds.find((x) => x.id === Number(value))
    if (c) { const seeded = lineFromCompound(c); update(key, { compoundId: c.id!, conc: seeded.conc, amount: seeded.amount, entryMode: 'dose' }) }
  }
  function addLine() { setLines((prev) => [...prev, blankLine()]) }
  function removeLine(key: string) { setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev)) }

  // Resolve each line → compound + concentration + mg dose.
  const resolved = lines.map((line) => {
    const existing = typeof line.compoundId === 'number' ? compounds.find((c) => c.id === line.compoundId) : undefined
    const unit = (existing?.unit ?? 'mg') as Unit
    const conc = parseConcentrationMgPerMl(line.conc)
    const d = derive(line.entryMode, parseFloat(line.amount), unit, conc)
    const name = existing?.name ?? line.newName.trim()
    const isNew = line.compoundId === NEW
    const valid = Boolean((existing || (isNew && name)) && d.doseInUnit && d.doseInUnit > 0)
    return { line, existing, unit, conc, d, name, isNew, valid }
  })

  const validLines = resolved.filter((r) => r.valid)
  const canAdd = compounds.length > 0 // can always add a new line
  const canSave = validLines.length > 0 && !busy

  async function save() {
    if (!canSave) return
    setBusy(true)
    try {
      const takenAt = new Date().toISOString()
      for (const r of validLines) {
        let compoundId: number
        if (r.existing) {
          compoundId = r.existing.id!
          await db.compounds.update(compoundId, {
            concentrationMgPerMl: r.conc,
            defaultRoute: route,
            lastDose: Number(r.d.doseInUnit!.toFixed(3)),
          })
        } else {
          compoundId = (await db.compounds.add({
            name: r.name,
            category: 'Other',
            defaultDose: Number(r.d.doseInUnit!.toFixed(3)),
            unit: 'mg',
            concentration: r.conc ? `${r.conc} mg/ml` : undefined,
            concentrationMgPerMl: r.conc,
            defaultRoute: route,
            lastDose: Number(r.d.doseInUnit!.toFixed(3)),
            schedule: 'As needed',
            color: COLORS[(compounds.length + validLines.indexOf(r)) % COLORS.length],
          })) as number
        }
        const activeVial = vials ? pickActiveVial(vials, compoundId) : undefined
        await logInjection({
          compoundId,
          takenAt,
          dose: Number(r.d.doseInUnit!.toFixed(r.unit === 'mcg' ? 1 : 3)),
          unit: r.unit,
          route,
          site: site || undefined,
          notes: notes || undefined,
          vialId: activeVial?.id,
        })
      }
      onBack()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 pb-28">
      {/* Route — one per syringe */}
      <section className="flex flex-col gap-3">
        <h2 className="px-0.5 text-xs font-medium uppercase tracking-[0.02em] text-muted-foreground">Route</h2>
        <Segmented
          value={route}
          onChange={setRoute}
          className="w-full"
          options={[{ value: 'IM', label: 'Intramuscular' }, { value: 'SubQ', label: 'Subcutaneous' }]}
        />
        <p className="px-0.5 text-xs text-muted-foreground">Everything in this syringe is {route === 'IM' ? 'intramuscular' : 'subcutaneous'}.</p>
      </section>

      {/* Compounds */}
      <section className="flex flex-col gap-3">
        <h2 className="px-0.5 text-xs font-medium uppercase tracking-[0.02em] text-muted-foreground">
          {resolved.length > 1 ? 'Compounds (one syringe)' : 'Compound'}
        </h2>
        <div className="flex flex-col gap-4">
          {resolved.map((r, i) => (
            <CompoundLine
              key={r.line.key}
              index={i}
              line={r.line}
              existing={r.existing}
              derived={r.d}
              compounds={compounds}
              removable={resolved.length > 1}
              onPick={(v) => pickCompound(r.line.key, v)}
              onChange={(patch) => update(r.line.key, patch)}
              onRemove={() => removeLine(r.line.key)}
            />
          ))}
        </div>
        {canAdd && (
          <Button variant="outline" className="self-start" onClick={addLine}>
            <Plus className="size-4" /> Add compound (same syringe)
          </Button>
        )}
      </section>

      {/* Site */}
      <section className="flex flex-col gap-3">
        <h2 className="px-0.5 text-xs font-medium uppercase tracking-[0.02em] text-muted-foreground">Site</h2>
        <SitePicker route={route} value={site} injections={injections} onChange={setSite} />
      </section>

      {/* Notes */}
      <section className="flex flex-col gap-3">
        <h2 className="px-0.5 text-xs font-medium uppercase tracking-[0.02em] text-muted-foreground">Notes</h2>
        <Input placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </section>

      {/* Save — sticky at the bottom of the page */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:pl-[264px]">
        <div className="mx-auto flex max-w-xl gap-2">
          <Button variant="outline" onClick={onBack} className="shrink-0">Cancel</Button>
          <Button size="lg" className="flex-1" onClick={save} disabled={!canSave}>
            {busy ? 'Saving…' : validLines.length > 1 ? `Log ${validLines.length} compounds` : 'Log injection'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── One compound line: picker + mg/mL + dose calculator ─────────────────────
function CompoundLine({
  index, line, existing, derived, compounds, removable, onPick, onChange, onRemove,
}: {
  index: number
  line: Line
  existing?: Compound
  derived: ReturnType<typeof derive>
  compounds: Compound[]
  removable: boolean
  onPick: (v: string) => void
  onChange: (patch: Partial<Line>) => void
  onRemove: () => void
}) {
  const unit = (existing?.unit ?? 'mg') as Unit
  const canUnits = unit === 'mg' || unit === 'mcg'
  const overdraw = derived.ml !== undefined && derived.ml > 1
  const isNew = line.compoundId === NEW

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <select
          aria-label="Compound"
          value={line.compoundId === '' ? '' : String(line.compoundId)}
          onChange={(e) => onPick(e.target.value)}
          className="h-10 w-full appearance-none rounded-md border border-input bg-transparent bg-[length:1em_1em] bg-[right_0.75rem_center] bg-no-repeat pr-8 pl-3 text-sm font-medium shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          style={{ backgroundImage: "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e\")" }}
        >
          <option value="" disabled>{index === 0 ? 'Choose compound…' : 'Add compound…'}</option>
          {compounds.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          <option value={NEW}>＋ New compound…</option>
        </select>
        {removable && (
          <Button variant="ghost" size="icon" className="size-9 shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remove compound" onClick={onRemove}>
            <X className="size-4" />
          </Button>
        )}
      </div>

      {isNew && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`name-${line.key}`}>Name</Label>
          <Input id={`name-${line.key}`} autoFocus placeholder="e.g. Testosterone E" value={line.newName} onChange={(e) => onChange({ newName: e.target.value })} />
        </div>
      )}

      {(existing || isNew) && (
        <>
          {/* Concentration — saved per compound */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`conc-${line.key}`}>Concentration <span className="font-normal text-muted-foreground">mg/mL</span></Label>
            <Input
              id={`conc-${line.key}`}
              inputMode="decimal"
              placeholder="e.g. 300"
              value={line.conc}
              onChange={(e) => onChange({ conc: e.target.value })}
            />
          </div>

          {/* Dose */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`amt-${line.key}`}>{line.entryMode === 'units' ? 'Draw on syringe' : `Dose (${unit})`}</Label>
              {canUnits && (
                <Segmented
                  value={line.entryMode}
                  onChange={(m) => onChange({ entryMode: m })}
                  options={[{ value: 'dose', label: unit }, { value: 'units', label: 'units' }]}
                />
              )}
            </div>
            <div className="relative">
              <Input
                id={`amt-${line.key}`}
                inputMode="decimal"
                className="pr-14 text-base"
                value={line.amount}
                onChange={(e) => onChange({ amount: e.target.value })}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                {line.entryMode === 'units' ? 'units' : unit}
              </span>
            </div>
            {line.amount && (derived.mg !== undefined || derived.ml !== undefined) && (
              <div className={cn('flex flex-col gap-1 rounded-lg border-l bg-muted/40 px-3 py-2.5 text-sm', overdraw ? 'border-l-destructive' : 'border-l-primary')}>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 tabular-nums">
                  {line.entryMode === 'units' && derived.mg !== undefined && (
                    <span className="text-base font-semibold">{derived.mg.toFixed(derived.mg < 10 ? 1 : 0)} <small className="text-xs font-normal text-muted-foreground">mg</small></span>
                  )}
                  {derived.ml !== undefined && (
                    <span className={cn(line.entryMode === 'dose' && 'text-base font-semibold')}>{derived.ml.toFixed(2)} <small className="text-xs font-normal text-muted-foreground">mL</small></span>
                  )}
                  {line.entryMode === 'dose' && derived.units !== undefined && (
                    <span>{derived.units.toFixed(0)} <small className="text-xs font-normal text-muted-foreground">units</small></span>
                  )}
                </div>
                {overdraw && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <TriangleAlert className="size-3.5 shrink-0" /> Over 1 mL — split or use a bigger barrel.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Route-scoped site picker — fresh vs recently used made obvious ──────────
function SitePicker({
  route, value, injections, onChange,
}: { route: Route; value: string; injections: InjectionLog[]; onChange: (s: string) => void }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const now = Date.now()
  const groupSites = useMemo(() => (route === 'SubQ' ? SUBQ_SITES : IM_SITES).flatMap((g) => g.sites), [route])

  // Days since last use per site, scoped to this route.
  const daysBySite = useMemo(() => {
    const map = new Map<string, number>()
    for (const inj of injections) {
      if (!inj.site) continue
      const r = inj.route === 'SubQ' ? 'SubQ' : 'IM'
      if (r !== route) continue
      const t = new Date(inj.takenAt).getTime()
      const cur = map.get(inj.site)
      const d = (now - t) / 86_400_000
      if (cur === undefined || d < cur) map.set(inj.site, d)
    }
    return map
  }, [injections, route, now])

  const fresh = groupSites.filter((s) => (daysBySite.get(s) ?? Infinity) >= 7)
  const recent = groupSites
    .filter((s) => (daysBySite.get(s) ?? Infinity) < 7)
    .sort((a, b) => (daysBySite.get(a) ?? 0) - (daysBySite.get(b) ?? 0))

  function label(s: string) {
    const d = daysBySite.get(s)
    if (d === undefined || !Number.isFinite(d)) return null
    if (d < 0.5) return 'today'
    if (d < 1.5) return '1d'
    return `${Math.round(d)}d`
  }

  function Chip({ s, tone }: { s: string; tone: 'fresh' | 'recent' }) {
    const selected = value === s
    return (
      <button
        type="button"
        onClick={() => onChange(s)}
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
          selected
            ? 'border-primary bg-primary/15 text-foreground ring-1 ring-primary'
            : tone === 'recent'
              ? 'border-destructive/40 bg-destructive/8 text-destructive'
              : 'border-border hover:bg-muted',
        )}
      >
        {s}
        {label(s) && <small className="text-[10px] font-normal opacity-70">{label(s)}</small>}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500" /> Good to use — rested
        </p>
        {fresh.length > 0 ? (
          <div className="flex flex-wrap gap-2">{fresh.map((s) => <Chip key={s} s={s} tone="fresh" />)}</div>
        ) : (
          <p className="text-xs text-muted-foreground">No fully-rested sites — everything's been used in the last week.</p>
        )}
      </div>

      {recent.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive">
            <span className="size-1.5 rounded-full bg-destructive" /> Used recently — avoid
          </p>
          <div className="flex flex-wrap gap-2">{recent.map((s) => <Chip key={s} s={s} tone="recent" />)}</div>
        </div>
      )}

      {moreOpen ? (
        <SiteCombobox value={value} onChange={onChange} />
      ) : (
        <button type="button" onClick={() => setMoreOpen(true)} className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline">
          Other site / custom…
        </button>
      )}
    </div>
  )
}
