// Reminders: one card a kind, a switch to turn it on, then when it fires. Kept on this phone.
import { DatePicker, Host } from '@expo/ui/swift-ui'
import { datePickerStyle, tint } from '@expo/ui/swift-ui/modifiers'
import * as Haptics from 'expo-haptics'
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card, Chips, Segmented, s as k } from '@/kit'
import { type Kind, type Timed, setReminder, useReminders } from '@/reminders'
import { C, F, useScheme } from '@/theme'

const LABEL: Record<Kind, { title: string; off: string }> = {
  injection: { title: 'Injections', off: 'A nudge on injection days.' },
  weight: { title: 'Weigh-in', off: 'A nudge to step on the scale.' },
  bp: { title: 'Blood pressure', off: 'A nudge to take a reading.' },
  checkin: { title: 'Check-in', off: 'A nudge to say how you feel.' },
  bloods: { title: 'Blood test', off: 'A nudge when your next test is due.' },
}
const WEEK = [0, 1, 2, 3, 4, 5, 6]
const LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const INTERVALS = ['2', '3', '3.5', '7', '14'] as const
const WEEKS = ['6', '8', '12', '16'] as const

export default function Reminders() {
  const insets = useSafeAreaInsets()
  const r = useReminders()
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 12 }}>
      {(['injection', 'weight', 'bp', 'checkin'] as const).map((kind) => {
        const t = r[kind]
        const interval = kind === 'injection' && r.injection.mode === 'interval'
        return (
          <Card key={kind} style={{ gap: 14 }}>
            <Head kind={kind} on={t.on} />
            {t.on ? (
              <>
                {kind === 'injection' ? (
                  <Segmented
                    options={[{ value: 'days', label: 'On these days' }, { value: 'interval', label: 'Every few days' }]}
                    value={r.injection.mode}
                    onChange={(mode) => void setReminder('injection', { mode })}
                  />
                ) : null}
                {interval ? (
                  <View style={{ gap: 8 }}>
                    <Chips
                      options={INTERVALS.map((v) => ({ value: v, label: `${v} days` }))}
                      value={String(r.injection.intervalDays) as (typeof INTERVALS)[number]}
                      onChange={(v) => v && void setReminder('injection', { intervalDays: Number(v) })}
                    />
                    <Text style={k.hint}>Counted from your last logged injection.</Text>
                  </View>
                ) : (
                  <Days value={t.days} onChange={(days) => void setReminder(kind, { days })} />
                )}
                <Time value={t.time} onChange={(time) => void setReminder(kind, { time } as Partial<Timed>)} />
              </>
            ) : null}
          </Card>
        )
      })}
      <Card style={{ gap: 14 }}>
        <Head kind="bloods" on={r.bloods.on} />
        {r.bloods.on ? (
          <View style={{ gap: 8 }}>
            <Chips
              options={WEEKS.map((v) => ({ value: v, label: `${v} weeks` }))}
              value={String(r.bloods.everyWeeks) as (typeof WEEKS)[number]}
              onChange={(v) => v && void setReminder('bloods', { everyWeeks: Number(v) })}
            />
            <Text style={k.hint}>At 10:00, counted from your last blood test.</Text>
          </View>
        ) : null}
      </Card>
      <Text style={[k.hint, { marginTop: 4 }]}>Reminders are kept on this phone.</Text>
    </ScrollView>
  )
}

function Head({ kind, on }: { kind: Kind; on: boolean }) {
  const toggle = (v: boolean) => void setReminder(kind, { on: v })
  return (
    <Pressable style={st.row} onPress={() => toggle(!on)} accessibilityRole="switch" accessibilityState={{ checked: on }}>
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Text style={st.label}>{LABEL[kind].title}</Text>
        {on ? null : <Text style={k.hint}>{LABEL[kind].off}</Text>}
      </View>
      <Switch value={on} trackColor={{ true: C.primary }} onValueChange={toggle} accessibilityElementsHidden />
    </Pressable>
  )
}

/** Several weekdays at once (kit's Chips picks one). */
function Days({ value, onChange }: { value: number[]; onChange: (d: number[]) => void }) {
  return (
    <View style={st.days}>
      {WEEK.map((d) => {
        const on = value.includes(d)
        return (
          <Pressable
            key={d}
            accessibilityRole="checkbox"
            accessibilityLabel={NAME[d]}
            accessibilityState={{ checked: on }}
            onPress={() => {
              void Haptics.selectionAsync()
              onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())
            }}
            style={({ pressed }) => [k.chip, st.day, on && k.chipOn, pressed && { opacity: 0.7 }]}
          >
            <Text style={[k.chipText, on && k.chipTextOn]}>{LETTER[d]}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function Time({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const [h, m] = value.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  const scheme = useScheme()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <View style={st.row}>
      <Text style={st.label}>Time</Text>
      <Host matchContents colorScheme={scheme}>
        <DatePicker
          selection={d}
          displayedComponents={['hourAndMinute']}
          onDateChange={(x) => onChange(`${pad(x.getHours())}:${pad(x.getMinutes())}`)}
          modifiers={[datePickerStyle('compact'), tint(C.primary)]}
        />
      </Host>
    </View>
  )
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  label: { fontFamily: F.medium, fontSize: 16, color: C.fg },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { width: 40, height: 40, paddingHorizontal: 0, paddingVertical: 0, justifyContent: 'center' },
})
