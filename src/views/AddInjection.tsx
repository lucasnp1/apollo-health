// Full-page injection logger. The route (IM or SubQ) picks the site list and
// what gets prefilled; it no longer decides the vial. A vial is liquid (an oil
// or ready-made solution, strength in mg/mL) or powder you mix (powder + bac
// water), on either route, so a 100 mg/mL tren oil drawn subq with a 30 unit
// insulin syringe logs as easily as a reconstituted peptide.
// A primary compound plus optional extras share ONE syringe. The Syringe
// section shows how full it is, where to stop for each compound, and when a
// different barrel would fit or read better. Everything (vial, syringe, dose,
// mg-or-marks) is remembered per compound for next time.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ChevronDown, ChevronUp, Plus, TriangleAlert, X } from 'lucide-react'
import { db, type Compound, type InjectionLog, type Symptom, type Unit, type VialKind } from '../lib/db'
import { logInjection, pickActiveVial } from '../lib/injections'
import { compoundGroups, findCompoundByName, groupByCompoundId } from '../lib/compounds'
import { findPKCompound } from '../lib/pk'
import { vialOf } from '../lib/vials'
import {
  SYRINGES, convertAmount, convertDraw, converts, derive, drawMarks, drawUnit, formatDraw, num,
  rememberedSyringe, roundForMode, syringeAdvice, syringeOf, unitLabel,
  type Derived, type EntryMode, type Syringe,
} from '../lib/dose'
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
type DoseUnit = 'mg' | 'mcg' | 'iu'
const NEW = '__new__'
const COLORS = ['#f4c95c', '#2566c4', '#2f8b54', '#c43c2f', '#7c5cff', '#d98324', '#3aa5a0']

const SELECT_CLASS = 'h-10 w-full appearance-none rounded-md border border-input bg-transparent bg-[length:1em_1em] bg-[right_0.75rem_center] bg-no-repeat pr-8 pl-3 text-sm font-medium shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
const SELECT_STYLE: CSSProperties = { backgroundImage: "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e\")" }
const SUFFIX = 'pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground'

// Short, stable display of a typed or derived number: 2.5, 300, 6.67.
const fmt = (x: number) => String(Number(x.toFixed(x < 10 ? 2 : 1)))
const numStr = (n?: number) => (n !== undefined ? String(n) : '')
// mL beside insulin units: 3 decimals is what 0.1 unit resolves to, so 1.5
// units reads 0.015 mL, not a contradicting 0.02.
const fmtMl = (ml: number) => (ml < 0.1 ? String(Number(ml.toFixed(3))) : ml.toFixed(2))

type Line = {
  key: string
  compoundId: number | typeof NEW | ''
  newName: string
  unit: Unit            // new compounds only; an existing one keeps its own
  kind: VialKind
  kindTouched: boolean  // Liquid/Powder was picked by hand, so stop guessing
  setupOpen: boolean    // vial editor shown, else a one-line summary
  conc: string          // liquid: strength per mL
  vialMg: string        // powder: amount in the vial
  water: string         // powder: bac water added (mL)
  entryMode: EntryMode
  amount: string
}

let counter = 0
const nextKey = () => `l${(counter += 1)}`

function blankLine(route: Route): Line {
  return {
    key: nextKey(), compoundId: '', newName: '', unit: 'mg',
    // Only a first guess: typing a name like "Tren A" flips it to liquid.
    kind: route === 'SubQ' ? 'powder' : 'liquid', kindTouched: false, setupOpen: true,
    conc: '', vialMg: '', water: '', entryMode: 'dose', amount: '',
  }
}

