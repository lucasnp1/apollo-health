// Log a shot, exactly as given. Nothing is worked out for you: the dose and what you drew are two separate fields,
// saved as typed, and the app never converts one into the other, suggests a syringe or marks a draw (Apple 1.4.2
// treats that as a dosage calculator; decided 18 Oct 2026, docs/decisions.md). The web's maths (src/lib/dose.ts) is
// kept out of this bundle by metro.config.js. A better way to help with the draw can replace <Drawn> later.
// As on the web: several compounds can share one syringe (one row each, same moment), a check-in can ride along, and
// opening the logger brings back the last syringe you used on the route. With an `id` param it edits that shot.
import { SymbolView } from 'expo-symbols'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { type CompoundGroup, compoundGroups, compoundKey, findCompoundByName, groupByCompoundId, randomDistinctColor } from '@shared/lib/compounds'
import { type Compound, db, type InjectionLog, type Symptom, type SyringeKey, type Unit } from '@shared/lib/db'
import { canonicalSite, type Route } from '@shared/lib/sites'
import { NEGATIVE, POSITIVE, ratingOf, withRating } from '@shared/lib/symptoms'
import { dedupeInjections, useCompounds, useInjections } from '@/data/useLog'
import { Card, Chips, Eyebrow, Input, s as kit, Section, Segmented, When } from '@/kit'
import { LogForm, num } from '@/LogForm'
import { Scale } from '@/logging/Scale'
import { SitePicker } from '@/logging/SitePicker'
import { useDirty, useEditRow } from '@/logging/useEntry'
import { C, F } from '@/theme'
import { unitLabel } from '@/timeline'

const NEW = 'new'
const UNITS: { value: Unit; label: string }[] = [
  { value: 'mg', label: 'mg' },
  { value: 'mcg', label: 'mcg' },
  { value: 'iu', label: 'IU' },
  { value: 'ml', label: 'mL' },
]
// Names only, to note which syringe you used. Same keys as the web, so its logger picks the same one next time.
const SYRINGES: { value: SyringeKey; label: string; marks: Mark }[] = [
  { value: 'u30', label: '30 unit insulin', marks: 'units' },
  { value: 'u50', label: '50 unit insulin', marks: 'units' },
  { value: 'u100', label: '100 unit insulin', marks: 'units' },
  { value: 'ml1', label: '1 mL', marks: 'mL' },
  { value: 'ml2', label: '2 mL', marks: 'mL' },
  { value: 'ml3', label: '3 mL', marks: 'mL' },
]
type Mark = 'units' | 'mL'
// The web's needle list (src/lib/dose.ts NEEDLES), copied as plain names: that file must not ship here
const NEEDLES: Record<Mark, string[]> = {
  units: ['31G 6 mm', '31G 8 mm', '30G 8 mm', '29G 12.7 mm'],
  mL: ['30G ½ in (13 mm)', '27G ½ in (13 mm)', '25G ⅝ in (16 mm)', '25G 1 in (25 mm)', '23G 1 in (25 mm)', '23G 1¼ in (32 mm)', '22G 1½ in (38 mm)', '21G 1½ in (38 mm)'],
}

/** Lines this logger adds under your note, so the web shows them too: "Syringe: …", "Vial: …". */
const noteLine = (notes: string | undefined, label: string) => notes?.match(new RegExp(`^${label}: (.*)$`, 'm'))?.[1]
const stripLines = (notes: string | undefined) => (notes ?? '').split('\n').filter((l) => !/^(Syringe|Vial): /.test(l)).join('\n').trim()
const routeOf = (i: InjectionLog): Route => (i.route === 'SubQ' ? 'SubQ' : 'IM')

/** One compound in the syringe. `pick` is a compound group key, NEW for a typed name, or nothing yet. */
type Line = { key: string; pick?: string; name: string; unit: Unit; dose: string; drawn: string; vial: string }
let seq = 0
const blank = (): Line => ({ key: `l${++seq}`, name: '', unit: 'mg', dose: '', drawn: '', vial: '' })

