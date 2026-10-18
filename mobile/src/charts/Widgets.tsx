// Home's widgets, one job each, all on the same head (kit Widget): what needs a look, injections, bloods, wellbeing,
// weight, blood pressure. Each has its own time range. Nothing here models a level or works out a dose: injections
// show what was logged, bloods what the lab measured (docs/decisions.md).
import { format } from 'date-fns'
import { router } from 'expo-router'
import { Fragment, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg'
import type { BodyMetric, Compound, InjectionLog, Symptom, VitalLog } from '@shared/lib/db'
import { compoundGroups } from '@shared/lib/compounds'
import { fmtDay } from '@shared/lib/dates'
import { countLine } from '@shared/lib/homeInsights'
import { type LabTest, markerSeries } from '@shared/lib/labTests'
import { NEGATIVE, POSITIVE, ratingOf } from '@shared/lib/symptoms'
import { type HomeInsight, openInsight } from '@/insights/useInsights'
import { Chips, Pill, type RangeId, RangeMenu, rangeDomain, Widget } from '@/kit'
import { testChip, verdictLine } from '@/labs/reads'
import { unitLabel } from '@/timeline'
import { C, F, TONE, type Tone } from '@/theme'
import { dateTicks, fmtTick, TimeChart } from './TimeChart'

const DAY = 86_400_000
// Checked with the dataviz validator on the dark card (#15171a)
const SYS = '#f43f5e'
const DIA = '#3b82f6'
const GOOD = '#10b981'

function ToneChip({ label, tone }: { label: string; tone: Tone }) {
  const t = TONE[tone]
  return (
    <View style={[w.chip, { backgroundColor: t + '22' }]}>
      <Text style={[w.chipText, { color: t }]}>{label}</Text>
    </View>
  )
}

// ── What needs a look ────────────────────────────────────────────────────────

export function InsightsWidget({ insights }: { insights?: HomeInsight[] }) {
  const [all, setAll] = useState(false)
  if (!insights) return null
  if (!insights.length)
    return <Widget eyebrow="What needs a look" title="Nothing needs a look right now" sub="Across your bloods, pressure, weight and check-ins." />
  const list = all ? insights : insights.slice(0, 4)
  return (
    <Widget eyebrow="What needs a look" title={countLine(insights)} sub="Read together from your bloods, pressure, weight and check-ins. Not medical advice.">
      <View>
        {list.map((i, n) => (
          <Pressable
            key={i.id}
            onPress={() => (i.id === 'lab-free' ? router.push({ pathname: '/pro', params: { feature: 'Reading your bloods' } }) : (openInsight(i), router.push('/insight')))}
            style={({ pressed }) => [w.row, n > 0 && w.sep, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ToneChip label={i.chip} tone={(i.tone === 'neutral' ? 'neutral' : i.tone) as Tone} />
                <Text style={w.area}>{i.area}</Text>
              </View>
              <Text style={w.rowTitle}>{i.title}</Text>
              <Text style={w.rowSub}>{i.sub}</Text>
            </View>
            <Text style={w.chev}>›</Text>
          </Pressable>
        ))}
      </View>
      {insights.length > 4 ? (
        <Pressable onPress={() => setAll((a) => !a)} hitSlop={8}>
          <Text style={w.link}>{all ? 'Show less' : `Show ${insights.length - 4} more`}</Text>
        </Pressable>
      ) : null}
    </Widget>
  )
}

// ── Injections ───────────────────────────────────────────────────────────────

const doseText = (i: InjectionLog) => i.rawDose ?? (i.dose != null ? `${i.dose} ${unitLabel(i.unit)}` : i.vialAmount ? `drew ${i.vialAmount}` : '')

/**
 * Every shot logged in the range, per compound: when, and how much. A compound with no shot in the range (stopped, or
 * not pinned lately) doesn't show.
 */
export function InjectionsWidget({ compounds, injections }: { compounds: Compound[]; injections: InjectionLog[] }) {
  const [range, setRange] = useState<RangeId>('1M')
  const [list, setList] = useState(false)
  const domain = rangeDomain(range, injections.map((i) => Date.parse(i.takenAt)))
  const lanes = useMemo(
    () =>
      compoundGroups(compounds, injections)
        .map((g) => ({
          ...g,
          shots: injections
            .filter((i) => g.ids.includes(i.compoundId) && Date.parse(i.takenAt) >= domain[0] && Date.parse(i.takenAt) <= domain[1])
            .sort((a, b) => a.takenAt.localeCompare(b.takenAt)),
        }))
        .filter((g) => g.shots.length)
        .sort((a, b) => b.shots[b.shots.length - 1].takenAt.localeCompare(a.shots[a.shots.length - 1].takenAt)),
    [compounds, injections, domain[0]],
  )
  const last = injections[0]
  const lastName = last && compoundGroups(compounds, injections).find((g) => g.ids.includes(last.compoundId))?.name
  const total = lanes.reduce((n, l) => n + l.shots.length, 0)
  return (
    <Widget
      eyebrow="Injections"
      title={last ? `${lastName ?? 'Injection'} · ${doseText(last)}` : 'No shots logged'}
      sub={last ? `Last shot ${fmtDay(last.takenAt)}, ${format(Date.parse(last.takenAt), 'HH:mm')}${last.site ? ` · ${last.site}` : ''}` : 'Log a shot from Add to your log.'}
      action={<RangeMenu value={range} onChange={setRange} />}
    >
      {lanes.length ? (
        <>
          {lanes.map((l) => (
            <Lane key={l.key} name={l.name} color={l.color ?? C.primary} shots={l.shots} domain={domain} labels={range === '1W' || range === '1M'} />
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {dateTicks(domain, 3).map((t) => (
              <Text key={t} style={w.tick}>{fmtTick(t, domain)}</Text>
            ))}
          </View>
          <Pressable onPress={() => setList((v) => !v)} hitSlop={8}>
            <Text style={w.link}>{list ? 'Hide the list' : `List all ${total} shot${total === 1 ? '' : 's'}`}</Text>
          </Pressable>
          {list ? (
            <View>
              {lanes
                .flatMap((l) => l.shots.map((s) => ({ s, name: l.name, color: l.color ?? C.primary })))
                .sort((a, b) => b.s.takenAt.localeCompare(a.s.takenAt))
                .map(({ s, name, color }, n) => (
                  <View key={s.id} style={[w.shot, n > 0 && w.sep]}>
                    <View style={[w.dot, { backgroundColor: color }]} />
                    <Text style={w.shotDate}>{format(Date.parse(s.takenAt), 'EEE d MMM')}</Text>
                    <Text style={w.shotName} numberOfLines={1}>{name}</Text>
                    <Text style={w.shotDose}>{doseText(s)}</Text>
                  </View>
                ))}
            </View>
          ) : null}
        </>
      ) : (
        <Text style={w.empty}>No shots in this range.</Text>
      )}
    </Widget>
  )
}

/** One compound: its name, count and last dose, then a dot per shot on the time axis, labelled with the dose when there's room. */
function Lane({ name, color, shots, domain, labels }: { name: string; color: string; shots: InjectionLog[]; domain: [number, number]; labels: boolean }) {
  const [width, setWidth] = useState(0)
  const H = labels ? 38 : 22
  const x = (t: number) => 6 + ((t - domain[0]) / (domain[1] - domain[0] || 1)) * (width - 12)
  const lastShot = shots[shots.length - 1]
  // a dose label only where it won't run into its neighbour
  let lastLabelX = -Infinity
  return (
    <View style={{ gap: 6 }}>
      <View style={w.laneHead}>
        <View style={[w.dot, { backgroundColor: color }]} />
        <Text style={w.laneName} numberOfLines={1}>{name}</Text>
        <Text style={w.laneMeta}>{shots.length} · last {doseText(lastShot)} {format(Date.parse(lastShot.takenAt), 'EEE d MMM')}</Text>
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: H }}>
        {width ? (
          <Svg width={width} height={H}>
            <Line x1={0} x2={width} y1={H - 8} y2={H - 8} stroke={C.line} strokeWidth={1} />
            {shots.map((s) => {
              const cx = x(Date.parse(s.takenAt))
              const show = labels && cx - lastLabelX > 34
              if (show) lastLabelX = cx
              return (
                <Fragment key={s.id}>
                  <Circle cx={cx} cy={H - 8} r={4.5} fill={color} stroke={C.card} strokeWidth={2} />
                  {show ? (
                    <SvgText x={cx} y={H - 18} fontSize={10} fontFamily={F.mono} fill={C.muted} textAnchor="middle">
                      {s.dose != null ? String(s.dose) : ''}
                    </SvgText>
                  ) : null}
                </Fragment>
              )
            })}
          </Svg>
        ) : null}
      </View>
    </View>
  )
}

// ── Bloods ───────────────────────────────────────────────────────────────────

export function BloodsWidget({ tests, pro }: { tests?: LabTest[]; pro: boolean }) {
  const [range, setRange] = useState<RangeId>('1Y')
  const [key, setKey] = useState<string | undefined>()
  const markers = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; n: number }>()
    for (const t of tests ?? []) for (const m of t.markers) seen.set(m.key, { key: m.key, label: m.label, n: (seen.get(m.key)?.n ?? 0) + 1 })
    const all = [...seen.values()].sort((a, b) => Number(b.key === 'total_testosterone') - Number(a.key === 'total_testosterone') || b.n - a.n)
    const repeated = all.filter((m) => m.n > 1)
    return (repeated.length ? repeated : all).slice(0, 6)
  }, [tests])
  if (!tests) return null
  const latest = tests[0]
  if (!latest)
    return (
      <Widget eyebrow="Bloods" title="No blood tests yet" sub="Import a PDF or a photo of your report in Labs, and see what it says." action={<Pill label="Add" primary onPress={() => router.navigate('/labs')} />} />
    )
  const marker = markers.find((m) => m.key === key) ?? markers[0]
  const series = marker ? markerSeries(tests, marker.key) : undefined
  const domain = rangeDomain(range, tests.map((t) => Date.parse(t.date)))
  const pts = (series?.points ?? []).filter((p) => p.value !== undefined && p.t >= domain[0] - DAY && p.t <= domain[1]).map((p) => ({ t: p.t, v: p.value! }))
  const last = series?.points[series.points.length - 1]
  const chip = testChip(latest, pro)
  const open = () => router.push({ pathname: '/labs/[id]', params: { id: String(latest.id) } })
  return (
    <Widget eyebrow="Bloods" title={verdictLine(latest, pro)} sub={`Latest test ${fmtDay(latest.date)}${latest.provider ? ` · ${latest.provider}` : ''}`} action={<Pill label="Open" onPress={open} />} onPress={open}>
      {chip ? (
        <View style={{ flexDirection: 'row' }}>
          <ToneChip label={chip.label} tone={chip.tone} />
        </View>
      ) : null}
      {markers.length > 1 ? <Chips options={markers.map((m) => ({ value: m.key, label: m.label }))} value={marker?.key} onChange={(v) => v && setKey(v)} /> : null}
      {pts.length ? (
        <TimeChart series={[{ label: marker!.label, color: GOOD, points: pts }]} unit={series?.unit} band={{ low: last?.low, high: last?.high }} domain={domain} height={140} />
      ) : (
        <Text style={w.empty}>No {marker?.label} result in this range.</Text>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={w.small}>Shaded: the lab's range.</Text>
        <RangeMenu value={range} onChange={setRange} />
      </View>
    </Widget>
  )
}

// ── Wellbeing ────────────────────────────────────────────────────────────────

const mean = (s: Symptom, defs: typeof POSITIVE) => {
  const vs = defs.map((d) => ratingOf(s, d)).filter((v): v is number => typeof v === 'number')
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : undefined
}

/** How you've been: the feel-good average and the side-effect average per check-in, 0 to 5, and a check-in button. */
export function WellbeingWidget({ symptoms }: { symptoms: Symptom[] }) {
  const [range, setRange] = useState<RangeId>('3M')
  const domain = rangeDomain(range, symptoms.map((s) => Date.parse(s.recordedAt)))
  const inRange = symptoms.filter((s) => Date.parse(s.recordedAt) >= domain[0]).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
  const good = inRange.flatMap((s) => {
    const v = mean(s, POSITIVE)
    return v === undefined ? [] : [{ t: Date.parse(s.recordedAt), v }]
  })
  const watch = inRange.flatMap((s) => {
    const v = mean(s, NEGATIVE)
    return v === undefined ? [] : [{ t: Date.parse(s.recordedAt), v }]
  })
  const lastAt = symptoms[0]?.recordedAt
  return (
    <Widget
      eyebrow="Wellbeing"
      title={symptoms.length ? `${inRange.length} check-in${inRange.length === 1 ? '' : 's'} in this range` : 'How have you been feeling?'}
      sub={lastAt ? `Last check-in ${fmtDay(lastAt)}` : 'Mood, energy, sleep, libido and side effects, in ten seconds.'}
      action={<Pill label="+ Check in" primary onPress={() => router.push('/log/checkin')} />}
    >
      {good.length || watch.length ? (
        <>
          <TimeChart
            series={[
              { label: 'Feeling good', color: GOOD, points: good },
              { label: 'Side effects', color: SYS, points: watch },
            ]}
            domain={domain}
            height={130}
            yRange={[0, 5]}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={w.small}>Averages, 0 to 5.</Text>
            <RangeMenu value={range} onChange={setRange} />
          </View>
        </>
      ) : symptoms.length ? (
        <Text style={w.empty}>No check-ins in this range.</Text>
      ) : null}
    </Widget>
  )
}

// ── Weight and blood pressure ────────────────────────────────────────────────

export function WeightWidget({ bodyMetrics, injections }: { bodyMetrics: BodyMetric[]; injections: InjectionLog[] }) {
  const [range, setRange] = useState<RangeId>('3M')
  const pts = useMemo(() => {
    const out: { t: number; v: number }[] = []
    for (const b of bodyMetrics) if (b.weightKg !== undefined) out.push({ t: Date.parse(b.measuredAt), v: b.weightKg })
    for (const i of injections) if (i.weightKg !== undefined) out.push({ t: Date.parse(i.takenAt), v: i.weightKg })
    return out.sort((a, b) => a.t - b.t)
  }, [bodyMetrics, injections])
  if (!pts.length) return null
  const domain = rangeDomain(range, pts.map((p) => p.t))
  const shown = pts.filter((p) => p.t >= domain[0])
  const first = shown[0]
  const lastP = pts[pts.length - 1]
  const change = first && shown.length > 1 ? lastP.v - first.v : undefined
  return (
    <Widget
      eyebrow="Weight"
      title={`${lastP.v} kg`}
      sub={change !== undefined ? `${change > 0 ? '+' : ''}${change.toFixed(1)} kg over this range` : `Logged ${fmtDay(new Date(lastP.t).toISOString())}`}
      action={<RangeMenu value={range} onChange={setRange} />}
    >
      {shown.length ? <TimeChart series={[{ label: 'Weight', color: C.primary, points: shown }]} unit="kg" domain={domain} /> : <Text style={w.empty}>No weight in this range.</Text>}
    </Widget>
  )
}

export function PressureWidget({ vitals }: { vitals: VitalLog[] }) {
  const [range, setRange] = useState<RangeId>('3M')
  if (!vitals.length) return null
  const sorted = [...vitals].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  const domain = rangeDomain(range, sorted.map((v) => Date.parse(v.measuredAt)))
  const shown = sorted.filter((v) => Date.parse(v.measuredAt) >= domain[0])
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
  return (
    <Widget
      eyebrow="Blood pressure"
      title={shown.length ? `${avg(shown.map((v) => v.systolic))}/${avg(shown.map((v) => v.diastolic))} average` : 'No readings in this range'}
      sub={shown.length ? `${shown.length} reading${shown.length === 1 ? '' : 's'} in this range` : undefined}
      action={<RangeMenu value={range} onChange={setRange} />}
    >
      {shown.length ? (
        <TimeChart
          series={[
            { label: 'Systolic', color: SYS, points: shown.map((v) => ({ t: Date.parse(v.measuredAt), v: v.systolic })) },
            { label: 'Diastolic', color: DIA, points: shown.map((v) => ({ t: Date.parse(v.measuredAt), v: v.diastolic })) },
          ]}
          unit="mmHg"
          domain={domain}
        />
      ) : null}
    </Widget>
  )
}

const w = StyleSheet.create({
  chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontFamily: F.semi, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  area: { fontFamily: F.body, fontSize: 13, color: C.muted },
  rowTitle: { fontFamily: F.semi, fontSize: 16, color: C.fg, lineHeight: 21 },
  rowSub: { fontFamily: F.body, fontSize: 14, color: C.muted, lineHeight: 19 },
  chev: { fontSize: 22, color: C.faint },
  link: { fontFamily: F.semi, fontSize: 14, color: C.accentInk },
  tick: { fontFamily: F.mono, fontSize: 10, color: C.faint },
  laneHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  laneName: { flex: 1, fontFamily: F.medium, fontSize: 14, color: C.fg },
  laneMeta: { fontFamily: F.mono, fontSize: 11, color: C.muted },
  shot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  shotDate: { width: 92, fontFamily: F.mono, fontSize: 12, color: C.muted },
  shotName: { flex: 1, fontFamily: F.body, fontSize: 14, color: C.fg },
  shotDose: { fontFamily: F.monoMedium, fontSize: 13, color: C.fg },
  empty: { fontFamily: F.body, fontSize: 14, color: C.muted },
  small: { fontFamily: F.body, fontSize: 12, color: C.muted },
})