// A line prefilled from everything the compound remembers. `s` is the syringe
// the page will use, so a remembered draw comes back in that syringe's marks.
// `shotDose` is the compound's last dose on the current route, which beats
// lastDose: a SubQ microdose must not become the next IM shot's dose.
function lineFromCompound(c: Compound, s: Syringe, shotDose?: number): Line {
  const v = vialOf(c)
  const unit = c.unit ?? 'mg'
  const dose = shotDose ?? c.lastDose ?? c.defaultDose
  const hasDose = dose !== undefined && dose > 0
  const conc = v.kind === 'powder' ? (v.vialMg && v.water ? v.vialMg / v.water : undefined) : v.conc
  let entryMode: EntryMode = 'dose'
  let amount = hasDose ? String(dose) : ''
  if (c.entryMode === 'draw' && hasDose && conc !== undefined) {
    const drawn = convertAmount(String(dose), 'dose', 'draw', unit, conc, s.perMl)
    if (drawn !== undefined) { entryMode = 'draw'; amount = drawn }
  }
  return {
    key: nextKey(), compoundId: c.id ?? '', newName: '', unit,
    kind: v.kind, kindTouched: false,
    // Rows saved before vial kinds existed open once, so the numbers inferred
    // from them get a look; so does anything missing a strength.
    setupOpen: v.legacy || conc === undefined,
    conc: numStr(v.conc), vialMg: numStr(v.vialMg), water: numStr(v.water),
    entryMode, amount,
  }
}

// Moving between the dose and draw tabs converts the value instead of
// reinterpreting the same digits in the new unit. Returns the patch to apply.
function switchEntryMode(line: Line, mode: EntryMode, unit: Unit, conc: number | undefined, perMl: number): Partial<Line> {
  if (mode === line.entryMode) return {}
  // Nothing to convert through (no strength): clear it rather than let 40
  // units quietly become 40 mg.
  const amount = convertAmount(line.amount, line.entryMode, mode, unit, conc, perMl)
  return { entryMode: mode, amount: amount ?? '' }
}

