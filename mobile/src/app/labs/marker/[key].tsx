// One marker across every blood test: the latest value and its read, where it sits in the lab's range, the history
// against the range (with blood-lettings marked), what the marker is and why it moves on a protocol, and every
// result (each opens its test).
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { db, type MarkerTarget } from '@shared/lib/db'
import { toUnit } from '@shared/lib/labUnits'
import { fmtDay } from '@shared/lib/dates'
import { MARKER_COPY } from '@shared/lib/labCopy'
import { markerSeries } from '@shared/lib/labTests'
import { fmtRange } from '@shared/lib/labRules'
import { TimeChart } from '@/charts/TimeChart'
import { Eyebrow, Input, Pill, Widget } from '@/kit'
import { markerChip } from '@/labs/reads'
import { RangeBar, Tag } from '@/labs/ui'
import { useBleeds } from '@/labs/useBleeds'
import { useTests } from '@/labs/useTests'
import { usePro } from '@/money/pro'
import { C, F } from '@/theme'

const DAY = 86_400_000

export default function MarkerScreen() {
  const { key } = useLocalSearchParams<{ key: string }>()
  const tests = useTests()
  const bleeds = useBleeds()
  const pro = usePro()
  const latestTest = tests?.find((t) => t.markers.some((m) => m.key === key))
  const latest = latestTest?.markers.find((m) => m.key === key)
  const series = useMemo(() => (tests ? markerSeries(tests, key) : undefined), [tests, key])
  const target = useLiveQuery(() => db.markerTargets.where('marker').equals(key).first(), [key])
  if (!tests || !latest || !latestTest) return <Stack.Screen options={{ title: 'Result' }} />
  const pts = (series?.points ?? []).filter((p) => p.value !== undefined).map((p) => ({ t: p.t, v: p.value! }))
  const last = series?.points[series.points.length - 1]
  const t0 = pts.length ? Math.min(pts[0].t, Date.now() - 30 * DAY) : Date.now() - 30 * DAY
  const copy = MARKER_COPY[key]
  const chip = markerChip(latest, pro)
  const notLatest = tests[0] && latestTest.id !== tests[0].id
  const bled = key === 'hematocrit' || key === 'hemoglobin' ? (bleeds ?? []) : []
  // Your target, in the chart's unit, as dashed lines
  const guides = [target?.low, target?.high]
    .map((v) => (v === undefined ? undefined : toUnit(key, v, target?.unit, series?.unit ?? latest.unit)))
    .filter((v): v is number => v !== undefined)
  return (
    <>
      <Stack.Screen options={{ title: latest.label, headerBackTitle: 'Back' }} />
      <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 16 }}>
        <Widget
          eyebrow={`Latest · ${fmtDay(latestTest.date)}`}
          title={`${latest.rawValue || latest.value} ${latest.unit}`}
          sub={`Lab range ${fmtRange(latest.low, latest.high)}`}
          action={<Tag label={chip.label} tone={chip.tone} />}
        >
          {latest.value !== undefined ? <RangeBar value={latest.value} low={latest.low} high={latest.high} prev={pro ? latest.prev?.value : undefined} /> : null}
          {notLatest ? <Text style={m.warn}>Not in your latest test ({fmtDay(tests[0].date)}).</Text> : null}
          {pro && latest.reason ? <Text style={m.body}>{latest.reason}</Text> : null}
        </Widget>

        {pts.length ? (
          <Widget eyebrow="Over time" sub={`Shaded: the lab's range on your latest test${guides.length ? '. Dashed: your target' : ''}${bled.length ? '. Blood-lettings are listed below.' : '.'}`}>
            <TimeChart series={[{ label: latest.label, color: '#10b981', points: pts }]} unit={series?.unit} band={{ low: last?.low, high: last?.high }} guides={guides} domain={[t0 - 3 * DAY, Date.now()]} height={180} />
            {series?.dropped ? <Text style={m.muted}>{series.dropped} older result{series.dropped === 1 ? ' is' : 's are'} in a unit that can't be converted, so not plotted.</Text> : null}
          </Widget>
        ) : null}

        <TargetEditor markerKey={key} target={target} unit={series?.unit ?? latest.unit} low={latest.low} high={latest.high} />

        {copy ? (
          <Widget eyebrow="What it is">
            <Text style={m.body}>{copy.what}</Text>
            {copy.range ? <Text style={m.muted}>{copy.range}</Text> : null}
            {copy.whyMoves.length ? (
              <>
                <Eyebrow>Why it moves on a protocol</Eyebrow>
                {copy.whyMoves.map((w) => <Text key={w} style={m.bullet}>•  {w}</Text>)}
              </>
            ) : null}
          </Widget>
        ) : null}

        <Widget eyebrow="Every result">
          <View>
            {[...(series?.points ?? [])].reverse().map((p, i) => (
              <Pressable key={p.examId} onPress={() => router.push({ pathname: '/labs/[id]', params: { id: String(p.examId) } })} style={({ pressed }) => [m.row, i > 0 && m.sep, pressed && { opacity: 0.7 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={m.date}>{fmtDay(p.date)}</Text>
                  {p.provider || p.phase ? <Text style={m.small}>{[p.provider, p.phase].filter(Boolean).join(' · ')}</Text> : null}
                </View>
                <Text style={[m.value, (p.labFlag === 'high' || p.labFlag === 'low') && { color: C.warn }]}>
                  {p.raw} <Text style={m.unit}>{p.unit}</Text>
                </Text>
                <Text style={m.chev}>›</Text>
              </Pressable>
            ))}
            {bled.map((b) => (
              <View key={`b${b.id}`} style={[m.row, m.sep]}>
                <Text style={[m.date, { flex: 1 }]}>{fmtDay(b.performedAt)}</Text>
                <Text style={m.small}>Blood-letting{b.volumeMl ? ` · ${b.volumeMl} mL` : ''}</Text>
              </View>
            ))}
          </View>
        </Widget>
        <Pressable onPress={() => router.push({ pathname: '/labs/edit', params: { mode: 'edit', id: String(latestTest.id) } })}>
          <Text style={m.link}>Edit the latest test</Text>
        </Pressable>
      </ScrollView>
    </>
  )
}

/** Your own range for this marker: results are read against it instead of the lab's (the web's TargetEditor). */
function TargetEditor({ markerKey, target, unit, low, high }: { markerKey: string; target?: MarkerTarget; unit: string; low?: number; high?: number }) {
  const shown = (v?: number) => {
    if (v === undefined || !target) return ''
    const c = toUnit(markerKey, v, target.unit, unit)
    return String(Number((c ?? v).toPrecision(4)))
  }
  const [lo, setLo] = useState<string | null>(null)
  const [hi, setHi] = useState<string | null>(null)
  const loV = lo ?? shown(target?.low)
  const hiV = hi ?? shown(target?.high)
  const parse = (x: string) => (x.trim() === '' || !Number.isFinite(Number(x.replace(',', '.'))) ? undefined : Number(x.replace(',', '.')))
  const changed = lo !== null || hi !== null
  const can = changed && (parse(loV) !== undefined || parse(hiV) !== undefined)

  async function save() {
    const data = { marker: markerKey, low: parse(loV), high: parse(hiV), unit }
    if (data.low !== undefined && data.high !== undefined && data.low >= data.high) return Alert.alert('Check the numbers', 'Low should be below high.')
    if (target?.id) await db.markerTargets.update(target.id, data)
    else await db.markerTargets.add(data)
    setLo(null)
    setHi(null)
  }
  async function remove() {
    await db.markerTargets.where('marker').equals(markerKey).delete()
    setLo(null)
    setHi(null)
  }

  return (
    <Widget
      eyebrow="Your target"
      title={target ? `${fmtRange(target.low, target.high)} ${target.unit ?? unit}` : undefined}
      sub="Your own range, from you and your doctor. Results are read against it instead of the lab's."
      action={target && !changed ? <Pill label="Remove" onPress={() => void remove()} /> : can ? <Pill label="Save" primary onPress={() => void save()} /> : undefined}
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Input keyboardType="decimal-pad" placeholder={low !== undefined ? `Low (lab ${low})` : 'Low'} value={loV} onChangeText={setLo} suffix={unit} accessibilityLabel="Target low" />
        </View>
        <View style={{ flex: 1 }}>
          <Input keyboardType="decimal-pad" placeholder={high !== undefined ? `High (lab ${high})` : 'High'} value={hiV} onChangeText={setHi} suffix={unit} accessibilityLabel="Target high" />
        </View>
      </View>
    </Widget>
  )
}

const m = StyleSheet.create({
  warn: { fontFamily: F.medium, fontSize: 13, color: C.warn },
  body: { fontFamily: F.body, fontSize: 15, color: C.fg, lineHeight: 22 },
  muted: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 19 },
  bullet: { fontFamily: F.body, fontSize: 14, color: C.fg, lineHeight: 21, opacity: 0.92 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  date: { fontFamily: F.mono, fontSize: 13, color: C.fg },
  small: { fontFamily: F.mono, fontSize: 11, color: C.muted },
  value: { fontFamily: F.monoSemi, fontSize: 15, color: C.fg },
  unit: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  chev: { fontSize: 20, color: C.faint },
  link: { fontFamily: F.semi, fontSize: 14, color: C.accentInk },
})
