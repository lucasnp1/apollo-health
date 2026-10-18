// One marker across every blood test: the results over time against the lab's range, and each value as printed.
import { Stack, useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { fmtDay } from '@shared/lib/dates'
import { markerSeries } from '@shared/lib/labTests'
import { fmtRange } from '@shared/lib/labRules'
import { TimeChart } from '@/charts/TimeChart'
import { Card, Eyebrow } from '@/kit'
import { useTests } from '@/labs/useTests'
import { C, F } from '@/theme'

const DAY = 86_400_000

export default function MarkerScreen() {
  const { key } = useLocalSearchParams<{ key: string }>()
  const tests = useTests()
  const label = tests?.flatMap((t) => t.markers).find((m) => m.key === key)?.label ?? 'Result'
  const series = useMemo(() => (tests ? markerSeries(tests, key) : undefined), [tests, key])
  const pts = (series?.points ?? []).filter((p) => p.value !== undefined).map((p) => ({ t: p.t, v: p.value! }))
  const last = series?.points[series.points.length - 1]
  const t0 = pts.length ? Math.min(pts[0].t, Date.now() - 30 * DAY) : Date.now() - 30 * DAY

  return (
    <>
      <Stack.Screen options={{ title: label }} />
      <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 20 }}>
        {pts.length ? (
          <Card>
            <TimeChart series={[{ label, color: C.good, points: pts }]} unit={series?.unit} band={{ low: last?.low, high: last?.high }} domain={[t0 - 3 * DAY, Date.now()]} height={180} />
            {last ? <Text style={m.range}>Shaded: the lab's range on your latest test, {fmtRange(last.low, last.high)}</Text> : null}
          </Card>
        ) : null}
        <View style={{ gap: 8 }}>
          <Eyebrow>Every result</Eyebrow>
          <Card style={{ paddingVertical: 4 }}>
            {[...(series?.points ?? [])].reverse().map((p, i) => (
              <View key={p.examId} style={[m.row, i > 0 && m.sep]}>
                <Text style={m.date}>{fmtDay(p.date)}</Text>
                <Text style={[m.value, (p.labFlag === 'high' || p.labFlag === 'low') && { color: C.warn }]}>
                  {p.raw} <Text style={m.unit}>{p.unit}</Text>
                </Text>
              </View>
            ))}
          </Card>
        </View>
      </ScrollView>
    </>
  )
}

const m = StyleSheet.create({
  range: { fontFamily: F.body, fontSize: 12, color: C.muted, marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  date: { fontFamily: F.mono, fontSize: 13, color: C.muted },
  value: { fontFamily: F.monoSemi, fontSize: 15, color: C.fg },
  unit: { fontFamily: F.mono, fontSize: 12, color: C.muted },
})
