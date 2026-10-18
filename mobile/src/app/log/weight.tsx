import { useMemo, useState } from 'react'
import { db } from '@shared/lib/db'
import { useBodyMetrics, useInjections } from '@/data/useLog'
import { Input, Section } from '@/kit'
import { LogForm, num } from '@/LogForm'

export default function LogWeight() {
  const bodyMetrics = useBodyMetrics()
  const injections = useInjections()
  // The last weight from either place it's kept, as the web's AddWeight shows it
  const last = useMemo(() => {
    let best = -Infinity
    let kg: number | undefined
    for (const b of bodyMetrics) if (b.weightKg !== undefined && Date.parse(b.measuredAt) > best) [best, kg] = [Date.parse(b.measuredAt), b.weightKg]
    for (const i of injections) if (i.weightKg !== undefined && Date.parse(i.takenAt) > best) [best, kg] = [Date.parse(i.takenAt), i.weightKg]
    return kg
  }, [bodyMetrics, injections])
  const [weight, setWeight] = useState('')
  const [notes, setNotes] = useState('')
  const kg = num(weight)
  const ok = kg > 0 && kg < 500

  return (
    <LogForm
      canSave={ok}
      onSave={() => db.bodyMetrics.add({ measuredAt: new Date().toISOString(), source: 'manual', weightKg: kg, notes: notes.trim() || undefined })}
    >
      <Section title="Body weight" hint={last !== undefined ? `Last logged: ${last} kg` : undefined}>
        <Input autoFocus keyboardType="decimal-pad" suffix="kg" placeholder={last !== undefined ? String(last) : 'e.g. 82.5'} value={weight} onChangeText={setWeight} accessibilityLabel="Body weight in kilograms" />
      </Section>
      <Section title="Notes">
        <Input placeholder="Optional" value={notes} onChangeText={setNotes} multiline />
      </Section>
    </LogForm>
  )
}
