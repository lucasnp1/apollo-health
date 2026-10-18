// Two blood tests side by side, by section, every value in the newer test's unit: the web's ComparePage on
// labTests.compareTests. Changes that count are toned; small moves read "same".
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { fmtDay } from '@shared/lib/dates'
import { compareTests, printedValue } from '@shared/lib/labTests'
import { Widget } from '@/kit'
import { useTests } from '@/labs/useTests'
import { C, F } from '@/theme'

export default function Compare() {
  const { a, b } = useLocalSearchParams<{ a: string; b: string }>()
  const tests = useTests()
  const x = tests?.find((t) => String(t.id) === a)
  const y = tests?.find((t) => String(t.id) === b)
  if (!x || !y) return null
  const [newer, older] = x.date >= y.date ? [x, y] : [y, x]
  const c = compareTests(newer, older)
  return (
    <>
      <Stack.Screen options={{ title: 'Compare tests' }} />
      <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 16 }}>
        <Widget
          eyebrow={`${c.gapDays} days apart`}
          title={`${fmtDay(older.date)}  →  ${fmtDay(newer.date)}`}
          sub={`${c.both} markers in both${c.differentTiming ? '. One was drawn near a trough and the other near a peak, so hormone and haematocrit moves may be timing.' : '.'}`}
        />
        {c.sections.map(({ section, rows }) => (
          <Widget key={section} eyebrow={section}>
            <View>
              {rows.map((r, i) => {
                const tone = r.change?.meaningful ? (r.newer.change?.better === false ? C.danger : r.newer.change?.better === true ? C.good : C.fg) : C.muted
                return (
                  <View key={r.key} style={[s.row, i > 0 && s.sep]}>
                    <Text style={s.label} onPress={() => router.push({ pathname: '/labs/marker/[key]', params: { key: r.key } })}>{r.label}</Text>
                    <View style={s.vals}>
                      <Text style={s.old}>{r.olderValue !== undefined ? String(Number(r.olderValue.toPrecision(4))) : printedValue(r.older)}</Text>
                      <Text style={s.arrow}>→</Text>
                      <Text style={s.new}>{printedValue(r.newer)}</Text>
                      <Text style={s.unit}>{r.unit}</Text>
                    </View>
                    {r.change ? <Text style={[s.change, { color: tone }]}>{r.change.text}</Text> : null}
                  </View>
                )
              })}
            </View>
          </Widget>
        ))}
        {c.onlyNewer.length ? <Widget eyebrow={`Only in ${fmtDay(newer.date)}`} sub={c.onlyNewer.map((m) => m.label).join(', ')} /> : null}
        {c.onlyOlder.length ? <Widget eyebrow={`Only in ${fmtDay(older.date)}`} sub={c.onlyOlder.map((m) => m.label).join(', ')} /> : null}
      </ScrollView>
    </>
  )
}

const s = StyleSheet.create({
  row: { paddingVertical: 11, gap: 4 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  label: { fontFamily: F.semi, fontSize: 15, color: C.fg },
  vals: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  old: { fontFamily: F.mono, fontSize: 14, color: C.muted },
  arrow: { fontFamily: F.mono, fontSize: 13, color: C.faint },
  new: { fontFamily: F.monoSemi, fontSize: 15, color: C.fg },
  unit: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  change: { fontFamily: F.mono, fontSize: 12 },
})
