// Log a shot, exactly as given. Nothing is worked out for you: the dose and what you drew are two separate fields,
// saved as typed, and the app never converts one into the other, suggests a syringe or marks a draw (Apple 1.4.2
// treats that as a dosage calculator; decided 18 Oct 2026, docs/decisions.md). The web's maths (src/lib/dose.ts) is
// kept out of this bundle by metro.config.js. A better way to help with the draw can replace <Drawn> later.
// As on the web: several compounds can share one syringe (one row each, same moment), a check-in can ride along, and
// opening the logger brings back the last syringe you used on the route. With an `id` param it edits that shot.
import { SymbolView } from 'expo-symbols'
import { useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { type CompoundGroup, compoundKey, findCompoundByName, groupByCompoundId } from '@shared/lib/compounds'
import { type Compound, db, type InjectionLog, type Symptom, type SyringeKey, type Unit } from '@shared/lib/db'
import { canonicalSite, type Route } from '@shared/lib/sites'
import { NEGATIVE, POSITIVE, ratingOf, withRating } from '@shared/lib/symptoms'
import { useCompounds, useInjections } from '@/data/useLog'
import { Button, Card, Eyebrow, FieldRow, Input, MenuPicker, s as kit, Section, Segmented, When } from '@/kit'
import { LogForm, num } from '@/LogForm'
import { Scale } from '@/logging/Scale'
import { SitePicker } from '@/logging/SitePicker'
import { blank, type Line, lineFor, type Mark, NEEDLES, NEW, noteLine, type Prefill, prefillFor, sortedGroups, stripLines, SYRINGES } from '@/logging/injectionDraft'
import { useDirty, useEditRow } from '@/logging/useEntry'
import { C, F } from '@/theme'
import { addCompound, routeOf, unitLabel, usedColours } from '@/log'
import { isAncillary } from '@/timeline'

const NONE = ''
const OTHER = '__other'
const UNITS: { value: Unit; label: string }[] = [
  { value: 'mg', label: 'mg' },
  { value: 'mcg', label: 'mcg' },
  { value: 'iu', label: 'IU' },
  { value: 'ml', label: 'mL' },
]

export default function LogInjection() {
  const compounds = useCompounds()
  const all = useInjections()
  // Ancillaries (pills, creams) have their own sheet: they never count as a shot here
  const injections = useMemo(() => all.filter((i) => !isAncillary(i)), [all])
  const groups = useMemo(() => sortedGroups(compounds, injections), [compounds, injections])

  // A new shot opens on the last syringe you used: IM unless you only ever log SubQ, as on the web. The stores fill
  // before the app shows, so this is there on the first frame. Editing replaces it with the saved shot.
  const [start] = useState(() => {
    const r: Route = injections.some((i) => routeOf(i) === 'IM') || !injections.length ? 'IM' : 'SubQ'
    return { r, p: prefillFor(r, groups, injections) }
  })
  const [route, setRoute] = useState<Route>(start.r)
  const [lines, setLines] = useState<Line[]>(start.p.lines)
  const [marks, setMarks] = useState<Mark>(start.p.marks ?? 'mL')
  const [syringe, setSyringe] = useState<SyringeKey | undefined>(start.p.syringe)
  const [needle, setNeedle] = useState(start.p.needle)
  const [needleOther, setNeedleOther] = useState(false)
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
    (rowId) => all.find((r) => r.id === rowId) ?? db.injections.get(rowId),
    (row: InjectionLog) => {
      const drawn = row.vialAmount?.trim().match(/^([\d.,]+)\s*(units|mL)$/i)
      const sy = SYRINGES.find((x) => x.label === noteLine(row.notes, 'Syringe'))
      const dose = row.dose != null ? String(row.dose) : ''
      loadedDose.current = dose
      setEdit(row)
      // An archived compound is not in the live list: read it from the database
      const c = compounds.find((x) => x.id === row.compoundId)
      if (c) setEditName(c.name)
      else void db.compounds.get(row.compoundId).then((x) => x && setEditName(x.name))
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
  const { dirty } = useDirty({ route, lines: lines.map(({ key: _key, ...rest }) => rest), marks, syringe, needle, site, notes, when, feel }, ready)

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
    const colours = usedColours(compounds)
    const made = new Map<string, number>()
    for (const r of used) {
      const memory = { defaultRoute: route, ...(r.doseN > 0 && { lastDose: r.doseN }), ...(syringe && { syringe }) }
      let compoundId: number
      if (r.compound?.id !== undefined) {
        compoundId = r.compound.id
        await db.compounds.update(compoundId, memory)
      } else if (made.has(compoundKey(r.l.name))) compoundId = made.get(compoundKey(r.l.name))!
      else {
        compoundId = await addCompound({ name: r.l.name, category: 'Other', defaultDose: r.doseN > 0 ? r.doseN : 0, unit: r.l.unit, ...memory }, colours)
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

  // Only compounds that belong on this route: ones you've injected this way, set to it, or never injected yet
  const options = useMemo(() => {
    const on = new Set<number>()
    const any = new Set<number>()
    for (const i of injections) {
      any.add(i.compoundId)
      if (routeOf(i) === route) on.add(i.compoundId)
    }
    const fits = (g: CompoundGroup) =>
      g.ids.some((x) => on.has(x)) || g.canonical.defaultRoute === route ||
      (!g.ids.some((x) => any.has(x)) && g.canonical.category !== 'Ancillary' && g.canonical.category !== 'Supplement')
    return groups.filter(fits).map((g) => ({ value: g.key, label: g.name }))
  }, [groups, injections, route])
  // Per compound: what you did last time on this route (to read back, never to work anything out) and the vials you've used
  const history = useMemo(() => {
    const byId = groupByCompoundId(groups)
    const out = new Map<string, { last?: string; vials: string[] }>()
    // one pass, newest first: the first shot on this route is "last time", every vial note counts once
    for (const i of injections) {
      const g = byId.get(i.compoundId)
      if (!g) continue
      let h = out.get(g.key)
      if (!h) out.set(g.key, (h = { vials: [] }))
      const vial = noteLine(i.notes, 'Vial')
      if (vial && !h.vials.includes(vial)) h.vials.push(vial)
      if (h.last === undefined && routeOf(i) === route && i.id !== id) {
        const dose = i.rawDose ?? (i.dose != null ? `${i.dose} ${unitLabel(i.unit)}` : '')
        h.last = [dose, i.vialAmount && `drew ${i.vialAmount}`, vial].filter(Boolean).join(', ')
      }
    }
    return out
  }, [groups, injections, route, id])
  const several = lines.length > 1
  const needles = NEEDLES[sy?.marks ?? marks]
  // Needles you typed before show in the menu too
  const myNeedles = useMemo(() => [...new Set(injections.map((i) => i.needle?.trim()).filter((n): n is string => !!n && !needles.includes(n)))], [injections, needles])
  const needleOptions = [...needles, ...myNeedles]
  const typingNeedle = needleOther || (!!needle && !needleOptions.includes(needle))

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

      <Section title={several ? 'Compounds (one syringe)' : 'What you injected'}>
        {resolved.map((r, n) => (
          <CompoundLine
            key={r.l.key}
            r={r}
            options={options}
            history={r.g ? history.get(r.g.key) : undefined}
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
          <Button kind="add" icon="plus" label="Add a compound (same syringe)" onPress={() => setLines((prev) => [...prev, blank()])} />
        )}
      </Section>

      <Section title="Syringe and needle">
        <FieldRow label="Syringe">
          <MenuPicker
            value={syringe ?? NONE}
            options={[{ value: NONE, label: 'Not noted' }, ...SYRINGES.map((x) => ({ value: x.value as string, label: x.label }))]}
            onChange={(v) => {
              const next = SYRINGES.find((x) => x.value === v)
              setSyringe(next?.value)
              if (next) setMarks(next.marks)
            }}
          />
        </FieldRow>
        <FieldRow label="Needle">
          <MenuPicker
            value={typingNeedle ? OTHER : needle || NONE}
            options={[{ value: NONE, label: 'Not noted' }, ...needleOptions.map((n) => ({ value: n, label: n })), { value: OTHER, label: 'Other…' }]}
            onChange={(v) => {
              setNeedleOther(v === OTHER)
              setNeedle(v === OTHER || v === NONE ? '' : v)
            }}
          />
        </FieldRow>
        {typingNeedle ? <Input autoFocus={needleOther && !needle} placeholder="Needle, e.g. 25G 1 in" value={needle} onChangeText={setNeedle} autoCorrect={false} /> : null}
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

type Resolved = { l: Line; g?: CompoundGroup; compound?: Compound; unit: Unit }

/** One compound in the syringe: which one, the dose as given, what you drew, and its vial. */
function CompoundLine({ r, options, history, fixedName, card, first, marks, onMarks, onChoose, onChange, onRemove }: {
  r: Resolved
  options: { value: string; label: string }[]
  history?: { last?: string; vials: string[] }
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
  const hasOptions = options.length > 0
  const typing = !fixedName && (line.pick === NEW || !hasOptions)
  const vials = history?.vials ?? []
  const typingVial = !!line.vialNew || (!!line.vial && !vials.includes(line.vial))
  const body = (
    <View style={{ gap: 12 }}>
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
      ) : hasOptions ? (
        <FieldRow label="Compound">
          <MenuPicker
            value={line.pick ?? NONE}
            options={[...(line.pick ? [] : [{ value: NONE, label: 'Choose' }]), ...options, { value: NEW, label: 'New compound…' }]}
            onChange={(v) => v !== NONE && onChoose(v)}
          />
        </FieldRow>
      ) : null}
      {typing ? (
        <>
          <Input
            autoFocus={hasOptions || first}
            placeholder="Name, e.g. Testosterone cypionate"
            value={line.name}
            onChangeText={(name) => onChange({ name, pick: NEW })}
            autoCapitalize="words"
            autoCorrect={false}
            spellCheck={false}
          />
          {compound ? (
            <Text style={kit.hint}>You already have {compound.name}: this shot goes with it.</Text>
          ) : (
            <Segmented value={line.unit} onChange={(u) => onChange({ unit: u })} options={UNITS} />
          )}
        </>
      ) : null}

      <Section title="Dose" hint={history?.last ? `Last time on this route: ${history.last}` : first ? 'As your prescriber or plan gives it.' : undefined}>
        <Input keyboardType="decimal-pad" placeholder="Amount" suffix={unitLabel(unit)} value={line.dose} onChangeText={(dose) => onChange({ dose })} accessibilityLabel={`Dose in ${unitLabel(unit)}`} />
      </Section>

      <Drawn value={line.drawn} onChange={(drawn) => onChange({ drawn })} marks={marks} onMarks={onMarks} />

      <FieldRow label="Vial">
        <MenuPicker
          value={typingVial ? OTHER : line.vial || NONE}
          options={[{ value: NONE, label: 'Not noted' }, ...vials.map((v) => ({ value: v, label: v })), { value: OTHER, label: 'New vial…' }]}
          onChange={(v) => onChange(v === OTHER ? { vialNew: true, vial: '' } : { vialNew: false, vial: v === NONE ? '' : v })}
        />
      </FieldRow>
      {typingVial ? (
        <Input autoFocus={!!line.vialNew && !line.vial} placeholder="e.g. 250 mg/mL, or 10 mg + 2 mL water" value={line.vial} onChangeText={(vial) => onChange({ vial })} autoCorrect={false} accessibilityLabel="New vial" />
      ) : null}
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
  lineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  remove: { fontFamily: F.semi, fontSize: 14, color: C.danger },
  fixed: { gap: 4 },
  fixedName: { fontFamily: F.semi, fontSize: 19, color: C.fg, letterSpacing: -0.2 },
  feelHead: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
})
