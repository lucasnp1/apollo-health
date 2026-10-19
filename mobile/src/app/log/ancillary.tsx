// Ancillaries: what you take to handle side effects (an AI, cabergoline, finasteride, a cream...). Saved as an
// injections row with route Oral (a pill) or Other (a cream, a spray), so it syncs with the web as any dose does, and
// the compound as category Ancillary. What it was for (a side effect from the check-in list) is a "For:" line under the
// note, as syringe and vial are; the Wellbeing widget shows these next to the side-effect line.
import { useMemo, useState } from 'react'
import { compoundGroups, findCompoundByName, randomDistinctColor } from '@shared/lib/compounds'
import { db, type InjectionLog, type Unit } from '@shared/lib/db'
import { customDefs, NEGATIVE } from '@shared/lib/symptoms'
import { useCompounds, useInjections, useSymptoms } from '@/data/useLog'
import { Chips, Input, Section, Segmented, When } from '@/kit'
import { LogForm, num } from '@/LogForm'
import { useDirty, useEditRow } from '@/logging/useEntry'
import { isAncillary } from '@/timeline'

const NEW = '__new'
const UNITS: { value: Unit; label: string }[] = [
  { value: 'mg', label: 'mg' },
  { value: 'mcg', label: 'mcg' },
  { value: 'tablet', label: 'tablet' },
  { value: 'capsule', label: 'capsule' },
  { value: 'ml', label: 'mL' },
]
type Form = 'Oral' | 'Other'

/** Split a saved note into the person's own text and the "For:" line. */
function splitNote(notes?: string): { text: string; forList: string[] } {
  const lines = (notes ?? '').split('\n')
  const f = lines.find((l) => l.startsWith('For: '))
  return { text: lines.filter((l) => l !== f).join('\n').trim(), forList: f ? f.slice(5).split(', ').filter(Boolean) : [] }
}

