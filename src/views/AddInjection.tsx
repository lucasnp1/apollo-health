// Full-page injection logger. One route per syringe (IM oils vs SubQ peptides),
// a primary compound container plus optional extras in the SAME syringe, a
// route-scoped quick site list (rested vs recently-used), and per-compound
// values that persist for next time. Peptides are reconstituted: powder mg +
// bac water mL give the concentration, and dosing shows units on the syringe.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, TriangleAlert, X } from 'lucide-react'
import { db, type Compound, type InjectionLog, type Symptom, type Unit } from '../lib/db'
import { logInjection, pickActiveVial } from '../lib/injections'
import { compoundGroups, findCompoundByName } from '../lib/compounds'
import { parseConcentrationMgPerMl } from '../lib/vials'
import { convertAmount, derive, type EntryMode } from '../lib/dose'
import { NEGATIVE, POSITIVE, ratingOf, withRating } from '../lib/symptoms'
import { SymptomScale } from '../components/SymptomScale'
import { IM_QUICK_SITES, SUBQ_QUICK_SITES, quickSiteFromUsed, siteGroup, type QuickSite } from '../lib/sites'
import { useKeyboardInset } from '../lib/useKeyboardInset'
import { useLiveQuery } from 'dexie-react-hooks'
import { SiteCombobox } from '../components/SiteCombobox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/utils'

type Route = 'IM' | 'SubQ'
const NEW = '__new__'
const COLORS = ['#f4c95c', '#2566c4', '#2f8b54', '#c43c2f', '#7c5cff', '#d98324', '#3aa5a0']

// Moving between the "mg" and "units" tabs converts the value instead of
// reinterpreting the same digits in the new unit. Returns the patch to apply.
function switchEntryMode(line: Line, mode: EntryMode, unit: Unit, conc?: number): Partial<Line> {
  if (mode === line.entryMode) return {}
  const amount = convertAmount(line.amount, line.entryMode, mode, unit, conc)
  return amount === undefined ? { entryMode: mode } : { entryMode: mode, amount }
}

