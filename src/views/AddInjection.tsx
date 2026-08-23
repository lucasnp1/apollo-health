// Full-page injection logger. One route per syringe (IM oils vs SubQ peptides),
// a primary compound container plus optional extras in the SAME syringe, a
// route-scoped quick site list (rested vs recently-used), and per-compound
// values that persist for next time. Peptides are reconstituted: powder mg +
// bac water mL give the concentration, and dosing shows units on the syringe.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Plus, TriangleAlert, X } from 'lucide-react'
import { db, type Compound, type InjectionLog, type Symptom, type Unit } from '../lib/db'
import { logInjection, pickActiveVial } from '../lib/injections'
import { parseConcentrationMgPerMl } from '../lib/vials'
import { NEGATIVE, POSITIVE, chipTone, type SymptomDef } from '../lib/symptoms'
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

// Curated quick lists — the sites actually used often. Everything else stays
// reachable under "Other site / custom…".
const IM_QUICK = ['Deltoid L', 'Deltoid R', 'Vastus Lateralis L', 'Vastus Lateralis R', 'Pectoral L', 'Pectoral R', 'Lat L', 'Lat R']
const SUBQ_QUICK = ['Abdomen L', 'Abdomen R', 'Glute SubQ L', 'Glute SubQ R']

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

  // Freshest injected compound sets the initial route + prefill.
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
  const [feel, setFeel] = useState<Partial<Symptom>>({})
  const [feelOpen, setFeelOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (primary && lines.length === 1 && lines[0].compoundId === '' && lines[0].newName === '') {
      setRoute(primary.defaultRoute ?? 'IM')
      setLines([lineFromCompound(primary)])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary])

  // Compounds shown for the current route — SubQ hides IM oils and vice versa.
  const routeCompounds = useMemo(
    () => compounds.filter((c) => c.defaultRoute === route || c.defaultRoute == null),
    [compounds, route],
  )

  function freshestOfRoute(r: Route): Compound | undefined {
    for (const inj of injections) {
      const ir = inj.route === 'SubQ' ? 'SubQ' : 'IM'
      if (ir !== r) continue
      const c = compounds.find((x) => x.id === inj.compoundId)
      if (c) return c
    }
    return compounds.find((c) => c.defaultRoute === r)
  }

  // Switching route resets the syringe (can't mix) + the site list.
  function changeRoute(r: Route) {
    if (r === route) return
    setRoute(r)
    const fresh = freshestOfRoute(r)
    setLines([fresh ? lineFromCompound(fresh) : blankLine()])
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

function SymptomScale({ def, value, onChange }: { def: SymptomDef; value: number | undefined; onChange: (v: number) => void }) {
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
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SitePicker({
  route, value, injections, onChange,
}: { route: Route; value: string; injections: InjectionLog[]; onChange: (s: string) => void }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const now = Date.now()
  const quick = route === 'SubQ' ? SUBQ_QUICK : IM_QUICK

  const daysBySite = useMemo(() => {
    const map = new Map<string, number>()
    for (const inj of injections) {
      if (!inj.site) continue
      const r = inj.route === 'SubQ' ? 'SubQ' : 'IM'
      if (r !== route) continue
      const d = (now - new Date(inj.takenAt).getTime()) / 86_400_000
      const cur = map.get(inj.site)
      if (cur === undefined || d < cur) map.set(inj.site, d)
    }
    return map
  }, [injections, route, now])

  const fresh = quick.filter((s) => (daysBySite.get(s) ?? Infinity) >= 7)
  const recent = quick
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
          <p className="text-xs text-muted-foreground">All the usual sites were used in the last week — pick the least-recent, or a custom site.</p>
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

      {value && !quick.includes(value) && (
        <p className="text-xs text-muted-foreground">Selected: <span className="font-medium text-foreground">{value}</span></p>
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
