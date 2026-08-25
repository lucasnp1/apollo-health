// Full-page injection logger. One route per syringe (IM oils vs SubQ peptides),
// a primary compound container plus optional extras in the SAME syringe, a
// route-scoped quick site list (rested vs recently-used), and per-compound
// values that persist for next time. Peptides are reconstituted: powder mg +
// bac water mL give the concentration, and dosing shows units on the syringe.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Plus, TriangleAlert, X } from 'lucide-react'
import { db, type Compound, type InjectionLog, type Symptom, type Unit } from '../lib/db'
import { logInjection, pickActiveVial } from '../lib/injections'
import { parseConcentrationMgPerMl } from '../lib/vials'
import { NEGATIVE, POSITIVE, chipTone, type SymptomDef } from '../lib/symptoms'
import { IM_QUICK_SITES, SUBQ_QUICK_SITES, siteGroup, type QuickSite } from '../lib/sites'
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

// mg ⇄ units for one line, given its concentration. doseInUnit is in the
// compound's own unit (mg or mcg) so it can be stored + re-shown next time.
function derive(entryMode: 'dose' | 'units', amount: number, unit: Unit, conc?: number) {
  const out = {} as { mg?: number; ml?: number; units?: number; doseInUnit?: number }
  if (!Number.isFinite(amount) || amount <= 0) return out
  if (entryMode === 'units') {
    const ml = amount / SYRINGE_UNITS_PER_ML
    const mg = conc ? ml * conc : undefined
    const doseInUnit = mg === undefined ? undefined : unit === 'mcg' ? mg * 1000 : mg
    return { mg, ml, units: amount, doseInUnit }
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
  conc: string          // IM: direct mg/mL
  vialMg: string        // SubQ peptide: powder strength
  water: string         // SubQ peptide: bac water added (mL)
  entryMode: 'dose' | 'units'
  amount: string
}

let counter = 0
function blankLine(): Line {
  counter += 1
  return { key: `l${counter}`, compoundId: '', newName: '', conc: '', vialMg: '', water: '', entryMode: 'dose', amount: '' }
}

function lineFromCompound(c: Compound): Line {
  counter += 1
  const conc = c.concentrationMgPerMl ?? parseConcentrationMgPerMl(c.concentration)
  const dose = c.lastDose ?? c.defaultDose
  return {
    key: `l${counter}`,
    compoundId: c.id ?? '',
    newName: '',
    conc: conc !== undefined ? String(conc) : '',
    vialMg: c.vialMg !== undefined ? String(c.vialMg) : '',
    water: c.reconstituteMl !== undefined ? String(c.reconstituteMl) : '',
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
  const compounds = useMemo(() => {
    const seen = new Map<string, Compound>()
    for (const c of rawCompounds) {
      const k = c.name.trim().toLowerCase()
      if (!seen.has(k)) seen.set(k, c)
    }
    return [...seen.values()]
  }, [rawCompounds])
  const vials = useLiveQuery(() => db.vials.toArray(), [], [])

  // The last syringe you logged on a route = every compound sharing the most
  // recent takenAt for that route. Reopening prefills the WHOLE stack (with each
  // compound's saved concentration/dose), not just the primary compound.
  const syringeForRoute = useCallback((r: Route): Compound[] => {
    let batchAt: string | undefined
    for (const inj of injections) {
      if ((inj.route === 'SubQ' ? 'SubQ' : 'IM') !== r) continue
      batchAt = inj.takenAt
      break
    }
    if (batchAt) {
      const seen = new Set<number>()
      const out: Compound[] = []
      for (const inj of injections) {
        if (inj.takenAt !== batchAt) continue
        if ((inj.route === 'SubQ' ? 'SubQ' : 'IM') !== r) continue
        if (seen.has(inj.compoundId)) continue
        const c = compounds.find((x) => x.id === inj.compoundId)
        if (c) { seen.add(inj.compoundId); out.push(c) }
      }
      if (out.length) return out
    }
    const first = compounds.find((c) => c.defaultRoute === r)
    return first ? [first] : []
  }, [injections, compounds])

  // Initial route + stack: the overall freshest syringe, else the first compound.
  const initial = useMemo(() => {
    const freshest = injections[0]
    const r: Route = freshest ? (freshest.route === 'SubQ' ? 'SubQ' : 'IM') : (compounds[0]?.defaultRoute ?? 'IM')
    return { route: r, stack: syringeForRoute(r) }
  }, [injections, compounds, syringeForRoute])

  const [route, setRoute] = useState<Route>(() => initial.route)
  const [lines, setLines] = useState<Line[]>(() => (initial.stack.length ? initial.stack.map(lineFromCompound) : [blankLine()]))
  const [site, setSite] = useState('')
  const [notes, setNotes] = useState('')
  const [feel, setFeel] = useState<Partial<Symptom>>({})
  const [feelOpen, setFeelOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // Data loads async (liveQuery starts empty). Hydrate the form from the last
  // syringe once — the first time real data arrives — never clobbering edits.
  const hydrated = useRef(initial.stack.length > 0)
  useEffect(() => {
    if (hydrated.current || initial.stack.length === 0) return
    setRoute(initial.route)
    setLines(initial.stack.map(lineFromCompound))
    hydrated.current = true
  }, [initial])

  // Compounds shown for the current route — SubQ hides IM oils and vice versa.
  const routeCompounds = useMemo(
    () => compounds.filter((c) => c.defaultRoute === route || c.defaultRoute == null),
    [compounds, route],
  )

  // Switching route resets the syringe (can't mix) + the site list, prefilling
  // the last stack you used on that route.
  function changeRoute(r: Route) {
    if (r === route) return
    setRoute(r)
    const stack = syringeForRoute(r)
    setLines(stack.length ? stack.map(lineFromCompound) : [blankLine()])
    setSite('')
  }

  function update(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }
  function pickCompound(key: string, value: string) {
    if (value === NEW) { update(key, { compoundId: NEW, newName: '', conc: '', vialMg: '', water: '', amount: '' }); return }
    const c = compounds.find((x) => x.id === Number(value))
    if (c) { const s = lineFromCompound(c); update(key, { compoundId: c.id!, conc: s.conc, vialMg: s.vialMg, water: s.water, amount: s.amount, entryMode: 'dose' }) }
  }
  function addLine() { setLines((prev) => [...prev, blankLine()]) }
  function removeLine(key: string) { setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev)) }

  const isPeptide = route === 'SubQ'

  const resolved = lines.map((line) => {
    const existing = typeof line.compoundId === 'number' ? compounds.find((c) => c.id === line.compoundId) : undefined
    const unit = (existing?.unit ?? 'mg') as Unit
    // Peptide concentration comes from the reconstitution maths; oils direct.
    const vialMg = parseFloat(line.vialMg)
    const water = parseFloat(line.water)
    const conc = isPeptide
      ? (vialMg > 0 && water > 0 ? vialMg / water : undefined)
      : parseConcentrationMgPerMl(line.conc)
    const d = derive(line.entryMode, parseFloat(line.amount), unit, conc)
    const name = existing?.name ?? line.newName.trim()
    const isNew = line.compoundId === NEW
    const valid = Boolean((existing || (isNew && name)) && d.doseInUnit && d.doseInUnit > 0)
    return { line, existing, unit, conc, vialMg, water, d, name, isNew, valid }
  })

  const validLines = resolved.filter((r) => r.valid)
  const canSave = validLines.length > 0 && !busy

  async function save() {
    if (!canSave) return
    setBusy(true)
    try {
      const takenAt = new Date().toISOString()
      for (const r of validLines) {
        const recon = isPeptide && r.vialMg > 0 && r.water > 0 ? { vialMg: r.vialMg, reconstituteMl: r.water } : {}
        let compoundId: number
        if (r.existing) {
          compoundId = r.existing.id!
          await db.compounds.update(compoundId, {
            concentrationMgPerMl: r.conc,
            defaultRoute: route,
            lastDose: Number(r.d.doseInUnit!.toFixed(r.unit === 'mcg' ? 1 : 3)),
            ...recon,
          })
        } else {
          compoundId = (await db.compounds.add({
            name: r.name,
            category: isPeptide ? 'Peptide' : 'Other',
            defaultDose: Number(r.d.doseInUnit!.toFixed(3)),
            unit: 'mg',
            concentration: r.conc ? `${r.conc} mg/ml` : undefined,
            concentrationMgPerMl: r.conc,
            defaultRoute: route,
            lastDose: Number(r.d.doseInUnit!.toFixed(3)),
            schedule: 'As needed',
            color: COLORS[(compounds.length + validLines.indexOf(r)) % COLORS.length],
            ...recon,
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
      // Symptom check-in rides along with the injection (same moment).
      const anyFeel = [...POSITIVE, ...NEGATIVE].some((s) => typeof feel[s.key] === 'number')
      if (anyFeel || notes) {
        await db.symptoms.add({ recordedAt: takenAt, ...feel, notes: notes || undefined })
      }
      onBack()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 pb-28">
      <section className="flex flex-col gap-3">
        <h2 className="px-0.5 text-xs font-medium uppercase tracking-[0.02em] text-muted-foreground">Route</h2>
        <Segmented
          value={route}
          onChange={changeRoute}
          className="w-full"
          options={[{ value: 'IM', label: 'Intramuscular' }, { value: 'SubQ', label: 'Subcutaneous' }]}
        />
        <p className="px-0.5 text-xs text-muted-foreground">
          {isPeptide ? 'Subcutaneous — peptides. Reconstituted vials, drawn in units.' : 'Everything in this syringe is intramuscular.'}
        </p>
      </section>

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
              conc={r.conc}
              derived={r.d}
              compounds={routeCompounds}
              peptide={isPeptide}
              removable={resolved.length > 1}
              onPick={(v) => pickCompound(r.line.key, v)}
              onChange={(patch) => update(r.line.key, patch)}
              onRemove={() => removeLine(r.line.key)}
            />
          ))}
        </div>
        <Button variant="outline" className="self-start" onClick={addLine}>
          <Plus className="size-4" /> Add compound (same syringe)
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="px-0.5 text-xs font-medium uppercase tracking-[0.02em] text-muted-foreground">Site</h2>
        <SitePicker route={route} value={site} injections={injections} onChange={setSite} />
      </section>

      {/* How do you feel? — optional symptom check-in that rides with the shot */}
      <section className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setFeelOpen((o) => !o)}
          className="flex items-center gap-1.5 self-start px-0.5 text-xs font-medium uppercase tracking-[0.02em] text-muted-foreground"
          aria-expanded={feelOpen}
        >
          {feelOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          How do you feel? <span className="font-normal normal-case tracking-normal">— optional</span>
        </button>
        {feelOpen && (
          <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
            <p className="text-xs text-muted-foreground">Tap a number to rate — tap it again to clear. Anything you leave blank counts as fine.</p>
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Positive — higher is better</p>
              {POSITIVE.map((s) => (
                <SymptomScale key={s.key as string} def={s} value={feel[s.key] as number | undefined} onChange={(v) => setFeel((f) => ({ ...f, [s.key]: v }))} />
              ))}
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Side effects — higher is worse</p>
              {NEGATIVE.map((s) => (
                <SymptomScale key={s.key as string} def={s} value={feel[s.key] as number | undefined} onChange={(v) => setFeel((f) => ({ ...f, [s.key]: v }))} />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="px-0.5 text-xs font-medium uppercase tracking-[0.02em] text-muted-foreground">Notes</h2>
        <Input placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
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

function CompoundLine({
  index, line, existing, conc, derived, compounds, peptide, removable, onPick, onChange, onRemove,
}: {
  index: number
  line: Line
  existing?: Compound
  conc?: number
  derived: ReturnType<typeof derive>
  compounds: Compound[]
  peptide: boolean
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
          <option value={NEW}>＋ New {peptide ? 'peptide' : 'compound'}…</option>
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
          <Input id={`name-${line.key}`} autoFocus placeholder={peptide ? 'e.g. Retatrutide' : 'e.g. Testosterone E'} value={line.newName} onChange={(e) => onChange({ newName: e.target.value })} />
        </div>
      )}

      {(existing || isNew) && (
        <>
          {peptide ? (
            /* Reconstitution: powder + water → mg/mL */
            <div className="flex flex-col gap-2">
              <Label>Vial</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <Input inputMode="decimal" className="pr-9" placeholder="10" value={line.vialMg} onChange={(e) => onChange({ vialMg: e.target.value })} aria-label="Vial strength mg" />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">mg</span>
                </div>
                <div className="relative">
                  <Input inputMode="decimal" className="pr-9" placeholder="2" value={line.water} onChange={(e) => onChange({ water: e.target.value })} aria-label="Bac water mL" />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">mL</span>
                </div>
              </div>
              <p className="px-0.5 text-xs text-muted-foreground">
                Powder in the vial + bac water you add{conc !== undefined ? ` = ${conc.toFixed(conc < 10 ? 1 : 0)} mg/mL` : ''}.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`conc-${line.key}`}>Concentration <span className="font-normal text-muted-foreground">mg/mL</span></Label>
              <Input id={`conc-${line.key}`} inputMode="decimal" placeholder="e.g. 300" value={line.conc} onChange={(e) => onChange({ conc: e.target.value })} />
            </div>
          )}

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
                placeholder={peptide && line.entryMode === 'units' ? 'e.g. 20' : ''}
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
                    <span className="text-base font-semibold">{derived.mg.toFixed(derived.mg < 10 ? 2 : 0)} <small className="text-xs font-normal text-muted-foreground">mg</small></span>
                  )}
                  {derived.ml !== undefined && (
                    <span className={cn(line.entryMode === 'dose' && 'text-base font-semibold')}>{derived.ml.toFixed(2)} <small className="text-xs font-normal text-muted-foreground">mL</small></span>
                  )}
                  {line.entryMode === 'dose' && derived.units !== undefined && (
                    <span className="text-base font-semibold">{derived.units.toFixed(0)} <small className="text-xs font-normal text-muted-foreground">units</small></span>
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

// ── Symptom 1-5 scale (shared shape with the old Symptoms page) ─────────────
const SCALE_TONE: Record<'good' | 'warn' | 'bad' | 'neutral', string> = {
  good: 'border-emerald-500 bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  warn: 'border-amber-500 bg-amber-500/12 text-amber-700 dark:text-amber-400',
  bad: 'border-destructive bg-destructive/12 text-destructive',
  neutral: 'border-foreground bg-accent text-foreground',
}

function SymptomScale({ def, value, onChange }: { def: SymptomDef; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <div className="grid grid-cols-[minmax(120px,1.5fr)_auto] items-center gap-4 py-1.5 max-md:grid-cols-1 max-md:gap-1">
      <span className="text-sm">{def.label}</span>
      <div className="flex gap-1 max-md:w-full" role="radiogroup" aria-label={def.label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n
          const tone = selected ? chipTone(n, def.direction) : 'neutral'
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              className={cn(
                'size-8 rounded-md border text-[13px] tabular-nums transition-colors max-md:flex-1',
                selected ? `font-semibold ${SCALE_TONE[tone]}` : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              // Tap the selected value again to clear it — leaving it blank means "fine".
              onClick={() => onChange(selected ? undefined : n)}
            >
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const DAY = 86_400_000

function dayLabel(d: number): string {
  if (!Number.isFinite(d)) return 'Rested'
  if (d < 0.5) return 'today'
  if (d < 1.5) return 'yesterday'
  return `${Math.round(d)}d ago`
}

// Group score → traffic light. Under 4 days = avoid, 4–10 = caution, else good.
function statusOf(groupDays: number): 'good' | 'warn' | 'bad' {
  if (!Number.isFinite(groupDays)) return 'good'
  if (groupDays < 4) return 'bad'
  if (groupDays < 10) return 'warn'
  return 'good'
}

const DOT_CLASS = { good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-destructive' } as const
const LABEL_CLASS = {
  good: 'text-muted-foreground',
  warn: 'text-amber-700 dark:text-amber-400',
  bad: 'text-destructive',
} as const

function SitePicker({
  route, value, injections, onChange,
}: { route: Route; value: string; injections: InjectionLog[]; onChange: (s: string) => void }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const now = Date.now()
  const quick: QuickSite[] = route === 'SubQ' ? SUBQ_QUICK_SITES : IM_QUICK_SITES

  // Days since each exact site, and days since each adjacency group (min across
  // its sites). The group score colours the row, so a recent shot to one deltoid
  // head flags the whole deltoid on that side.
  const { daysBySite, daysByGroup } = useMemo(() => {
    const bySite = new Map<string, number>()
    const byGroup = new Map<string, number>()
    for (const inj of injections) {
      if (!inj.site) continue
      if ((inj.route === 'SubQ' ? 'SubQ' : 'IM') !== route) continue
      const d = (now - new Date(inj.takenAt).getTime()) / DAY
      const cur = bySite.get(inj.site)
      if (cur === undefined || d < cur) bySite.set(inj.site, d)
      const g = siteGroup(inj.site)
      if (g) { const gc = byGroup.get(g); if (gc === undefined || d < gc) byGroup.set(g, d) }
    }
    return { daysBySite: bySite, daysByGroup: byGroup }
  }, [injections, route, now])

  // Most rested first (never-used at the very top); most-recently-used sinks to
  // the bottom — "which muscle should I use right now", read top to bottom.
  const ordered = useMemo(() => {
    return [...quick].sort((a, b) => {
      const ga = daysByGroup.get(a.group) ?? Infinity
      const gb = daysByGroup.get(b.group) ?? Infinity
      if (ga !== gb) return gb - ga
      const ea = daysBySite.get(a.site) ?? Infinity
      const eb = daysBySite.get(b.site) ?? Infinity
      return eb - ea
    })
  }, [quick, daysByGroup, daysBySite])

  return (
    <div className="flex flex-col gap-2">
      <p className="px-0.5 text-xs text-muted-foreground">Most rested first. Amber and red were used recently — a whole area stays flagged even if you'd hit a different head.</p>
      <div className="flex flex-col gap-1.5">
        {ordered.map((q) => {
          const groupDays = daysByGroup.get(q.group) ?? Infinity
          const exactDays = daysBySite.get(q.site) ?? Infinity
          const status = statusOf(groupDays)
          const selected = value === q.site
          // A nearby head in the same area (not this exact spot) triggered the flag.
          const areaTriggered = Number.isFinite(groupDays) && (!Number.isFinite(exactDays) || exactDays > groupDays + 0.02)
          const labelText = !Number.isFinite(groupDays)
            ? 'Rested'
            : areaTriggered ? `Area used ${dayLabel(groupDays)}` : dayLabel(exactDays)
          return (
            <button
              key={q.site}
              type="button"
              onClick={() => onChange(q.site)}
              aria-pressed={selected}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors',
                selected ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border hover:bg-muted',
              )}
            >
              <span className={cn('size-2.5 shrink-0 rounded-full', DOT_CLASS[status])} />
              <span className="min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground">{q.muscle}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">{q.side === 'L' ? 'Left' : 'Right'}</span>
              </span>
              <span className={cn('shrink-0 text-xs', selected ? 'text-foreground' : LABEL_CLASS[status])}>{labelText}</span>
            </button>
          )
        })}
      </div>

      {value && !quick.some((q) => q.site === value) && (
        <p className="px-0.5 text-xs text-muted-foreground">Selected: <span className="font-medium text-foreground">{value}</span></p>
      )}

      {moreOpen ? (
        <SiteCombobox value={value} onChange={onChange} />
      ) : (
        <button type="button" onClick={() => setMoreOpen(true)} className="self-start px-0.5 text-xs text-muted-foreground underline-offset-2 hover:underline">
          Other site / custom…
        </button>
      )}
    </div>
  )
}