type Line = {
  key: string
  compoundId: number | typeof NEW | ''
  newName: string
  conc: string          // IM: direct mg/mL
  vialMg: string        // SubQ peptide: powder strength
  water: string         // SubQ peptide: bac water added (mL)
  entryMode: EntryMode
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
  // One row per compound name, picking the row actually in use rather than the
  // lowest id, so the remembered dose and vial numbers come from the right one.
  const compounds = useMemo(
    () => compoundGroups(rawCompounds, injections).map((g) => g.canonical),
    [rawCompounds, injections],
  )
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

  // Always land on the IM tab — even if SubQ was the last route used. SubQ data
  // is still kept and recalled the moment you switch over. Prefill the last IM
  // syringe (falls back to a blank line when there's no IM history).
  const initial = useMemo(
    () => ({ route: 'IM' as Route, stack: syringeForRoute('IM') }),
    [syringeForRoute],
  )

  const [route, setRoute] = useState<Route>(() => initial.route)
  const [lines, setLines] = useState<Line[]>(() => (initial.stack.length ? initial.stack.map(lineFromCompound) : [blankLine()]))
  const [site, setSite] = useState('')
  const [notes, setNotes] = useState('')
  const [feel, setFeel] = useState<Partial<Symptom>>({})
  const [feelOpen, setFeelOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const kbInset = useKeyboardInset()

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
  // Sort by route rather than filter by it. Hiding a compound saved on the
  // other route is what pushed people into "＋ New…" and minted duplicates;
  // the ones for this route still come first.
  const routeCompounds = useMemo(
    () => [...compounds].sort((a, b) => {
      const rank = (c: Compound) => (c.defaultRoute === route || c.defaultRoute == null ? 0 : 1)
      return rank(a) - rank(b)
    }),
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
        // Typing a name that already exists reuses that row. Without this,
        // "＋ New compound…" mints a duplicate every time the picker fails to
        // offer an existing one, which is how five Retatrutides happen.
        const already = r.existing ?? (r.isNew ? findCompoundByName(rawCompounds, r.name) : undefined)
        if (already) {
          compoundId = already.id!
          await db.compounds.update(compoundId, {
            // Only write values we actually have: Dexie deletes a key when the
            // value is undefined, which used to wipe a saved concentration
            // whenever the vial/water pair was left blank.
            ...(r.conc !== undefined && { concentrationMgPerMl: r.conc }),
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
      // Symptom check-in rides along with the injection (same moment), but only
      // when something was actually rated. A note alone belongs to the shot;
      // it used to create an empty "0 rated" check-in on the Timeline as well.
      const anyFeel = [...POSITIVE, ...NEGATIVE].some((s) => ratingOf(feel, s) !== undefined)
      if (anyFeel) {
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
        <h2 className="px-0.5 eyebrow">Route</h2>
        <Segmented
          value={route}
          onChange={changeRoute}
          className="w-full"
          options={[{ value: 'IM', label: 'Intramuscular' }, { value: 'SubQ', label: 'Subcutaneous' }]}
        />
        <p className="px-0.5 text-xs text-muted-foreground">
          {isPeptide ? 'Subcutaneous for peptides. Reconstituted vials, drawn in units.' : 'Everything in this syringe is intramuscular.'}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="px-0.5 eyebrow">
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
        <h2 className="px-0.5 eyebrow">Site</h2>
        <SitePicker route={route} value={site} injections={injections} onChange={setSite} />
      </section>

      {/* How do you feel? — optional symptom check-in that rides with the shot */}
      <section className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setFeelOpen((o) => !o)}
          className="flex items-center gap-1.5 self-start px-0.5 eyebrow"
          aria-expanded={feelOpen}
        >
          {feelOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          How do you feel? <span className="font-normal normal-case tracking-normal">(optional)</span>
        </button>
        {feelOpen && (
          <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
            <p className="text-xs text-muted-foreground">Tap a number to rate, or tap it again to clear. Anything you leave blank counts as fine.</p>
            <div>
              <p className="mb-1 eyebrow">Positive · higher is better</p>
              {POSITIVE.map((s) => (
                <SymptomScale key={s.key} def={s} value={ratingOf(feel, s)} onChange={(v) => setFeel((f) => withRating(f, s, v))} />
              ))}
            </div>
            <div>
              <p className="mb-1 eyebrow">Side effects · higher is worse</p>
              {NEGATIVE.map((s) => (
                <SymptomScale key={s.key} def={s} value={ratingOf(feel, s)} onChange={(v) => setFeel((f) => withRating(f, s, v))} />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="px-0.5 eyebrow">Notes</h2>
        <Input placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-[bottom] duration-150" style={{ bottom: kbInset }}>
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
  // Units mode needs a concentration to convert through. Without one `derive`
  // returns nothing, which used to leave Save dead with no explanation.
  const canUnits = (unit === 'mg' || unit === 'mcg') && conc !== undefined
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
                  // Switching the tab re-expresses what you already typed in the
                  // other unit, so 20 mg becomes the units to draw and back again.
                  onChange={(m) => onChange(switchEntryMode(line, m, unit, conc))}
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
                    <TriangleAlert className="size-3.5 shrink-0" /> Over 1 mL. Split it or use a bigger barrel.
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

// ── Symptom 0-5 scale (shared shape with the old Symptoms page) ─────────────
const DAY = 86_400_000

function dayLabel(d: number): string {
  if (!Number.isFinite(d)) return 'Rested'
  if (d < 0.5) return 'today'
  if (d < 1.5) return 'yesterday'
  return `${Math.round(d)}d ago`
}

// Friendly muscle name for an adjacency group — used in the "nearby used" warning.

// rested → this spot is free. near → an ADJACENT spot on the same muscle was
// used (soft warning, not blocked). caution / avoid → you actually used THIS
// spot (a while ago / recently).
type SiteStatus = 'rested' | 'near' | 'caution' | 'avoid'
const RANK: Record<SiteStatus, number> = { rested: 0, near: 1, caution: 2, avoid: 3 }

const DOT_CLASS: Record<'rested' | 'caution' | 'avoid', string> = {
  rested: 'bg-emerald-500',
  caution: 'bg-amber-500',
  avoid: 'bg-destructive',
}
// Amber means one thing only: you used THIS spot. A neighbour being used is a
// softer signal, so it reads as muted text with the warning triangle instead.
const LABEL_CLASS: Record<SiteStatus, string> = {
  rested: 'text-muted-foreground',
  near: 'text-muted-foreground',
  caution: 'text-amber-700 dark:text-amber-400',
  avoid: 'text-destructive',
}

function SitePicker({
  route, value, injections, onChange,
}: { route: Route; value: string; injections: InjectionLog[]; onChange: (s: string) => void }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const now = Date.now()

  // The curated list for this route, plus every site actually used on it. The
  // injection rows are the persistence: log a custom spot once and it stays on
  // the list for good, with no extra table to keep in sync.
  const quick: QuickSite[] = useMemo(() => {
    const base = route === 'SubQ' ? SUBQ_QUICK_SITES : IM_QUICK_SITES
    const seen = new Set(base.map((q) => q.site.trim().toLowerCase()))
    const extra: QuickSite[] = []
    for (const inj of injections) {
      const site = inj.site?.trim()
      if (!site) continue
      if ((inj.route === 'SubQ' ? 'SubQ' : 'IM') !== route) continue
      const k = site.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      extra.push(quickSiteFromUsed(site))
    }
    return [...base, ...extra]
  }, [route, injections])

  // Days since each exact site, plus the most-recent USED site per adjacency
  // group. The group is only used to warn neighbours — it never marks an
  // untouched spot as "used".
  const { daysBySite, groupRecent } = useMemo(() => {
    const bySite = new Map<string, number>()
    const gRecent = new Map<string, { days: number; site: string }>()
    for (const inj of injections) {
      if (!inj.site) continue
      if ((inj.route === 'SubQ' ? 'SubQ' : 'IM') !== route) continue
      const d = (now - new Date(inj.takenAt).getTime()) / DAY
      const cur = bySite.get(inj.site)
      if (cur === undefined || d < cur) bySite.set(inj.site, d)
      const g = siteGroup(inj.site)
      if (g) { const prev = gRecent.get(g); if (!prev || d < prev.days) gRecent.set(g, { days: d, site: inj.site }) }
    }
    return { daysBySite: bySite, groupRecent: gRecent }
  }, [injections, route, now])

  // Classify + order: rested first, then nearby-warnings, then this-spot-used,
  // most-recently-used at the very bottom.
  const rows = useMemo(() => {
    const out = quick.map((q) => {
      const exact = daysBySite.get(q.site) ?? Infinity
      const gr = groupRecent.get(q.group)
      let status: SiteStatus
      let label: string
      // Each status says a different thing, so the four are told apart by words
      // and not only by the colour of a dot.
      if (exact < 4) { status = 'avoid'; label = `This exact spot, ${dayLabel(exact)}` }
      else if (exact < 10) { status = 'caution'; label = `This exact spot, ${dayLabel(exact)}` }
      else if (gr && gr.days < 7 && gr.site !== q.site) {
        status = 'near'
        // Name the neighbour rather than the region: "Front Deltoid L" is
        // actionable, "deltoid used nearby" is not.
        label = `Not this spot, but ${gr.site} ${dayLabel(gr.days)}`
      } else {
        status = 'rested'
        label = Number.isFinite(exact) ? `Rested, last used ${dayLabel(exact)}` : 'Rested, never used'
      }
      const sortDays = status === 'near' ? (gr?.days ?? Infinity) : exact
      return { q, status, label, sortDays }
    })
    out.sort((a, b) => (RANK[a.status] - RANK[b.status]) || (b.sortDays - a.sortDays))
    return out
  }, [quick, daysBySite, groupRecent])

  return (
    <div className="flex flex-col gap-2">
      <p className="px-0.5 text-xs text-muted-foreground">Most rested first. Green = free. Amber = you used that exact spot. Red = you used it in the last few days. ⚠ = a neighbouring spot was used, this one is still free.</p>
      <div className="flex flex-col gap-1.5">
        {rows.map(({ q, status, label }) => {
          const selected = value === q.site
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
              {status === 'near' ? (
                <TriangleAlert className="size-4 shrink-0 text-amber-500" />
              ) : (
                <span className={cn('size-2.5 shrink-0 rounded-full', DOT_CLASS[status])} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">
                  {q.muscle}<span className="ml-1.5 text-xs font-normal text-muted-foreground">{q.side === 'L' ? 'Left' : 'Right'}</span>
                </span>
                <span className={cn('block text-xs', selected ? 'text-foreground' : LABEL_CLASS[status])}>{label}</span>
              </span>
            </button>
          )
        })}
      </div>

      {value && !quick.some((q) => q.site === value) && (
        <p className="px-0.5 text-xs text-muted-foreground">Selected: <span className="font-medium text-foreground">{value}</span></p>
      )}

      {moreOpen ? (
        <SiteCombobox value={value} onChange={onChange} route={route} />
      ) : (
        <button type="button" onClick={() => setMoreOpen(true)} className="self-start px-0.5 text-xs text-muted-foreground underline-offset-2 hover:underline">
          Other site / custom…
        </button>
      )}
    </div>
  )
}
