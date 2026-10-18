// How you feel, on the web's 0-5 scales. Rate what applies; blank means fine.
import * as Haptics from 'expo-haptics'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { db, type Symptom } from '@shared/lib/db'
import { ALL_SYMPTOMS, chipTone, NEGATIVE, POSITIVE, ratingOf, type SymptomDef, withRating } from '@shared/lib/symptoms'
import { Input, Section, When } from '@/kit'
import { LogForm } from '@/LogForm'
import { C, F, TONE } from '@/theme'

export default function LogCheckIn() {
  const [draft, setDraft] = useState<Partial<Symptom>>({})
  const [notes, setNotes] = useState('')
  const [when, setWhen] = useState(() => new Date())
  const rated = ALL_SYMPTOMS.some((d) => ratingOf(draft, d) !== undefined)
  const row = (d: SymptomDef) => <Scale key={d.key} def={d} value={ratingOf(draft, d)} onChange={(v) => setDraft((f) => withRating(f, d, v))} />

  return (
    <LogForm canSave={rated} onSave={() => db.symptoms.add({ recordedAt: when.toISOString(), ...draft, notes: notes.trim() || undefined } as Symptom)}>
      <Text style={k.lead}>Rate anything that applies and leave the rest blank. 0 means none at all.</Text>
      <Section title="Feeling good">{POSITIVE.map(row)}</Section>
      <Section title="To watch">{NEGATIVE.map(row)}</Section>
      <When value={when} onChange={setWhen} />

      <Section title="Notes">
        <Input placeholder="Optional" value={notes} onChangeText={setNotes} multiline />
      </Section>
    </LogForm>
  )
}

/** The web's SymptomScale: 0 to 5, tap the picked value again to clear it. */
function Scale({ def, value, onChange }: { def: SymptomDef; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={k.label}>{def.label}</Text>
      <View style={k.scale} accessibilityRole="radiogroup" accessibilityLabel={def.label}>
        {[0, 1, 2, 3, 4, 5].map((n) => {
          const on = value === n
          const tone = TONE[on ? chipTone(n, def.direction) : 'neutral']
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${def.label} ${n}`}
              onPress={() => {
                void Haptics.selectionAsync()
                onChange(on ? undefined : n)
              }}
              style={[k.step, on && { borderColor: tone === C.muted ? C.fg : tone, backgroundColor: (tone === C.muted ? C.fg : tone) + '1f' }]}
            >
              <Text style={[k.stepText, on && { color: tone === C.muted ? C.fg : tone, fontFamily: F.monoSemi }]}>{n}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const k = StyleSheet.create({
  lead: { fontFamily: F.body, fontSize: 15, color: C.muted, lineHeight: 21 },
  label: { fontFamily: F.medium, fontSize: 16, color: C.fg },
  scale: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: C.input, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: F.mono, fontSize: 15, color: C.muted },
})
