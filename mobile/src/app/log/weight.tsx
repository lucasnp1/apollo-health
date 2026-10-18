import { useMemo, useState } from 'react'
import { type BodyMetric, db } from '@shared/lib/db'
import { useBodyMetrics, useInjections } from '@/data/useLog'
import { Input, Section, When } from '@/kit'
import { pushWeight } from '@/health'
import { LogForm, num } from '@/LogForm'
import { useDirty, useEditRow } from '@/logging/useEntry'

export default function LogWeight() {
  const bodyMetrics = useBodyMetrics()
  const injections = useInjections()
  const [weight, setWeight] = useState('')
  const [notes, setNotes] = useState('')
  const [when, setWhen] = useState(() => new Date())
  const { id, ready } = useEditRow(
    (rowId) => db.bodyMetrics.get(rowId),
    (b: BodyMetric) => {
      setWeight(b.weightKg !== undefined ? String(b.weightKg) : '')
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
  const kg = num(weight)
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
      <Section title="Body weight" hint={last !== undefined && id === undefined ? `Last logged: ${last} kg` : undefined}>
        <Input autoFocus={id === undefined} keyboardType="decimal-pad" suffix="kg" placeholder={last !== undefined ? String(last) : 'e.g. 82.5'} value={weight} onChangeText={setWeight} accessibilityLabel="Body weight in kilograms" />
      </Section>
      <When value={when} onChange={setWhen} />

      <Section title="Notes">
        <Input placeholder="Optional" value={notes} onChangeText={setNotes} multiline />
      </Section>
    </LogForm>
  )
}