type Prefill = { lines: Line[]; syringe?: SyringeKey; marks?: Mark; needle: string }

/** A compound's line as you left it last time on this route: dose and vial. Never a new number. */
function lineFor(g: CompoundGroup, route: Route, shots: InjectionLog[]): Line {
  const c = g.canonical
  const mine = shots.filter((i) => g.ids.includes(i.compoundId))
  const onRoute = mine.find((i) => routeOf(i) === route && i.dose != null && i.unit === (c.unit ?? 'mg'))
  const d = onRoute?.dose ?? c.lastDose
  return { ...blank(), pick: g.key, dose: d !== undefined && d > 0 ? String(d) : '', vial: noteLine(mine[0]?.notes, 'Vial') ?? '' }
}

/** The last syringe on a route: every compound logged at the most recent moment on it, with its syringe and needle. */
function prefillFor(route: Route, groups: CompoundGroup[], shots: InjectionLog[]): Prefill {
  const byId = groupByCompoundId(groups)
  const last = shots.find((i) => routeOf(i) === route)
  const stack: CompoundGroup[] = []
  if (last)
    for (const i of shots) {
      if (i.takenAt !== last.takenAt || routeOf(i) !== route) continue
      const g = byId.get(i.compoundId)
      if (g && !stack.includes(g)) stack.push(g)
    }
  if (!stack.length) {
    const g = groups.find((x) => x.canonical.defaultRoute === route)
    if (g) stack.push(g)
  }
  const sy = SYRINGES.find((x) => x.value === stack[0]?.canonical.syringe)
  return {
    lines: stack.length ? stack.map((g) => lineFor(g, route, shots)) : [blank()],
    syringe: sy?.value,
    marks: sy?.marks,
    needle: last?.needle ?? '',
  }
}

/** Most recently used first: one chip per drug (sync can leave duplicate rows). */
function sortedGroups(compounds: Compound[], shots: InjectionLog[]) {
  const lastAt = new Map<number, string>()
  for (const i of shots) if (!lastAt.has(i.compoundId)) lastAt.set(i.compoundId, i.takenAt)
  const last = (ids: number[]) => ids.map((id) => lastAt.get(id) ?? '').sort().pop() ?? ''
  return compoundGroups(compounds, shots).sort((a, b) => last(b.ids).localeCompare(last(a.ids)))
}

