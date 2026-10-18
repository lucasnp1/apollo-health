import { useRef, useState } from 'react'
import { type TextInput, View } from 'react-native'
import { db, type VitalLog } from '@shared/lib/db'
import { Input, Section, When } from '@/kit'
import { pushBloodPressure } from '@/health'
import { LogForm } from '@/LogForm'
import { useDirty, useEditRow } from '@/logging/useEntry'

export default function LogBP() {
  const [sys, setSys] = useState('')
  const [dia, setDia] = useState('')
  const [pulse, setPulse] = useState('')
  const [notes, setNotes] = useState('')
  const [when, setWhen] = useState(() => new Date())
  const diaRef = useRef<TextInput>(null)
  const pulseRef = useRef<TextInput>(null)
  const { id, ready } = useEditRow(
    (rowId) => db.vitals.get(rowId),
    (v: VitalLog) => {
      setSys(String(v.systolic))
      setDia(String(v.diastolic))
      setPulse(v.pulse ? String(v.pulse) : '')
      setNotes(v.notes ?? '')
      setWhen(new Date(v.measuredAt))
    },
  )
  const { dirty } = useDirty({ sys, dia, pulse, notes, when }, ready)

  async function save() {
    const row = {
      measuredAt: when.toISOString(),
      systolic: Number(sys),
      diastolic: Number(dia),
      pulse: pulse ? Number(pulse) : undefined,
      notes: notes.trim() || undefined,
    }
    if (id !== undefined) {
      await db.vitals.update(id, row)
      void pushBloodPressure(id)
    } else void pushBloodPressure(await db.vitals.add(row))
  }

  // Three digits fill systolic or diastolic, so the next field takes over with the keyboard still up (as on the web).
  // The last value per field is kept in a ref: keys typed fast arrive before a re-render, so render-time values lag.
  const last = useRef<Record<string, string>>({})
  const digits = (key: string, set: (v: string) => void, next?: React.RefObject<TextInput | null>) => (raw: string) => {
    const v = raw.replace(/\D/g, '').slice(0, 3)
    const prev = last.current[key] ?? ''
    last.current[key] = v
    set(v)
    if (next && v.length === 3 && prev.length < 3) next.current?.focus()
  }

  return (
    <LogForm
      canSave={!!sys && !!dia}
      onSave={save}
      dirty={dirty}
      loading={!ready}
      title={id !== undefined ? 'Edit blood pressure' : undefined}
      archive={id !== undefined ? { table: 'vitals', id } : undefined}
    >
      <Section title="Reading">
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Input autoFocus={id === undefined} keyboardType="number-pad" placeholder="120" suffix="sys" value={sys} maxLength={3} onChangeText={digits('sys', setSys, diaRef)} accessibilityLabel="Systolic" />
          </View>
          <View style={{ flex: 1 }}>
            <Input ref={diaRef} keyboardType="number-pad" placeholder="80" suffix="dia" value={dia} maxLength={3} onChangeText={digits('dia', setDia, pulseRef)} accessibilityLabel="Diastolic" />
          </View>
        </View>
        <Input ref={pulseRef} keyboardType="number-pad" placeholder="Pulse (optional)" suffix="bpm" value={pulse} maxLength={3} onChangeText={digits('pulse', setPulse)} accessibilityLabel="Pulse" />
      </Section>
      <When value={when} onChange={setWhen} />

      <Section title="Notes">
        <Input placeholder="Optional" value={notes} onChangeText={setNotes} multiline />
      </Section>
    </LogForm>
  )
}
