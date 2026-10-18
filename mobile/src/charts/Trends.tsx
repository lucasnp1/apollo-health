// Home's trends: weight, blood pressure, and the doses you logged with your lab results on the same time axis, under
// one range control. The doses-and-results card replaces the web's estimated active-levels curve: it shows only what
// happened (each logged shot, each measured result), never a modelled level (Apple 1.4.1, 1.4.3; docs/decisions.md).
import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Line } from 'react-native-svg'
import type { BodyMetric, Compound, InjectionLog, VitalLog } from '@shared/lib/db'
import { compoundGroups } from '@shared/lib/compounds'
import { type LabTest, markerSeries } from '@shared/lib/labTests'
import { RANGE_DAYS, type TimeRange } from '@shared/lib/timeRange'
import { Card, Chips, Eyebrow, Segmented } from '@/kit'
import { type Domain, type Pt, TimeChart } from './TimeChart'
import { C, F } from '@/theme'

const DAY = 86_400_000
// Checked with the dataviz validator on the dark card (#15171a): rose 500 and blue 500 pass every check
const SYS = '#f43f5e'
const DIA = '#3b82f6'
const RANGES: { value: TimeRange; label: string }[] = [
  { value: '1M', label: '1M' }, { value: '3M', label: '3M' }, { value: '6M', label: '6M' }, { value: '1Y', label: '1Y' }, { value: 'ALL', label: 'All' },
]

export function Trends({ compounds, injections, vitals, bodyMetrics, tests }: {
  compounds: Compound[]; injections: InjectionLog[]; vitals: VitalLog[]; bodyMetrics: BodyMetric[]; tests: LabTest[]
}) {
  const [range, setRange] = useState<TimeRange>('3M')
  const now = Date.now()

  const weight = useMemo(() => {
    const pts: Pt[] = []
    for (const b of bodyMetrics) if (b.weightKg !== undefined) pts.push({ t: Date.parse(b.measuredAt), v: b.weightKg })
    for (const i of injections) if (i.weightKg !== undefined) pts.push({ t: Date.parse(i.takenAt), v: i.weightKg })
    return pts.sort((a, b) => a.t - b.t)
  }, [bodyMetrics, injections])
  const bp = useMemo(() => [...vitals].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).map((v) => ({ t: Date.parse(v.measuredAt), sys: v.systolic, dia: v.diastolic })), [vitals])

  const days = RANGE_DAYS[range]
  const earliest = Math.min(now - 7 * DAY, ...weight.map((p) => p.t), ...bp.map((p) => p.t), ...injections.map((i) => Date.parse(i.takenAt)), ...tests.map((t) => Date.parse(t.date)))
  const domain: Domain = [days === null ? earliest : now - days * DAY, now]
  const inside = <T extends { t: number }>(xs: T[]) => xs.filter((p) => p.t >= domain[0] && p.t <= domain[1])

  const w = inside(weight)
  const b = inside(bp)
  if (!weight.length && !bp.length && !injections.length && !tests.length) return null

  return (
    <View style={{ gap: 12 }}>
      <View style={t.head}>
        <Eyebrow>Trends</Eyebrow>
        <View style={{ width: 230 }}>
          <Segmented value={range} onChange={setRange} options={RANGES} />
        </View>
      </View>

      <DosesAndResults compounds={compounds} injections={injections} tests={tests} domain={domain} />

      {w.length ? (
        <Card>
          <Text style={t.title}>Weight</Text>
          <TimeChart series={[{ label: 'Weight', color: C.primary, points: w }]} unit="kg" domain={domain} />
        </Card>
      ) : null}

      {b.length ? (
        <Card>
          <Text style={t.title}>Blood pressure</Text>
          <TimeChart
            series={[
              { label: 'Systolic', color: SYS, points: b.map((p) => ({ t: p.t, v: p.sys })) },
              { label: 'Diastolic', color: DIA, points: b.map((p) => ({ t: p.t, v: p.dia })) },
            ]}
            unit="mmHg"
            domain={domain}
          />
        </Card>
      ) : null}
    </View>
  )
}