export default function LogAncillary() {
  const compounds = useCompounds()
  const injections = useInjections()
  const symptoms = useSymptoms()
  const [pick, setPick] = useState<string | undefined>()
  const [name, setName] = useState('')
  const [dose, setDose] = useState('')
  const [unit, setUnit] = useState<Unit>('mg')
  const [form, setForm] = useState<Form>('Oral')
  const [forList, setForList] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [when, setWhen] = useState(() => new Date())
  const { id, ready } = useEditRow(
    (rowId) => db.injections.get(rowId),
    (row: InjectionLog) => {
      setPick(String(row.compoundId))
      setDose(row.dose != null ? String(row.dose) : (row.rawDose ?? ''))
      setUnit(row.unit)
      setForm(row.route === 'Other' ? 'Other' : 'Oral')
      const n = splitNote(row.notes)
      setNotes(n.text)
      setForList(n.forList)
      setWhen(new Date(row.takenAt))
    },
  )
  const { dirty } = useDirty({ pick, name, dose, unit, form, forList, notes, when }, ready)

  // Ancillaries you have used before, most recent first, then any compound filed as Ancillary or Supplement
  const options = useMemo(() => {
    const used = new Map<number, number>()
    const injected = new Set<number>()
    for (const i of injections)
      if (isAncillary(i)) used.set(i.compoundId, Math.max(used.get(i.compoundId) ?? 0, Date.parse(i.takenAt)))
      else injected.add(i.compoundId)
    // hCG is often filed as an ancillary, but it's a shot: anything you inject stays on the injection sheet
    const list = compounds.filter((c) => c.id !== undefined && !c.archived && (used.has(c.id) || ((c.category === 'Ancillary' || c.category === 'Supplement') && !injected.has(c.id))))
    if (id !== undefined && pick && !list.some((c) => String(c.id) === pick)) {
      const c = compounds.find((x) => String(x.id) === pick)
      if (c) list.push(c)
    }
    return list.sort((a, b) => (used.get(b.id!) ?? 0) - (used.get(a.id!) ?? 0)).map((c) => ({ value: String(c.id), label: c.name, dot: c.color }))
  }, [compounds, injections, id, pick])

  // The side effects you can tick: the built-in ones and any you track yourself
  const sides = useMemo(() => [...NEGATIVE, ...customDefs(symptoms).filter((d) => d.direction === 'negative')].map((d) => d.label), [symptoms])

  // Picking one you've used brings back its last dose and unit
  function choose(v: string | undefined) {
    setPick(v)
    if (!v || v === NEW || id !== undefined) return
    const last = injections.find((i) => String(i.compoundId) === v && isAncillary(i))
    const c = compounds.find((x) => String(x.id) === v)
    if (last?.dose != null) setDose(String(last.dose))
    setUnit(last?.unit ?? c?.unit ?? 'mg')
    if (last) {
      setForm(last.route === 'Other' ? 'Other' : 'Oral')
      setForList(splitNote(last.notes).forList)
    }
  }

  const doseN = num(dose)
  const named = pick === NEW ? !!name.trim() : !!pick
  const ok = named && (!dose.trim() || doseN > 0)

  async function save() {
    const note = [notes.trim(), forList.length && `For: ${forList.join(', ')}`].filter(Boolean).join('\n') || undefined
    const row = {
      takenAt: when.toISOString(),
      route: form,
      dose: doseN > 0 ? doseN : undefined,
      unit,
      notes: note,
    }
    if (id !== undefined) return db.injections.update(id, { ...row, rawDose: undefined })
    let compoundId = pick && pick !== NEW ? Number(pick) : findCompoundByName(compounds, name)?.id
    if (compoundId === undefined)
      compoundId = (await db.compounds.add({
        name: name.trim(),
        category: 'Ancillary',
        defaultDose: doseN > 0 ? doseN : 0,
        unit,
        schedule: 'As needed',
        color: randomDistinctColor(compoundGroups(compounds).map((g) => g.color ?? '').filter(Boolean)),
      })) as number
    return db.injections.add({ compoundId, ...row })
  }

  return (
    <LogForm
      canSave={ok}
      onSave={save}
      dirty={dirty}
      loading={!ready}
      title={id !== undefined ? 'Edit ancillary' : undefined}
      archive={id !== undefined ? { table: 'injections', id } : undefined}
    >
      <Section title="What you took" hint={options.length ? undefined : 'For example anastrozole, cabergoline or finasteride.'}>
        {options.length && id === undefined ? (
          <Chips options={[...options, { value: NEW, label: '+ Something else' }]} value={pick} onChange={choose} />
        ) : null}
        {id !== undefined ? (
          <Chips options={options.filter((o) => o.value === pick)} value={pick} onChange={() => {}} />
        ) : pick === NEW || !options.length ? (
          <Input
            autoFocus={!options.length || pick === NEW}
            autoCorrect={false}
            autoCapitalize="words"
            placeholder="Name"
            value={name}
            onChangeText={(t) => {
              setName(t)
              if (!options.length) setPick(NEW)
            }}
            accessibilityLabel="Name of the ancillary"
          />
        ) : null}
      </Section>

      <Section title="Amount" hint="Optional. Saved exactly as you type it.">
        <Input keyboardType="decimal-pad" placeholder="e.g. 0.5" value={dose} onChangeText={setDose} accessibilityLabel="Amount" />
        <Chips options={UNITS} value={unit} onChange={(u) => u && setUnit(u)} />
      </Section>

      <Section title="How">
        <Segmented value={form} onChange={setForm} options={[{ value: 'Oral', label: 'By mouth' }, { value: 'Other', label: 'Other (cream, spray...)' }]} />
      </Section>

      <Section title="Taken for" hint="Optional. The side effects it's meant to help with, so you can see them together on Home.">
        <MultiChips options={sides} value={forList} onChange={setForList} />
      </Section>

      <When value={when} onChange={setWhen} />

      <Section title="Notes">
        <Input placeholder="Optional" value={notes} onChangeText={setNotes} multiline />
      </Section>
    </LogForm>
  )
}

/** Tick any number. */
function MultiChips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const all = [...options, ...value.filter((v) => !options.includes(v))]
  return (
    <Chips
      options={all.map((o) => ({ value: o, label: o }))}
      value={undefined}
      selected={value}
      onChange={(o) => o && onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}
    />
  )
}
