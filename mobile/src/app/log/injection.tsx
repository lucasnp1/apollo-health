// Log a shot, exactly as given. Nothing is worked out for you: the dose and what you drew are two separate fields,
// saved as typed, and the app never converts one into the other, suggests a syringe or marks a draw (Apple 1.4.2
// treats that as a dosage calculator; decided 18 Oct 2026, docs/decisions.md). The web's maths (src/lib/dose.ts) is
// kept out of this bundle by metro.config.js. A better way to help with the draw can replace <Drawn> later.
import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { compoundGroups, findCompoundByName, randomDistinctColor } from '@shared/lib/compounds'
import { type Compound, db, type InjectionLog, type SyringeKey, type Unit } from '@shared/lib/db'
import { canonicalSite, quickSites, type Route } from '@shared/lib/sites'
import { useCompounds, useInjections } from '@/data/useLog'
import { Chips, Input, Section, Segmented, s as kit } from '@/kit'
import { LogForm, num } from '@/LogForm'
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

/** Lines this logger adds under your note, so the web shows them too: "Syringe: …", "Vial: …". */
const noteLine = (notes: string | undefined, label: string) => notes?.match(new RegExp(`^${label}: (.*)$`, 'm'))?.[1]

export default function LogInjection() {
  const compounds = useCompounds()
  const injections = useInjections()
  // One chip per drug (sync can leave duplicate rows), most recently used first
  const groups = useMemo(() => {
    const lastAt = new Map<number, string>()
    for (const i of injections) if (!lastAt.has(i.compoundId)) lastAt.set(i.compoundId, i.takenAt)
    const last = (ids: number[]) => ids.map((id) => lastAt.get(id) ?? '').sort().pop() ?? ''
    return compoundGroups(compounds, injections).sort((a, b) => last(b.ids).localeCompare(last(a.ids)))
  }, [compounds, injections])

  const [route, setRoute] = useState<Route>('IM')
  const [pick, setPick] = useState<string | undefined>()
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<Unit>('mg')
  const [dose, setDose] = useState('')
  const [drawn, setDrawn] = useState('')
  const [marks, setMarks] = useState<Mark>('mL')
  const [syringe, setSyringe] = useState<SyringeKey | undefined>()
  const [needle, setNeedle] = useState('')
  const [site, setSite] = useState('')
  const [vial, setVial] = useState('')
  const [notes, setNotes] = useState('')

  const group = groups.find((g) => g.key === pick)
  const compound: Compound | undefined = group?.canonical ?? (pick === NEW && name.trim() ? findCompoundByName(compounds, name) : undefined)
  const doseUnit = compound?.unit ?? unit
  const lastShot: InjectionLog | undefined = group ? injections.find((i) => group.ids.includes(i.compoundId)) : undefined

  /** Picking a compound brings back what you used last time with it: route, dose, syringe, vial. Never a new number. */
  function choose(key: string | undefined) {
    setPick(key)
    const g = groups.find((x) => x.key === key)
    if (!g) return
    const c = g.canonical
    const prev = injections.find((i) => g.ids.includes(i.compoundId))
    if (c.defaultRoute) setRoute(c.defaultRoute)
    const d = c.lastDose ?? prev?.dose
    setDose(d !== undefined ? String(d) : '')
    const sy = SYRINGES.find((x) => x.value === c.syringe)
    setSyringe(sy?.value)
    if (sy) setMarks(sy.marks)
    setVial(noteLine(prev?.notes, 'Vial') ?? '')
  }

  const doseN = num(dose)
  const drawnN = num(drawn)
  const named = pick === NEW ? !!name.trim() : !!group
  const canSave = named && (doseN > 0 || drawnN > 0) && !(dose.trim() && !(doseN > 0)) && !(drawn.trim() && !(drawnN > 0))

  async function save() {
    const sy = SYRINGES.find((x) => x.value === syringe)
    const memory = {
      defaultRoute: route,
      ...(doseN > 0 && { lastDose: doseN }),
      ...(syringe && { syringe }),
    }
    let compoundId: number
    if (compound?.id !== undefined) {
      compoundId = compound.id
      await db.compounds.update(compoundId, memory)
    } else {
      compoundId = (await db.compounds.add({
        name: name.trim(),
        category: 'Other',
        defaultDose: doseN > 0 ? doseN : 0,
        unit,
        schedule: 'As needed',
        color: randomDistinctColor(compounds.map((c) => c.color).filter(Boolean)),
        ...memory,
      })) as number
    }
    const lines = [notes.trim(), sy && `Syringe: ${sy.label}`, vial.trim() && `Vial: ${vial.trim()}`].filter(Boolean)
    await db.injections.add({
      compoundId,
      takenAt: new Date().toISOString(),
      ...(doseN > 0 && { dose: doseN }),
      unit: doseUnit,
      route,
      site: site.trim() ? canonicalSite(site) : undefined,
      // what you drew, with the marks you read it in: "25 units", "0.25 mL"
      ...(drawnN > 0 && { vialAmount: `${drawn.trim().replace(',', '.')} ${marks}` }),
      ...(needle.trim() && { needle: needle.trim() }),
      notes: lines.join('\n') || undefined,
    })
  }

  const chips = [...groups.map((g) => ({ value: g.key, label: g.name, dot: g.color })), { value: NEW, label: '+ New' }]

  return (
    <LogForm canSave={canSave} onSave={save}>
      <Section title="Compound">
        {groups.length ? <Chips options={chips} value={pick} onChange={choose} /> : null}
        {pick === NEW || !groups.length ? (
          <>
            <Input autoFocus placeholder="Name, e.g. Testosterone cypionate" value={name} onFocus={() => setPick(NEW)} onChangeText={setName} autoCapitalize="words" autoCorrect={false} spellCheck={false} />
            {compound ? (
              <Text style={kit.hint}>You already have {compound.name}: this shot goes with it.</Text>
            ) : (
              <Chips options={UNITS} value={unit} onChange={(u) => u && setUnit(u)} />
            )}
          </>
        ) : null}
      </Section>

      <Section title="Route">
        <Segmented
          value={route}
          onChange={setRoute}
          options={[{ value: 'IM', label: 'Intramuscular' }, { value: 'SubQ', label: 'Subcutaneous' }]}
        />
      </Section>

      <Section title="Dose" hint="As your prescriber or plan gives it.">
        <Input keyboardType="decimal-pad" placeholder="Amount" suffix={unitLabel(doseUnit)} value={dose} onChangeText={setDose} accessibilityLabel={`Dose in ${unitLabel(doseUnit)}`} />
      </Section>

      <Drawn value={drawn} onChange={setDrawn} marks={marks} onMarks={setMarks} />

      <Section title="Syringe">
        <Chips
          options={SYRINGES}
          value={syringe}
          clearable
          onChange={(v) => {
            setSyringe(v)
            const sy = SYRINGES.find((x) => x.value === v)
            if (sy) setMarks(sy.marks)
          }}
        />
        <Input placeholder="Needle (optional), e.g. 25G 1 in" value={needle} onChangeText={setNeedle} autoCorrect={false} />
      </Section>

      <Section title="Site" hint={lastShot?.site ? `Last time with this: ${lastShot.site}` : undefined}>
        <Chips options={quickSites(route).map((q) => ({ value: q.site, label: q.site }))} value={canonicalSite(site) || undefined} onChange={(v) => setSite(v ?? '')} clearable />
        <Input placeholder="Or type another site" value={site} onChangeText={setSite} autoCorrect={false} />
      </Section>

      <Section title="Vial">
        <Input placeholder="Optional, e.g. 250 mg/mL, or 10 mg + 2 mL water" value={vial} onChangeText={setVial} autoCorrect={false} />
      </Section>

      <Section title="Notes">
        <Input placeholder="Optional" value={notes} onChangeText={setNotes} multiline />
      </Section>
    </LogForm>
  )
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