/** Each logged shot as a dot on its compound's lane, above one lab marker's results, on the same time axis. */
function DosesAndResults({ compounds, injections, tests, domain }: { compounds: Compound[]; injections: InjectionLog[]; tests: LabTest[]; domain: Domain }) {
  const lanes = useMemo(
    () =>
      compoundGroups(compounds, injections)
        .map((g) => ({ ...g, shots: injections.filter((i) => g.ids.includes(i.compoundId)).map((i) => Date.parse(i.takenAt)).filter((x) => x >= domain[0] && x <= domain[1]) }))
        .filter((g) => g.shots.length),
    [compounds, injections, domain],
  )
  // The protocol's own marker first, then the most measured; a few at most (each test lists them all)
  const markers = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; n: number }>()
    for (const tst of tests) for (const m of tst.markers) seen.set(m.key, { key: m.key, label: m.label, n: (seen.get(m.key)?.n ?? 0) + 1 })
    const all = [...seen.values()].sort((a, b) => Number(b.key === 'total_testosterone') - Number(a.key === 'total_testosterone') || b.n - a.n)
    // markers with more than one result make a line; a one-off still shows if it's all there is
    const repeated = all.filter((m) => m.n > 1)
    return (repeated.length ? repeated : all).slice(0, 4)
  }, [tests])
  const [key, setKey] = useState<string | undefined>()
  const marker = markers.find((m) => m.key === key) ?? markers[0]
  const series = useMemo(() => (marker ? markerSeries(tests, marker.key) : undefined), [tests, marker])
  const pts = (series?.points ?? []).filter((p) => p.value !== undefined && p.t >= domain[0] && p.t <= domain[1]).map((p) => ({ t: p.t, v: p.value! }))
  const last = series?.points[series.points.length - 1]

  if (!lanes.length && !pts.length) return null
  return (
    <Card style={{ gap: 12 }}>
      <View>
        <Text style={t.title}>Doses and results</Text>
        <Text style={t.sub}>Every shot you logged, and what your blood tests measured.</Text>
      </View>
      {lanes.length ? <Lanes lanes={lanes} domain={domain} /> : <Text style={t.sub}>No shots logged in this range.</Text>}
      {markers.length > 1 ? <Chips options={markers.map((m) => ({ value: m.key, label: m.label }))} value={marker?.key} onChange={(v) => v && setKey(v)} /> : null}
      {pts.length ? (
        <TimeChart series={[{ label: marker!.label, color: C.good, points: pts }]} unit={series?.unit} band={{ low: last?.low, high: last?.high }} domain={domain} height={130} />
      ) : (
        <Text style={t.sub}>{markers.length ? `No ${marker?.label} result in this range.` : 'Add a blood test in Labs to see your results here.'}</Text>
      )}
    </Card>
  )
}

const LANE = 26
const LEFT = 34

function Lanes({ lanes, domain }: { lanes: { key: string; name: string; color?: string; shots: number[] }[]; domain: Domain }) {
  const [w, setW] = useState(0)
  const x = (tm: number) => LEFT + ((tm - domain[0]) / (domain[1] - domain[0] || 1)) * (w - LEFT - 10)
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {lanes.map((l) => (
        <View key={l.key} style={{ height: LANE + 14 }}>
          <View style={t.laneHead}>
            <Text style={t.laneName} numberOfLines={1}>{l.name}</Text>
            <Text style={t.laneCount}>{l.shots.length} shot{l.shots.length === 1 ? '' : 's'}</Text>
          </View>
          {w ? (
            <Svg width={w} height={LANE}>
              <Line x1={LEFT} x2={w - 10} y1={LANE / 2} y2={LANE / 2} stroke={C.line} strokeWidth={1} />
              {l.shots.map((s) => (
                <Circle key={s} cx={x(s)} cy={LANE / 2} r={4} fill={l.color ?? C.primary} stroke={C.card} strokeWidth={2} />
              ))}
            </Svg>
          ) : null}
        </View>
      ))}
    </View>
  )
}

const t = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: F.semi, fontSize: 16, color: C.fg, marginBottom: 8 },
  sub: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18, marginTop: -4 },
  laneHead: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: LEFT },
  laneName: { flex: 1, fontFamily: F.medium, fontSize: 13, color: C.fg },
  laneCount: { fontFamily: F.mono, fontSize: 11, color: C.muted },
})