type Resolved = {
  line: Line
  existing?: Compound
  /** A typed new name that is already in the list: logs to that compound. */
  match?: Compound
  unit: Unit
  conc?: number
  vialMg: number
  water: number
  d: Derived
  name: string
  isNew: boolean
  valid: boolean
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
  const groups = useMemo(() => compoundGroups(rawCompounds, injections), [rawCompounds, injections])
  const compounds = useMemo(() => groups.map((g) => g.canonical), [groups])

  // Last dose per compound per route, from the shots themselves (newest
  // first). This is the per-route dose memory, and it also covers compounds
  // saved before lastDose synced.
  const shotDoses = useMemo(() => {
    const byId = groupByCompoundId(groups)
    const m = new Map<string, number>()
    for (const inj of injections) {
      const c = byId.get(inj.compoundId)?.canonical
      if (!c || inj.dose == null || !(inj.dose > 0) || inj.unit !== (c.unit ?? 'mg')) continue
      const k = `${c.id}|${inj.route === 'SubQ' ? 'SubQ' : 'IM'}`
      if (!m.has(k)) m.set(k, inj.dose)
    }
    return m
  }, [groups, injections])
  const prefill = useCallback(
    (c: Compound, s: Syringe, r: Route) => lineFromCompound(c, s, shotDoses.get(`${c.id}|${r}`)),
    [shotDoses],
  )
  const vials = useLiveQuery(() => db.vials.toArray(), [], [])

  // The last syringe you logged on a route = every compound sharing the most
  // recent takenAt for that route. Reopening prefills the WHOLE stack (with each
  // compound's saved vial/dose), not just the primary compound.
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

  // Always land on the IM tab, even if SubQ was the last route used. SubQ data
  // is still kept and recalled the moment you switch over. Prefill the last IM
  // syringe (falls back to a blank line when there's no IM history).
  const initial = useMemo(() => {
    const stack = syringeForRoute('IM')
    const syringe = rememberedSyringe(stack[0], 'IM')
    return { route: 'IM' as Route, stack, syringe, lines: stack.map((c) => prefill(c, syringe, 'IM')) }
  }, [syringeForRoute, prefill])

  const [route, setRoute] = useState<Route>(() => initial.route)
  const [syringeKey, setSyringeKey] = useState(() => initial.syringe.key)
  // Once you pick a syringe yourself, choosing compounds stops changing it.
  const [syringeTouched, setSyringeTouched] = useState(false)
  const [lines, setLines] = useState<Line[]>(() => (initial.lines.length ? initial.lines : [blankLine('IM')]))
  const [site, setSite] = useState('')
  const [notes, setNotes] = useState('')
  const [feel, setFeel] = useState<Partial<Symptom>>({})
  const [feelOpen, setFeelOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const kbInset = useKeyboardInset()

  // Data loads async (liveQuery starts empty). Hydrate the form from the last
  // syringe once, the first time real data arrives, never clobbering edits.
  const hydrated = useRef(initial.stack.length > 0)
  useEffect(() => {
    if (hydrated.current || initial.stack.length === 0) return
    setRoute(initial.route)
    setSyringeKey(initial.syringe.key)
    setLines(initial.lines)
    hydrated.current = true
  }, [initial])

  const syringe = syringeOf(syringeKey, route)

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
  // the last stack you used on that route with the syringe it went in.
  function changeRoute(r: Route) {
    if (r === route) return
    const stack = syringeForRoute(r)
    const s = rememberedSyringe(stack[0], r)
    setRoute(r)
    setSyringeKey(s.key)
    setSyringeTouched(false)
    setLines(stack.length ? stack.map((c) => prefill(c, s, r)) : [blankLine(r)])
    setSite('')
  }

  function update(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  // Every syringe change goes through here. A line typed as a draw is
  // re-expressed in the new marks so the volume stays the same: 20 units
  // becomes 0.2 mL, never 20 mL.
  function applySyringe(next: Syringe, touched: boolean) {
    if (touched) setSyringeTouched(true)
    if (next.key === syringe.key) return
    const from = syringe.perMl
    setSyringeKey(next.key)
    setLines((prev) => prev.map((l) => (
      l.entryMode === 'draw' ? { ...l, amount: convertDraw(l.amount, from, next.perMl) ?? l.amount } : l
    )))
  }

  function pickCompound(key: string, value: string) {
    if (value === NEW) { update(key, { ...blankLine(route), key, compoundId: NEW }); return }
    const c = compounds.find((x) => x.id === Number(value))
    if (!c) return
    // The first compound brings the syringe it was last drawn in, unless you
    // already chose one. Extras in the same syringe never change it.
    const s = lines[0]?.key === key && !syringeTouched ? rememberedSyringe(c, route) : syringe
    const fresh = prefill(c, s, route)
    setLines((prev) => prev.map((l) => {
      if (l.key === key) return { ...fresh, key }
      if (s.key !== syringe.key && l.entryMode === 'draw') return { ...l, amount: convertDraw(l.amount, syringe.perMl, s.perMl) ?? l.amount }
      return l
    }))
    if (s.key !== syringe.key) setSyringeKey(s.key)
  }

  // A known oil (test, tren, mast...) is guessed as liquid while you type,
  // before you reach the vial inputs, until you pick Liquid or Powder yourself.
  function nameChange(key: string, newName: string) {
    const line = lines.find((l) => l.key === key)
    if (!line || line.kindTouched) { update(key, { newName }); return }
    const name = newName.trim()
    const kind: VialKind = name.length >= 3 && findPKCompound(name) ? 'liquid' : route === 'SubQ' ? 'powder' : 'liquid'
    update(key, { newName, kind })
  }

  // Typing a name you already have turns the line into that compound, with
  // everything it remembers. A dose already typed in the same unit carries
  // over; in another unit it can't, so it is cleared rather than reread. If
  // you left the name for this line's dose field, that field starts empty so
  // what you type is not appended to the remembered dose.
  function nameBlur(key: string, into?: string) {
    const line = lines.find((l) => l.key === key)
    const name = line?.newName.trim()
    if (!line || !name) return
    const match = findCompoundByName(compounds, name)
    if (!match) return
    const typed = line.entryMode === 'dose' && line.unit === (match.unit ?? 'mg') ? line.amount : ''
    pickCompound(key, String(match.id))
    if (typed || into === `amt-${key}`) update(key, { amount: typed, entryMode: 'dose' })
  }

  function addLine() { setLines((prev) => [...prev, blankLine(route)]) }
  function removeLine(key: string) { setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev)) }

  const resolved: Resolved[] = lines.map((line) => {
    const picked = typeof line.compoundId === 'number' ? compounds.find((c) => c.id === line.compoundId) : undefined
    const isNew = line.compoundId === NEW
    const name = picked?.name ?? line.newName.trim()
    // A typed name you already have logs to that compound, never a duplicate.
    const match = isNew && name ? findCompoundByName(compounds, name) : undefined
    const existing = picked ?? match
    const unit = existing ? existing.unit ?? 'mg' : line.unit
    const vialMg = num(line.vialMg)
    const water = num(line.water)
    const strength = num(line.conc)
    const conc = line.kind === 'powder'
      ? (vialMg > 0 && water > 0 ? vialMg / water : undefined)
      : (strength > 0 ? strength : undefined)
    const d = derive(line.entryMode, num(line.amount), unit, conc, syringe.perMl)
    const valid = Boolean((picked || (isNew && name)) && d.doseInUnit && d.doseInUnit > 0)
    return { line, existing, match, unit, conc, vialMg, water, d, name, isNew, valid }
  })

  const validLines = resolved.filter((r) => r.valid)
  const canSave = validLines.length > 0 && !busy

  // What fills the syringe: every line with an amount. The fill is only known
  // when each of those has a volume, i.e. a strength to convert through.
  const filled = resolved.filter((r) => (r.existing || r.isNew) && num(r.line.amount) > 0)
  const fillKnown = filled.length > 0 && filled.every((r) => r.d.ml !== undefined)

  async function save() {
    if (!canSave) return
    setBusy(true)
    try {
      const takenAt = new Date().toISOString()
      for (const r of validLines) {
        const dose = Number(roundForMode(r.d.doseInUnit!, 'dose', r.unit))
        // Everything this compound prefills next time. Only defined values:
        // Dexie deletes a key when the value is undefined, which used to wipe
        // a saved concentration whenever the vial pair was left blank.
        // Switching to liquid keeps the powder numbers; vialKind decides.
        const memory = {
          // A typed name that matched an existing compound only overrides its
          // vial when you actually set one up on this line.
          ...((!r.match || r.line.kindTouched || r.conc !== undefined) && { vialKind: r.line.kind }),
          syringe: syringe.key,
          entryMode: r.line.entryMode,
          defaultRoute: route,
          lastDose: dose,
          ...(r.conc !== undefined && { concentrationMgPerMl: r.conc }),
          // Each powder number on its own: a vial size typed (or read from old
          // entries) without the water yet must still be remembered.
          ...(r.line.kind === 'powder' && r.vialMg > 0 && { vialMg: r.vialMg }),
          ...(r.line.kind === 'powder' && r.water > 0 && { reconstituteMl: r.water }),
        }
        let compoundId: number
        if (r.existing) {
          compoundId = r.existing.id!
          await db.compounds.update(compoundId, memory)
        } else {
          compoundId = (await db.compounds.add({
            name: r.name,
            category: r.line.kind === 'powder' ? 'Peptide' : 'Other',
            defaultDose: dose,
            unit: r.unit,
            schedule: 'As needed',
            color: COLORS[(compounds.length + validLines.indexOf(r)) % COLORS.length],
            ...memory,
          })) as number
        }
        const activeVial = vials ? pickActiveVial(vials, compoundId) : undefined
        await logInjection({
          compoundId,
          takenAt,
          dose,
          unit: r.unit,
          route,
          site: site || undefined,
          notes: notes || undefined,
          vialId: activeVial?.id,
          // The volume actually drawn, so a wrong strength can be fixed later.
          ...(r.d.ml !== undefined && { vialAmount: `${r.d.ml.toFixed(3)} mL` }),
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
              r={r}
              compounds={routeCompounds}
              route={route}
              syringe={syringe}
              removable={resolved.length > 1}
              onPick={(v) => pickCompound(r.line.key, v)}
              onChange={(patch) => update(r.line.key, patch)}
              onNameChange={(v) => nameChange(r.line.key, v)}
              onNameBlur={(into) => nameBlur(r.line.key, into)}
              onRemove={() => removeLine(r.line.key)}
            />
          ))}
        </div>
        <Button variant="outline" className="self-start" onClick={addLine}>
          <Plus className="size-4" /> Add compound (same syringe)
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="px-0.5 eyebrow">Syringe</h2>
        <SyringePanel syringe={syringe} filled={filled} fillKnown={fillKnown} onChange={(s) => applySyringe(s, true)} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="px-0.5 eyebrow">Site</h2>
        <SitePicker route={route} value={site} injections={injections} onChange={setSite} />
      </section>

      {/* How do you feel? Optional symptom check-in that rides with the shot */}
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
  index, r, compounds, route, syringe, removable, onPick, onChange, onNameChange, onNameBlur, onRemove,
}: {
  index: number
  r: Resolved
  compounds: Compound[]
  route: Route
  syringe: Syringe
  removable: boolean
  onPick: (v: string) => void
  onChange: (patch: Partial<Line>) => void
  onNameChange: (name: string) => void
  onNameBlur: (into?: string) => void
  onRemove: () => void
}) {
  const { line, existing, match, unit, conc, d } = r
  const isNew = line.compoundId === NEW
  const u = unitLabel(unit)
  const iu = unit === 'iu'
  const insulin = syringe.perMl === 100
  const drawWord = insulin ? 'units' : 'mL'
  const perMl = iu ? 'IU/mL' : 'mg/mL'
  const v = !isNew && existing ? vialOf(existing) : undefined
  const legacy = !!v?.legacy && (v.conc !== undefined || v.vialMg !== undefined || v.water !== undefined)
  // Opening the editor from its summary moves focus into it; opening on load does not.
  const [focusVial, setFocusVial] = useState(false)
  // The draw tab needs a strength to convert through. Once you're on it, the
  // toggle stays so you can always get back.
  const canDraw = converts(unit) && (conc !== undefined || line.entryMode === 'draw')
  const collapsed = !line.setupOpen && conc !== undefined
  const draw = d.ml !== undefined ? formatDraw(d.ml, syringe) : undefined
  const showReadout = num(line.amount) > 0 && d.ml !== undefined && (line.entryMode === 'dose' || d.doseInUnit !== undefined)

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <select
          aria-label="Compound"
          value={line.compoundId === '' ? '' : String(line.compoundId)}
          onChange={(e) => onPick(e.target.value)}
          className={SELECT_CLASS}
          style={SELECT_STYLE}
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
          <Input
            id={`name-${line.key}`}
            autoFocus
            placeholder={route === 'SubQ' ? 'e.g. BPC-157' : 'e.g. Testosterone E'}
            value={line.newName}
            onChange={(e) => onNameChange(e.target.value)}
            onBlur={(e) => onNameBlur((e.relatedTarget as HTMLElement | null)?.id)}
          />
        </div>
      )}

      {isNew && (match ? (
        <p className="px-0.5 text-xs text-muted-foreground">
          Already in your list. This logs to {match.name} in {unitLabel(match.unit)}.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <Label>Measured in</Label>
          <Segmented<DoseUnit>
            ariaLabel="Measured in"
            value={line.unit as DoseUnit}
            // Relabels only. Nothing typed is converted.
            onChange={(v) => onChange({ unit: v })}
            options={[{ value: 'mg', label: 'mg' }, { value: 'mcg', label: 'mcg' }, { value: 'iu', label: 'IU' }]}
          />
        </div>
      ))}

      {(existing || isNew) && converts(unit) && (collapsed ? (
        <button
          type="button"
          onClick={() => { setFocusVial(true); onChange({ setupOpen: true }) }}
          className="flex w-full items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
        >
          <span className="min-w-0 break-words tabular-nums">
            <span className="text-muted-foreground">Vial · </span>
            {line.kind === 'liquid'
              ? `Liquid · ${fmt(conc!)} ${perMl}`
              : `Powder · ${fmt(r.vialMg)} ${iu ? 'IU' : 'mg'} + ${fmt(r.water)} mL · ${fmt(conc!)} ${perMl}`}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">Edit</span>
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label>Vial</Label>
            <Segmented<VialKind>
              ariaLabel="Vial type"
              value={line.kind}
              onChange={(k) => onChange({ kind: k, kindTouched: true })}
              options={[{ value: 'liquid', label: 'Liquid' }, { value: 'powder', label: 'Powder' }]}
            />
          </div>
          {line.kind === 'liquid' ? (
            <>
              <div className="relative">
                <Input
                  aria-label="Strength"
                  autoFocus={focusVial}
                  inputMode="decimal"
                  className="pr-16"
                  placeholder={route === 'SubQ' ? 'e.g. 100' : 'e.g. 300'}
                  value={line.conc}
                  onChange={(e) => onChange({ conc: e.target.value })}
                />
                <span className={SUFFIX}>{perMl}</span>
              </div>
              <p className="px-0.5 text-xs text-muted-foreground">The strength printed on the vial.</p>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <Input autoFocus={focusVial} inputMode="decimal" className="pr-10" placeholder={iu ? '5000' : '10'} value={line.vialMg} onChange={(e) => onChange({ vialMg: e.target.value })} aria-label={iu ? 'Powder in the vial, IU' : 'Powder in the vial, mg'} />
                  <span className={SUFFIX}>{iu ? 'IU' : 'mg'}</span>
                </div>
                <div className="relative">
                  <Input inputMode="decimal" className="pr-10" placeholder="2" value={line.water} onChange={(e) => onChange({ water: e.target.value })} aria-label="Bac water added, mL" />
                  <span className={SUFFIX}>mL</span>
                </div>
              </div>
              <p className="px-0.5 text-xs text-muted-foreground">
                Powder in the vial + bac water you add{conc !== undefined ? ` = ${fmt(conc)} ${perMl}` : ''}.
              </p>
            </>
          )}
          {legacy && <p className="px-0.5 text-xs text-muted-foreground">Check this once. It was filled in from your older entries.</p>}
        </div>
      ))}

      {(existing || isNew) && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`amt-${line.key}`}>{line.entryMode === 'draw' ? 'Draw on syringe' : `Dose (${u})`}</Label>
            {canDraw && (
              <Segmented<EntryMode>
                ariaLabel="Enter as"
                value={line.entryMode}
                // Switching the tab re-expresses what you already typed, so
                // 20 mg becomes the marks to draw to and back again.
                onChange={(m) => onChange(switchEntryMode(line, m, unit, conc, syringe.perMl))}
                options={[{ value: 'dose', label: u }, { value: 'draw', label: drawWord }]}
              />
            )}
          </div>
          <div className="relative">
            <Input
              id={`amt-${line.key}`}
              inputMode="decimal"
              className="pr-16 text-base"
              placeholder={line.entryMode === 'draw' ? (insulin ? 'e.g. 20' : 'e.g. 0.5') : ''}
              value={line.amount}
              onChange={(e) => onChange({ amount: e.target.value })}
            />
            <span className={cn(SUFFIX, 'text-sm')}>{line.entryMode === 'draw' ? drawWord : u}</span>
          </div>
          {line.entryMode === 'draw' && conc === undefined && (
            <p className="px-0.5 text-xs text-muted-foreground">Add the vial strength to work out the dose.</p>
          )}
          {showReadout && (
            <div className="flex flex-col gap-1 rounded-lg border-l border-l-primary bg-muted/40 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 tabular-nums">
                {line.entryMode === 'draw' ? (
                  <>
                    <span className="text-base font-semibold">{fmt(d.doseInUnit!)} <small className="text-xs font-normal text-muted-foreground">{u}</small></span>
                    {insulin && <span>{fmtMl(d.ml!)} <small className="text-xs font-normal text-muted-foreground">mL</small></span>}
                  </>
                ) : (
                  <>
                    {insulin && <span>{fmtMl(d.ml!)} <small className="text-xs font-normal text-muted-foreground">mL</small></span>}
                    <span className="text-base font-semibold">{draw} <small className="text-xs font-normal text-muted-foreground">{drawUnit(draw!, syringe)}</small></span>
                  </>
                )}
              </div>
              {iu && insulin && <p className="text-xs text-muted-foreground">IU is the dose. Units are the marks on the syringe.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Syringe: which barrel, how full, where to stop ──────────────────────────
function SyringePanel({
  syringe, filled, fillKnown, onChange,
}: { syringe: Syringe; filled: Resolved[]; fillKnown: boolean; onChange: (s: Syringe) => void }) {
  const insulin = syringe.perMl === 100
  const mls = fillKnown ? filled.map((r) => r.d.ml!) : []
  const totalMl = mls.reduce((a, b) => a + b, 0)
  const advice = fillKnown ? syringeAdvice(totalMl, Math.min(...mls), syringe) : undefined
  const over = advice?.kind === 'over'
  const total = formatDraw(totalMl, syringe)
  const totalLabel = `${total} ${drawUnit(total, syringe)}`
  const cap = insulin ? `${syringe.capacityMl * 100} units` : `${syringe.capacityMl} mL`
  const marks = drawMarks(mls, syringe)
  // The advice button disappears once used; hand focus to the choice it made.
  const selectRef = useRef<HTMLSelectElement>(null)

  return (
    <div className="flex flex-col gap-2">
      <select
        ref={selectRef}
        aria-label="Syringe"
        value={syringe.key}
        onChange={(e) => onChange(SYRINGES.find((s) => s.key === e.target.value) ?? syringe)}
        className={SELECT_CLASS}
        style={SELECT_STYLE}
      >
        <optgroup label="Insulin (marked in units)">
          {SYRINGES.filter((s) => s.perMl === 100).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </optgroup>
        <optgroup label="Regular (marked in mL)">
          {SYRINGES.filter((s) => s.perMl === 1).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </optgroup>
      </select>
      <p className="px-0.5 text-xs text-muted-foreground">
        {insulin ? 'Insulin syringes are marked in units. 100 units is 1 mL on every size.' : 'Regular syringes are marked in mL.'}
      </p>

      {fillKnown ? (
        <div className="mt-1 flex flex-col gap-3 rounded-lg bg-muted/40 px-3 py-3">
          <div className="flex items-center gap-3">
            <div role="img" aria-label={`${totalLabel} of ${cap}`} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-[width] duration-200', over ? 'bg-destructive' : 'bg-primary')}
                style={{ width: `${Math.min(100, (totalMl / syringe.capacityMl) * 100)}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{total} of {cap}</span>
          </div>

          {filled.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <p className="eyebrow">Draw to</p>
              {filled.map((r, i) => (
                <div key={r.line.key} className="flex items-center gap-2.5">
                  <span className="size-2.5 shrink-0 rounded-full bg-muted-foreground/40" style={r.existing?.color ? { background: r.existing.color } : undefined} />
                  <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                  <span className="shrink-0 text-base font-semibold tabular-nums">
                    {marks[i]} <small className="text-xs font-normal text-muted-foreground">{drawUnit(marks[i], syringe)}</small>
                  </span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Draw in this order, stopping at each mark.</p>
            </div>
          )}

          {advice && (
            <div className="flex flex-col gap-2">
              <p className={cn('flex items-start gap-1.5 text-xs', over ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                {over && <TriangleAlert className="mt-px size-3.5 shrink-0" />}
                {over
                  ? advice.use
                    ? `${totalLabel} won't fit. This syringe holds ${cap}.`
                    : `${totalLabel} won't fit in any syringe here. Split it into two shots.`
                  : 'Small draw for this syringe, easy to misread.'}
              </p>
              {advice.use && (
                <Button variant="outline" size="sm" className="self-start" onClick={() => { onChange(advice.use!); selectRef.current?.focus() }}>
                  Use {advice.use.short}
                </Button>
              )}
            </div>
          )}
        </div>
      ) : filled.length > 0 ? (
        <p className="px-0.5 text-xs text-muted-foreground">Add the vial strength for every compound to check the fill.</p>
      ) : null}
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
