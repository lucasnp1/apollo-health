import { useMemo, useRef, useState } from 'react'
import { type BodyMetric, db } from '@shared/lib/db'
import { useBodyMetrics, useInjections } from '@/data/useLog'
import { Input, Section, When } from '@/kit'
import { pushWeight } from '@/health'
import { LogForm, num } from '@/LogForm'
import { useDirty, useEditRow } from '@/logging/useEntry'
import { showWeight, toKg, useUnits, weightText } from '@/units'

export default function LogWeight() {
  const bodyMetrics = useBodyMetrics()
  const injections = useInjections()
  const u = useUnits()
  const [weight, setWeight] = useState('')
  // The saved kg and how it showed: saved again unchanged, it keeps the exact kg (no lb round trip drift)
  const loaded = useRef<{ text: string; kg: number } | undefined>(undefined)
  const [notes, setNotes] = useState('')
  const [when, setWhen] = useState(() => new Date())
  const { id, ready } = useEditRow(
    (rowId) => bodyMetrics.find((r) => r.id === rowId) ?? db.bodyMetrics.get(rowId),
    (b: BodyMetric) => {
      const text = b.weightKg !== undefined ? String(showWeight(b.weightKg, u)) : ''
      if (b.weightKg !== undefined) loaded.current = { text, kg: b.weightKg }
      setWeight(text)
      setNotes(b.notes ?? '')
      setWhen(new Date(b.measuredAt))
    },
  )
  const { dirty } = useDirty({ weight, notes, when }, ready)
  // The last weight from either place it's kept, as the web's AddWeight shows it
  const last = useMemo(() => {
    let best = -Infinity
    let kg: number | undefined
    for (const b of bodyMetrics) if (b.id !== id && b.weightKg !== undefined && Date.parse(b.measuredAt) > best) [best, kg] = [Date.parse(b.measuredAt), b.weightKg]
    for (const i of injections) if (i.weightKg !== undefined && Date.parse(i.takenAt) > best) [best, kg] = [Date.parse(i.takenAt), i.weightKg]
    return kg
  }, [bodyMetrics, injections, id])
  const kg = loaded.current?.text === weight ? loaded.current.kg : toKg(num(weight), u)
  const ok = kg > 0 && kg < 500

  async function save() {
    const row = { measuredAt: when.toISOString(), weightKg: kg, notes: notes.trim() || undefined }
    if (id !== undefined) {
      await db.bodyMetrics.update(id, row)
      void pushWeight(id)
    } else void pushWeight(await db.bodyMetrics.add({ ...row, source: 'manual' }))
  }

  return (
    <LogForm
      canSave={ok}
      onSave={save}
      dirty={dirty}
      loading={!ready}
      title={id !== undefined ? 'Edit weight' : undefined}
      archive={id !== undefined ? { table: 'bodyMetrics', id } : undefined}
    >
      <Section title="Body weight" hint={last !== undefined && id === undefined ? `Last logged: ${weightText(last, u)}` : undefined}>
        <Input
          autoFocus={id === undefined}
          keyboardType="decimal-pad"
          suffix={u.weight}
          placeholder={last !== undefined ? String(showWeight(last, u)) : u.weight === 'lb' ? 'e.g. 182' : 'e.g. 82.5'}
          value={weight}
          onChangeText={setWeight}
          accessibilityLabel={`Body weight in ${u.weight === 'lb' ? 'pounds' : 'kilograms'}`}
        />
      </Section>
      <When value={when} onChange={setWhen} />

      <Section title="Notes">
        <Input placeholder="Optional" value={notes} onChangeText={setNotes} multiline />
      </Section>
    </LogForm>
  )
}
