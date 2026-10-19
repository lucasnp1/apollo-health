// Home's widgets, one job each, all on the same head (kit Widget): what needs a look (it reads the bloods too, so
// there's no separate bloods widget), injections, wellbeing with the ancillaries taken for it, weight, blood pressure.
// Each has its own time range. Nothing here models a level or works out a dose: injections show what was logged
// (docs/decisions.md).
import { format } from 'date-fns'
import { router } from 'expo-router'
import { Fragment, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg'
import type { BodyMetric, Compound, InjectionLog, Symptom, VitalLog } from '@shared/lib/db'
import { compoundGroups } from '@shared/lib/compounds'
import { fmtDay } from '@shared/lib/dates'
import { countLine } from '@shared/lib/homeInsights'
import { NEGATIVE, POSITIVE } from '@shared/lib/symptoms'
import { type HomeInsight, openInsight } from '@/insights/useInsights'
import { type RangeId, RangeMenu, rangeDomain, Widget } from '@/kit'
import { doseText, ratingMean, weightPoints } from '@/log'
import { isAncillary } from '@/timeline'
import { C, F, type Tone, toneHex, usePalette } from '@/theme'
import { dateTicks, fmtTick, PAD, TimeChart } from './TimeChart'

// Checked with the dataviz validator on the dark card (#15171a)
const SYS = '#f43f5e'
const DIA = '#3b82f6'
const GOOD = '#10b981'
const PULSE = '#a78bfa'

function ToneChip({ label, tone }: { label: string; tone: Tone }) {
  const t = toneHex(usePalette(), tone)
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


const IN_RANGE: Record<RangeId, string> = { '1W': 'in the last 7 days', '1M': 'in the last month', '3M': 'in the last 3 months', '6M': 'in the last 6 months', '1Y': 'in the last year', ALL: 'in all' }

/** Each compound's lane of shots: a dot per shot with its dose, only compounds with a shot in the range. */
function useLanes(compounds: Compound[], shots: InjectionLog[], domain: [number, number]) {
  return useMemo(
    () =>
      compoundGroups(compounds, shots)
        .map((g) => ({
          ...g,
          shots: shots
            .filter((i) => g.ids.includes(i.compoundId) && Date.parse(i.takenAt) >= domain[0] && Date.parse(i.takenAt) <= domain[1])
            .sort((a, b) => a.takenAt.localeCompare(b.takenAt)),
        }))
        .filter((g) => g.shots.length)
        .sort((a, b) => b.shots[b.shots.length - 1].takenAt.localeCompare(a.shots[a.shots.length - 1].takenAt)),
    [compounds, shots, domain[0]],
  )
}

/**
 * Every shot logged in the range, per compound: when, and how much. A compound with no shot in the range (stopped, or
 * not pinned lately) doesn't show. Ancillaries taken by mouth are on Wellbeing, not here.
 */
export function InjectionsWidget({ compounds, injections }: { compounds: Compound[]; injections: InjectionLog[] }) {
  const pal = usePalette()
  const [range, setRange] = useState<RangeId>('1W')
  const shots = useMemo(() => injections.filter((i) => !isAncillary(i)), [injections])
  const domain = rangeDomain(range, shots.map((i) => Date.parse(i.takenAt)))
  const lanes = useLanes(compounds, shots, domain)
  const last = shots[0]
  const total = lanes.reduce((n, l) => n + l.shots.length, 0)
  const all = () => router.navigate({ pathname: '/timeline', params: { kind: 'injection', range, at: String(Date.now()) } })
  return (
    <Widget
      eyebrow="Injections"
      title={!last ? 'No shots logged' : total ? `${total} shot${total === 1 ? '' : 's'} ${IN_RANGE[range]}` : `No shots ${IN_RANGE[range]}`}
      sub={last ? `Last shot ${fmtDay(last.takenAt)}, ${format(Date.parse(last.takenAt), 'HH:mm')}` : 'Log a shot from Add to your log.'}
      action={<RangeMenu value={range} onChange={setRange} />}
    >
      {lanes.length ? (
        <>
          {lanes.map((l) => (
            <Lane key={l.key} name={l.name} color={l.color ?? pal.primary} shots={l.shots} domain={domain} labels={range === '1W' || range === '1M'} />
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {dateTicks(domain, 3).map((t) => (
              <Text key={t} style={w.tick}>{fmtTick(t, domain)}</Text>
            ))}
          </View>
          <Pressable onPress={all} hitSlop={8} accessibilityRole="link">
            <Text style={w.link}>See all {total} in Timeline ›</Text>
          </Pressable>
        </>
      ) : null}
    </Widget>
  )
}

/** One compound: its name, count and last dose, then a dot per shot on the time axis, labelled with the dose when there's room. */
function Lane({ name, color, shots, domain, labels, chart }: {
  name: string
  color: string
  shots: InjectionLog[]
  domain: [number, number]
  labels: boolean
  /** Line its dots up with a TimeChart above it */
  chart?: boolean
}) {
  const pal = usePalette()
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
        <Text style={w.laneMeta}>{shots.length} · last {doseText(lastShot, { drew: true })} {format(Date.parse(lastShot.takenAt), 'EEE d MMM')}</Text>
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={[{ height: H }, chart && { marginLeft: PAD.l - 6, marginRight: PAD.r - 6 }]}>
        {width ? (
          <Svg width={width} height={H}>
            <Line x1={0} x2={width} y1={H - 8} y2={H - 8} stroke={pal.line} strokeWidth={1} />
            {shots.map((s) => {
              const cx = x(Date.parse(s.takenAt))
              const show = labels && cx - lastLabelX > 34
              if (show) lastLabelX = cx
              return (
                <Fragment key={s.id}>
                  <Circle cx={cx} cy={H - 8} r={4.5} fill={color} stroke={pal.card} strokeWidth={2} />
                  {show ? (
                    <SvgText x={cx} y={H - 18} fontSize={10} fontFamily={F.mono} fill={pal.muted} textAnchor="middle">
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

// ── Wellbeing ────────────────────────────────────────────────────────────────

/** How you've been: the feel-good average and the side-effect average per check-in, 0 to 5, and a check-in button. */
export function WellbeingWidget({ symptoms, compounds, injections }: { symptoms: Symptom[]; compounds: Compound[]; injections: InjectionLog[] }) {
  const pal = usePalette()
  const [range, setRange] = useState<RangeId>('3M')
  const domain = rangeDomain(range, symptoms.map((s) => Date.parse(s.recordedAt)))
  // What you took for side effects, on the same time axis as the side-effect line
  const ancillaries = useMemo(() => injections.filter(isAncillary), [injections])
  const lanes = useLanes(compounds, ancillaries, domain)
  const inRange = symptoms.filter((s) => Date.parse(s.recordedAt) >= domain[0]).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
  const good = inRange.flatMap((s) => {
    const v = ratingMean(s, POSITIVE)
    return v === undefined ? [] : [{ t: Date.parse(s.recordedAt), v }]
  })
  const watch = inRange.flatMap((s) => {
    const v = ratingMean(s, NEGATIVE)
    return v === undefined ? [] : [{ t: Date.parse(s.recordedAt), v }]
  })
  const lastAt = symptoms[0]?.recordedAt
  return (
    <Widget
      eyebrow="Wellbeing"
      title={symptoms.length ? `${inRange.length} check-in${inRange.length === 1 ? '' : 's'} in this range` : 'How have you been feeling?'}
      sub={lastAt ? `Last check-in ${fmtDay(lastAt)}` : 'Mood, energy, sleep, libido and side effects, in ten seconds.'}
      action={<RangeMenu value={range} onChange={setRange} />}
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
          {lanes.length ? (
            <View style={{ gap: 8 }}>
              <Text style={w.small}>Ancillaries taken</Text>
              {lanes.map((l) => (
                <Lane key={l.key} name={l.name} color={l.color ?? pal.primary} shots={l.shots} domain={domain} labels={range === '1W' || range === '1M'} chart />
              ))}
            </View>
          ) : null}
          <Text style={w.small}>Averages per check-in, 0 to 5.</Text>
        </>
      ) : symptoms.length ? (
        <Text style={w.empty}>No check-ins in this range.</Text>
      ) : null}
    </Widget>
  )
}

// ── Weight and blood pressure ────────────────────────────────────────────────

export function WeightWidget({ bodyMetrics, injections }: { bodyMetrics: BodyMetric[]; injections: InjectionLog[] }) {
  const pal = usePalette()
  const [range, setRange] = useState<RangeId>('3M')
  const pts = weightPoints(bodyMetrics, injections)
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
      {shown.length ? <TimeChart series={[{ label: 'Weight', color: pal.primary, points: shown }]} unit="kg" domain={domain} /> : <Text style={w.empty}>No weight in this range.</Text>}
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
  const pulses = shown.flatMap((v) => (v.pulse ? [v.pulse] : []))
  return (
    <Widget
      eyebrow="Blood pressure"
      title={shown.length ? `${avg(shown.map((v) => v.systolic))}/${avg(shown.map((v) => v.diastolic))} average` : 'No readings in this range'}
      sub={pulses.length ? `Pulse ${avg(pulses)} bpm average` : undefined}
      action={<RangeMenu value={range} onChange={setRange} />}
    >
      {shown.length ? (
        <TimeChart
          series={[
            { label: 'Systolic', color: SYS, points: shown.map((v) => ({ t: Date.parse(v.measuredAt), v: v.systolic })) },
            { label: 'Diastolic', color: DIA, points: shown.map((v) => ({ t: Date.parse(v.measuredAt), v: v.diastolic })) },
            { label: 'Pulse', color: PULSE, points: shown.flatMap((v) => (v.pulse ? [{ t: Date.parse(v.measuredAt), v: v.pulse }] : [])) },
          ].filter((x) => x.points.length)}
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
  empty: { fontFamily: F.body, fontSize: 14, color: C.muted },
  small: { fontFamily: F.body, fontSize: 12, color: C.muted },
})
