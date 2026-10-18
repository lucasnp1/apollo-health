// How you feel, on the web's 0-5 scales. Rate what applies; blank means fine. "Track something else" adds your own,
// as the web's WellbeingCard does: each rating carries its own name and direction, so no list is kept anywhere.
import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { db, type Symptom } from '@shared/lib/db'
import { ALL_SYMPTOMS, customDefs, customKey, NEGATIVE, POSITIVE, ratingOf, type SymptomDef, withRating } from '@shared/lib/symptoms'
import { useSymptoms } from '@/data/useLog'
import { Input, Pill, Section, Segmented, When } from '@/kit'
import { LogForm } from '@/LogForm'
import { Scale } from '@/logging/Scale'
import { useDirty, useEditRow } from '@/logging/useEntry'
import { C, F } from '@/theme'

/** Only the ratings of a saved check-in, without its id and sync fields. */
function ratingsOf(row: Symptom): Partial<Symptom> {
  const out: Partial<Symptom> = {}
  for (const d of ALL_SYMPTOMS) {
    const v = ratingOf(row, d)
    if (v !== undefined) Object.assign(out, { [d.key]: v })
  }
  if (row.extras && Object.keys(row.extras).length) out.extras = { ...row.extras }
  return out
}

export default function LogCheckIn() {
  const symptoms = useSymptoms()
  const [draft, setDraft] = useState<Partial<Symptom>>({})
  const [notes, setNotes] = useState('')
  const [when, setWhen] = useState(() => new Date())
  const [newLabel, setNewLabel] = useState('')
  const [newDir, setNewDir] = useState<'positive' | 'negative'>('negative')
  const { id, ready } = useEditRow(
    (rowId) => db.symptoms.get(rowId),
    (row: Symptom) => {
      setDraft(ratingsOf(row))
      setNotes(row.notes ?? '')
      setWhen(new Date(row.recordedAt))
    },
  )
  const { dirty } = useDirty({ draft, notes, when }, ready)

  // Your own symptoms: every one you have rated before, plus any added in this check-in
  const customs = useMemo(() => customDefs([...symptoms, draft]), [symptoms, draft])
  const allDefs = useMemo(() => [...ALL_SYMPTOMS, ...customs], [customs])
  const rated = allDefs.some((d) => ratingOf(draft, d) !== undefined)
  const row = (d: SymptomDef) => <Scale key={d.key} def={d} value={ratingOf(draft, d)} onChange={(v) => setDraft((f) => withRating(f, d, v))} />

  function addCustom() {
    const label = newLabel.trim()
    const key = customKey(label)
    setNewLabel('')
    if (!key || allDefs.some((d) => d.key === key || d.label.toLowerCase() === label.toLowerCase())) return
    // Rated 0 so it shows straight away with a value you can change
    setDraft((f) => withRating(f, { key, label, direction: newDir, custom: true }, 0))
  }

  async function save() {
    const recordedAt = when.toISOString()
    if (id === undefined) return db.symptoms.add({ recordedAt, ...draft, notes: notes.trim() || undefined } as Symptom)
    // Every built-in rating is written, so one cleared here is cleared in the saved row too
    const cleared = Object.fromEntries(ALL_SYMPTOMS.map((d) => [d.key, undefined]))
    return db.symptoms.update(id, { ...cleared, extras: undefined, ...draft, recordedAt, notes: notes.trim() || undefined })
  }

  return (
    <LogForm
      canSave={rated}
      onSave={save}
      dirty={dirty}
      loading={!ready}
      title={id !== undefined ? 'Edit check-in' : undefined}
      archive={id !== undefined ? { table: 'symptoms', id } : undefined}
    >
      <Text style={k.lead}>Rate anything that applies and leave the rest blank. 0 means none at all.</Text>
      <Section title="Feeling good">{[...POSITIVE, ...customs.filter((d) => d.direction === 'positive')].map(row)}</Section>
      <Section title="To watch">{[...NEGATIVE, ...customs.filter((d) => d.direction === 'negative')].map(row)}</Section>

      <Section title="Track something else" hint={'"Watch" means a high number is bad, like acne. "Good" means a high number is good, like energy.'}>
        <Input
          placeholder="e.g. Anxiety, Pumps, Appetite"
          value={newLabel}
          onChangeText={setNewLabel}
          onSubmitEditing={addCustom}
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          autoCapitalize="sentences"
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Segmented value={newDir} onChange={setNewDir} options={[{ value: 'negative', label: 'Watch' }, { value: 'positive', label: 'Good' }]} />
          </View>
          <Pill label="+ Add" primary={!!newLabel.trim()} onPress={addCustom} />
        </View>
      </Section>

      <When value={when} onChange={setWhen} />

      <Section title="Notes">
        <Input placeholder="Optional" value={notes} onChangeText={setNotes} multiline />
      </Section>
    </LogForm>
  )
}

const k = { lead: { fontFamily: F.body, fontSize: 15, color: C.muted, lineHeight: 21 } } as const