export default function LogInjection() {
  const compounds = useCompounds()
  const injections = useInjections()
  const groups = useMemo(() => sortedGroups(compounds, injections), [compounds, injections])

  const [route, setRoute] = useState<Route>('IM')
  const [lines, setLines] = useState<Line[]>(() => [blank()])
  const [marks, setMarks] = useState<Mark>('mL')
  const [syringe, setSyringe] = useState<SyringeKey | undefined>()
  const [needle, setNeedle] = useState('')
  const [site, setSite] = useState('')
  const [notes, setNotes] = useState('')
  const [when, setWhen] = useState(() => new Date())
  const [feel, setFeel] = useState<Partial<Symptom>>({})
  const [feelOpen, setFeelOpen] = useState(false)

  // Editing: the saved shot, its compound fixed
  const [edit, setEdit] = useState<InjectionLog | undefined>()
  const [editName, setEditName] = useState('Injection')
  const loadedDose = useRef('')
  const { id, ready } = useEditRow(
    (rowId) => db.injections.get(rowId),
    (row: InjectionLog) => {
      const drawn = row.vialAmount?.trim().match(/^([\d.,]+)\s*(units|mL)$/i)
      const sy = SYRINGES.find((x) => x.label === noteLine(row.notes, 'Syringe'))
      const dose = row.dose != null ? String(row.dose) : ''
      loadedDose.current = dose
      setEdit(row)
      // Read directly: an archived compound is not in the live list
      void db.compounds.get(row.compoundId).then((c) => c && setEditName(c.name))
      setRoute(routeOf(row))
      setLines([{ ...blank(), unit: row.unit, dose, drawn: drawn?.[1] ?? '', vial: noteLine(row.notes, 'Vial') ?? '' }])
      setMarks(drawn ? (drawn[2].toLowerCase() === 'units' ? 'units' : 'mL') : (sy?.marks ?? 'mL'))
      setSyringe(sy?.value)
      setNeedle(row.needle ?? '')
      setSite(row.site ?? '')
      setNotes(stripLines(row.notes))
      setWhen(new Date(row.takenAt))
    },
  )
  const editing = id !== undefined
  const { dirty, rebase } = useDirty({ route, lines: lines.map(({ key: _key, ...rest }) => rest), marks, syringe, needle, site, notes, when, feel }, ready)

  // A new shot opens on the last syringe you used: IM unless you only ever log SubQ, as on the web. Read once, straight
  // from the database, so the compounds and the shots are both there (the live lists each start out empty).
  const hydrated = useRef(false)
  useEffect(() => {
    if (editing) return
    let live = true
    void (async () => {
      const [cs, rows] = await Promise.all([
        db.compounds.filter((c) => !c.archived && !c.deletedAtSync).toArray(),
        db.injections.orderBy('takenAt').reverse().filter((i) => !i.deletedAtSync && !i.archivedAt).limit(60).toArray(),
      ])
      const shots = dedupeInjections(rows)
      if (!live || hydrated.current || !cs.length) return
      hydrated.current = true
      const r: Route = shots.some((i) => routeOf(i) === 'IM') || !shots.length ? 'IM' : 'SubQ'
      apply(r, prefillFor(r, sortedGroups(cs, shots), shots))
      rebase()
    })()
    return () => void (live = false)
    // once, on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  function apply(r: Route, p: Prefill) {
    setRoute(r)
    setLines(p.lines)
    setSyringe(p.syringe)
    if (p.marks) setMarks(p.marks)
    setNeedle(p.needle)
  }

  // Switching route brings back what you last used on that route; when editing, it only changes the route
  function changeRoute(r: Route) {
    if (r === route) return
    if (editing) return setRoute(r)
    hydrated.current = true
    apply(r, prefillFor(r, groups, injections))
    setSite('')
  }

  const update = (key: string, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  /** Picking a compound brings back its last dose and vial on this route; the first one also its syringe. */
  function choose(line: Line, key: string | undefined) {
    const g = groups.find((x) => x.key === key)
    if (!g) return update(line.key, { pick: key, ...(key === NEW && { dose: '', vial: '' }) })
    const fresh = lineFor(g, route, injections)
    update(line.key, { pick: key, dose: fresh.dose, vial: fresh.vial, drawn: '' })
    if (lines[0]?.key === line.key) {
      const sy = SYRINGES.find((x) => x.value === g.canonical.syringe)
      if (sy) {
        setSyringe(sy.value)
        setMarks(sy.marks)
      }
    }
  }

  // Each line resolved: its compound (an existing one, a typed name you already have, or a new one) and whether it's ready
  const resolved = lines.map((l) => {
    const g = groups.find((x) => x.key === l.pick)
    const compound: Compound | undefined = editing
      ? compounds.find((c) => c.id === edit?.compoundId)
      : (g?.canonical ?? (l.pick === NEW && l.name.trim() ? findCompoundByName(compounds, l.name) : undefined))
    const doseN = num(l.dose)
    const drawnN = num(l.drawn)
    const named = editing || (l.pick === NEW ? !!l.name.trim() : !!g)
    const bad = (l.dose.trim() && !(doseN > 0)) || (l.drawn.trim() && !(drawnN > 0))
    const valid = named && (doseN > 0 || drawnN > 0) && !bad
    const empty = !l.pick && !l.name.trim() && !l.dose.trim() && !l.drawn.trim()
    return { l, g, compound, doseN, drawnN, valid, empty, unit: editing ? l.unit : (compound?.unit ?? l.unit) }
  })
  const used = resolved.filter((r) => !r.empty)
  const canSave = used.length > 0 && used.every((r) => r.valid)
  const sy = SYRINGES.find((x) => x.value === syringe)
  const drawnAs = (r: (typeof resolved)[number]) => (r.drawnN > 0 ? `${r.l.drawn.trim().replace(',', '.')} ${marks}` : undefined)
  const noteFor = (vial: string) => [notes.trim(), sy && `Syringe: ${sy.label}`, vial.trim() && `Vial: ${vial.trim()}`].filter(Boolean).join('\n') || undefined

  async function save() {
    const takenAt = when.toISOString()
    const shared = {
      takenAt,
      // An Oral or Other shot shows as IM here: it keeps its own route unless you pick one
      route: edit && routeOf(edit) === route ? edit.route : route,
      // One spelling per spot, whatever was typed: "lat r" is saved as "Lats R"
      site: site.trim() ? canonicalSite(site) : undefined,
      needle: needle.trim() || undefined,
    }
    if (editing && edit) {
      const r = resolved[0]
      // A drawn amount the logger can't read (older entries) is kept unless you typed a new one
      const keepRaw = !!edit.vialAmount && !/^[\d.,]+\s*(units|mL)$/i.test(edit.vialAmount.trim()) && !r.l.drawn.trim()
      await db.injections.update(id!, {
        ...shared,
        dose: r.doseN > 0 ? r.doseN : undefined,
        // An imported dose text wins over the number on the Timeline, so it goes once the dose is changed
        ...(r.l.dose !== loadedDose.current && { rawDose: undefined }),
        vialAmount: keepRaw ? edit.vialAmount : drawnAs(r),
        notes: noteFor(r.l.vial),
      })
      return
    }
    const colours = compounds.map((c) => c.color).filter(Boolean)
    const made = new Map<string, number>()
    for (const r of used) {
      const memory = { defaultRoute: route, ...(r.doseN > 0 && { lastDose: r.doseN }), ...(syringe && { syringe }) }
      let compoundId: number
      if (r.compound?.id !== undefined) {
        compoundId = r.compound.id
        await db.compounds.update(compoundId, memory)
      } else if (made.has(compoundKey(r.l.name))) compoundId = made.get(compoundKey(r.l.name))!
      else {
        const color = randomDistinctColor(colours)
        colours.push(color)
        compoundId = (await db.compounds.add({
          name: r.l.name.trim(),
          category: 'Other',
          defaultDose: r.doseN > 0 ? r.doseN : 0,
          unit: r.l.unit,
          schedule: 'As needed',
          color,
          ...memory,
        })) as number
        made.set(compoundKey(r.l.name), compoundId)
      }
      // Written directly, one row per compound in the syringe (never logInjection: it carries the vial maths)
      await db.injections.add({
        compoundId,
        ...shared,
        ...(r.doseN > 0 && { dose: r.doseN }),
        unit: r.unit,
        // what you drew, with the marks you read it in: "25 units", "0.25 mL"
        ...(r.drawnN > 0 && { vialAmount: drawnAs(r) }),
        notes: noteFor(r.l.vial),
      })
    }
    // The check-in rides along at the same moment, only when something was rated
    if ([...POSITIVE, ...NEGATIVE].some((d) => ratingOf(feel, d) !== undefined))
      await db.symptoms.add({ recordedAt: takenAt, ...feel, notes: notes.trim() || undefined } as Symptom)
  }

  const chips = [...groups.map((g) => ({ value: g.key, label: g.name, dot: g.color })), { value: NEW, label: '+ New' }]
  const several = lines.length > 1
  const needles = NEEDLES[sy?.marks ?? marks]

  return (
    <LogForm
      canSave={canSave}
      onSave={save}
      dirty={dirty}
      loading={!ready}
      title={editing ? 'Edit injection' : undefined}
      archive={editing ? { table: 'injections', id: id! } : undefined}
    >
      <Section title="Route">
        <Segmented value={route} onChange={changeRoute} options={[{ value: 'IM', label: 'Intramuscular' }, { value: 'SubQ', label: 'Subcutaneous' }]} />
      </Section>

      <Section title={several ? 'Compounds (one syringe)' : 'Compound'}>
        {resolved.map((r, n) => (
          <CompoundLine
            key={r.l.key}
            r={r}
            chips={chips}
            fixedName={editing ? editName : undefined}
            card={several}
            first={n === 0}
            marks={marks}
            onMarks={setMarks}
            onChoose={(k) => choose(r.l, k)}
            onChange={(patch) => update(r.l.key, patch)}
            onRemove={several ? () => setLines((prev) => prev.filter((x) => x.key !== r.l.key)) : undefined}
          />
        ))}
        {editing ? null : (
          <Pressable onPress={() => setLines((prev) => [...prev, blank()])} accessibilityRole="button" style={({ pressed }) => [l.add, pressed && { opacity: 0.7 }]}>
            <SymbolView name="plus" tintColor={C.accentInk} size={14} />
            <Text style={l.addText}>Add a compound (same syringe)</Text>
          </Pressable>
        )}
      </Section>

      <Section title="Syringe">
        <Chips
          options={SYRINGES}
          value={syringe}
          clearable
          onChange={(v) => {
            setSyringe(v)
            const next = SYRINGES.find((x) => x.value === v)
            if (next) setMarks(next.marks)
          }}
        />
      </Section>

      <Section title="Needle">
        <Chips options={needles.map((n) => ({ value: n, label: n }))} value={needles.includes(needle) ? needle : undefined} onChange={(v) => setNeedle(v ?? '')} clearable />
        <Input placeholder="Or type it, e.g. 25G 1 in (optional)" value={needles.includes(needle) ? '' : needle} onChangeText={setNeedle} autoCorrect={false} />
      </Section>

      <Section title="Site">
        <SitePicker route={route} value={site} injections={injections} onChange={setSite} />
      </Section>

      <When value={when} onChange={setWhen} />

      {editing ? null : (
        <View style={{ gap: 12 }}>
          <Pressable onPress={() => setFeelOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: feelOpen }} style={l.feelHead} hitSlop={8}>
            <SymbolView name={feelOpen ? 'chevron.up' : 'chevron.down'} tintColor={C.muted} size={12} />
            <Eyebrow>How do you feel?</Eyebrow>
            <Text style={kit.hint}>(optional)</Text>
          </Pressable>
          {feelOpen ? (
            <Card style={{ gap: 22 }}>
              <Text style={kit.hint}>Tap a number to rate, tap it again to clear. Anything left blank counts as fine. Saved as a check-in at the same time.</Text>
              <Section title="Feeling good">
                {POSITIVE.map((d) => <Scale key={d.key} def={d} value={ratingOf(feel, d)} onChange={(v) => setFeel((f) => withRating(f, d, v))} />)}
              </Section>
              <Section title="To watch">
                {NEGATIVE.map((d) => <Scale key={d.key} def={d} value={ratingOf(feel, d)} onChange={(v) => setFeel((f) => withRating(f, d, v))} />)}
              </Section>
            </Card>
          ) : null}
        </View>
      )}

      <Section title="Notes">
        <Input placeholder="Optional" value={notes} onChangeText={setNotes} multiline />
      </Section>
    </LogForm>
  )
}

type Resolved = { l: Line; compound?: Compound; unit: Unit }

/** One compound in the syringe: which one, the dose as given, what you drew, and its vial. */
function CompoundLine({ r, chips, fixedName, card, first, marks, onMarks, onChoose, onChange, onRemove }: {
  r: Resolved
  chips: { value: string; label: string; dot?: string }[]
  /** Editing a saved shot: the compound stays as it was */
  fixedName?: string
  card: boolean
  first: boolean
  marks: Mark
  onMarks: (m: Mark) => void
  onChoose: (key: string | undefined) => void
  onChange: (patch: Partial<Line>) => void
  onRemove?: () => void
}) {
  const { l: line, compound, unit } = r
  const hasChips = chips.length > 1
  const typing = !fixedName && (line.pick === NEW || !hasChips)
  const body = (
    <View style={{ gap: 14 }}>
      {onRemove ? (
        <View style={l.lineHead}>
          <Eyebrow>{first ? 'First compound' : 'Also in this syringe'}</Eyebrow>
          <Pressable onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove this compound">
            <Text style={l.remove}>Remove</Text>
          </Pressable>
        </View>
      ) : null}
      {fixedName ? (
        <View style={l.fixed}>
          <Text style={l.fixedName}>{fixedName}</Text>
          <Text style={kit.hint}>The compound of a saved shot stays as it is. To change it, archive this one and log it again.</Text>
        </View>
      ) : hasChips ? (
        <Chips options={chips} value={line.pick} onChange={onChoose} />
      ) : null}
      {typing ? (
        <>
          <Input
            autoFocus={hasChips || first}
            placeholder="Name, e.g. Testosterone cypionate"
            value={line.name}
            onFocus={() => line.pick !== NEW && onChoose(NEW)}
            onChangeText={(name) => onChange({ name, pick: NEW })}
            autoCapitalize="words"
            autoCorrect={false}
            spellCheck={false}
          />
          {compound ? (
            <Text style={kit.hint}>You already have {compound.name}: this shot goes with it.</Text>
          ) : (
            <Chips options={UNITS} value={line.unit} onChange={(u) => u && onChange({ unit: u })} />
          )}
        </>
      ) : null}

      <Section title="Dose" hint={first ? 'As your prescriber or plan gives it.' : undefined}>
        <Input keyboardType="decimal-pad" placeholder="Amount" suffix={unitLabel(unit)} value={line.dose} onChangeText={(dose) => onChange({ dose })} accessibilityLabel={`Dose in ${unitLabel(unit)}`} />
      </Section>

      <Drawn value={line.drawn} onChange={(drawn) => onChange({ drawn })} marks={marks} onMarks={onMarks} />

      <Section title="Vial">
        <Input placeholder="Optional, e.g. 250 mg/mL, or 10 mg + 2 mL water" value={line.vial} onChangeText={(vial) => onChange({ vial })} autoCorrect={false} />
      </Section>
    </View>
  )
  return card ? <Card>{body}</Card> : body
}

/** What you drew into the syringe, in the marks you read: kept apart from the dose, never worked out from it. */
function Drawn({ value, onChange, marks, onMarks }: { value: string; onChange: (v: string) => void; marks: Mark; onMarks: (m: Mark) => void }) {
  return (
    <Section title="Drawn">
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Input keyboardType="decimal-pad" placeholder="Optional" value={value} onChangeText={onChange} accessibilityLabel={`Amount drawn in ${marks}`} />
        </View>
        <View style={{ width: 150 }}>
          <Segmented value={marks} onChange={onMarks} options={[{ value: 'units', label: 'units' }, { value: 'mL', label: 'mL' }]} />
        </View>
      </View>
    </Section>
  )
}

const l = StyleSheet.create({
  add: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 999, borderWidth: 1, borderColor: C.input, borderStyle: 'dashed',
  },
  addText: { fontFamily: F.semi, fontSize: 15, color: C.accentInk },
  lineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  remove: { fontFamily: F.semi, fontSize: 14, color: C.danger },
  fixed: { gap: 4 },
  fixedName: { fontFamily: F.semi, fontSize: 19, color: C.fg, letterSpacing: -0.2 },
  feelHead: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
})
