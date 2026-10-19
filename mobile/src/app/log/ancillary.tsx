// Ancillaries: what you take to handle side effects (an AI, cabergoline, finasteride, a cream...). Saved as an
// injections row with route Oral (a pill) or Other (a cream, a spray), so it syncs with the web as any dose does, and
// the compound as category Ancillary. What it was for (a side effect from the check-in list) is a "For:" line under the
// note, as syringe and vial are; the Wellbeing widget shows these next to the side-effect line.
import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { findCompoundByName } from '@shared/lib/compounds'
import { db, type InjectionLog, type Unit } from '@shared/lib/db'
import { customDefs, NEGATIVE } from '@shared/lib/symptoms'
import { useCompounds, useInjections, useSymptoms } from '@/data/useLog'
import { FieldRow, Input, MenuPicker, s as kit, Section, Segmented, When } from '@/kit'
import { LogForm, num } from '@/LogForm'
import { useDirty, useEditRow } from '@/logging/useEntry'
import { addCompound, usedColours } from '@/log'
import { isAncillary } from '@/timeline'

const NEW = '__new'
const OTHER = '__other'
// Why people commonly take an ancillary: a side effect or a marker they're managing. Picking one records it, nothing more.
const REASONS = ['High estradiol', 'Water retention', 'Nipple sensitivity', 'Hair loss', 'Acne', 'High prolactin', 'Blood pressure', 'Cholesterol', 'Liver support', 'Sleep', 'Libido', 'Joint pain', 'Fertility']
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
    (rowId) => injections.find((r) => r.id === rowId) ?? db.injections.get(rowId),
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

  // What it's for: the common reasons, the side effects you track, and any reason you typed before
  const [newReason, setNewReason] = useState(false)
  const reasons = useMemo(() => {
    const typed = injections.filter(isAncillary).flatMap((i) => splitNote(i.notes).forList)
    const sides = [...NEGATIVE, ...customDefs(symptoms).filter((d) => d.direction === 'negative')].map((d) => d.label)
    const all = [...REASONS, ...sides, ...typed, ...forList.filter(() => !newReason)]
    return [...new Map(all.map((r) => [r.toLowerCase(), r])).values()]
  }, [injections, symptoms, forList, newReason])

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
      compoundId = await addCompound({ name, category: 'Ancillary', defaultDose: doseN > 0 ? doseN : 0, unit }, usedColours(compounds))
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
        {options.length ? (
          <FieldRow label="Ancillary">
            {id !== undefined ? (
              <Text style={kit.whenLabel}>{options.find((o) => o.value === pick)?.label ?? ''}</Text>
            ) : (
              <MenuPicker
                value={pick ?? ''}
                options={[...(pick ? [] : [{ value: '', label: 'Choose' }]), ...options, { value: NEW, label: 'Something else…' }]}
                onChange={(v) => v && choose(v)}
              />
            )}
          </FieldRow>
        ) : null}
        {id === undefined && (pick === NEW || !options.length) ? (
          <Input
            autoFocus={!options.length || pick === NEW}
            autoCorrect={false}
            autoCapitalize="words"
            placeholder="Name, e.g. Finasteride"
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
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Input keyboardType="decimal-pad" placeholder="e.g. 0.5" value={dose} onChangeText={setDose} accessibilityLabel="Amount" />
          </View>
          <FieldRow label="Unit">
            <MenuPicker value={unit} options={UNITS} onChange={setUnit} />
          </FieldRow>
        </View>
      </Section>

      <Section title="How">
        <Segmented value={form} onChange={setForm} options={[{ value: 'Oral', label: 'By mouth' }, { value: 'Other', label: 'Other (cream, spray...)' }]} />
      </Section>

      <Section title="Taken for" hint="Optional. Shown next to how you've felt on Home.">
        <FieldRow label="Reason">
          <MenuPicker
            value={newReason ? OTHER : (forList[0] ?? '')}
            options={[{ value: '', label: 'Not noted' }, ...reasons.map((r) => ({ value: r, label: r })), { value: OTHER, label: 'New reason…' }]}
            onChange={(v) => {
              setNewReason(v === OTHER)
              setForList(v && v !== OTHER ? [v] : [])
            }}
          />
        </FieldRow>
        {newReason ? (
          <Input autoFocus placeholder="e.g. Hair loss" value={forList[0] ?? ''} onChangeText={(t) => setForList(t.trim() ? [t] : [])} autoCapitalize="sentences" accessibilityLabel="New reason" />
        ) : null}
      </Section>

      <When value={when} onChange={setWhen} />

      <Section title="Notes">
        <Input placeholder="Optional" value={notes} onChangeText={setNotes} multiline />
      </Section>
    </LogForm>
  )
}
