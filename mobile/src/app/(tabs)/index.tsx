// Home: the web's Overview on a phone. What you add to your log, three numbers at a glance, the widgets, then the
// latest entries. Blood pressure sits next to Injection: weight mostly comes in from Apple Health.
import { format } from 'date-fns'
import { type Href, router } from 'expo-router'
import { SymbolView, type SymbolViewProps } from 'expo-symbols'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { type ColorValue, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Polyline } from 'react-native-svg'
import { ALL_SYMPTOMS, chipTone, customDefs, NEGATIVE, POSITIVE, ratingOf, type SymptomDef } from '@shared/lib/symptoms'
import { felt } from '@shared/lib/wellbeingSummary'
import { useBodyMetrics, useCompounds, useInjections, useSymptoms, useVitals } from '@/data/useLog'
import { useTests } from '@/labs/useTests'
import { InjectionsWidget, InsightsWidget, PressureWidget, WeightWidget, WellbeingWidget } from '@/charts/Widgets'
import { useInsights } from '@/insights/useInsights'
import { usePro } from '@/money/pro'
import { EventRow } from '@/EventRow'
import { Card, Eyebrow, Pill, Widget } from '@/kit'
import { buildEvents, dayTitle } from '@/timeline'
import { C, F, type Palette, usePalette } from '@/theme'

const DAY = 86_400_000

type Launch = { href: Href | (() => Href); label: string; sub: string; sf: SymbolViewProps['name']; color: keyof Palette; primary?: boolean }
const LAUNCH: Launch[] = [
  { href: '/log/injection', label: 'Injection', sub: 'Log a shot', sf: 'syringe.fill', color: 'primaryFg', primary: true },
  { href: '/log/bp', label: 'Blood pressure', sub: 'Log a reading', sf: 'heart.fill', color: 'rose' },
  { href: '/log/checkin', label: 'Check-in', sub: 'How you feel', sf: 'brain.head.profile', color: 'violet' },
  { href: '/log/ancillary', label: 'Ancillary', sub: 'For side effects', sf: 'pills.fill', color: 'teal' },
  { href: '/log/weight', label: 'Weight', sub: 'Log body weight', sf: 'scalemass.fill', color: 'blue' },
  { href: () => ({ pathname: '/labs', params: { add: String(Date.now()) } }), label: 'Blood test', sub: 'Import or type in', sf: 'testtube.2', color: 'good' },
]

export default function Home() {
  const insets = useSafeAreaInsets()
  const pal = usePalette()
  // The top of Home draws first; the charts below it a frame later, so the app opens without waiting on them
  const [below, setBelow] = useState(false)
  useEffect(() => void requestAnimationFrame(() => setBelow(true)), [])
  const compounds = useCompounds()
  const injections = useInjections()
  const vitals = useVitals()
  const bodyMetrics = useBodyMetrics()
  const symptoms = useSymptoms()
  const tests = useTests()
  const pro = usePro()
  const insights = useInsights({ tests, vitals, injections, compounds, bodyMetrics, symptoms, pro })

  const h = new Date().getHours()
  const greeting = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'

  // The same three numbers as the web's Overview tiles
  const bp = useMemo(() => {
    const recent = vitals.filter((v) => Date.parse(v.measuredAt) >= Date.now() - 7 * DAY)
    const avg = (xs: number[]) => Math.round(xs.reduce((a, x) => a + x, 0) / xs.length)
    const spark = vitals.slice(0, 12).reverse().map((v) => v.systolic)
    const pulses = recent.flatMap((v) => (v.pulse ? [v.pulse] : []))
    return recent.length ? { sys: avg(recent.map((v) => v.systolic)), dia: avg(recent.map((v) => v.diastolic)), pulse: pulses.length ? avg(pulses) : undefined, n: recent.length, spark } : { spark }
  }, [vitals])

  const weight = useMemo(() => {
    const pts: { ms: number; kg: number }[] = []
    for (const b of bodyMetrics) if (b.weightKg !== undefined) pts.push({ ms: Date.parse(b.measuredAt), kg: b.weightKg })
    for (const i of injections) if (i.weightKg !== undefined) pts.push({ ms: Date.parse(i.takenAt), kg: i.weightKg })
    pts.sort((a, b) => a.ms - b.ms)
    if (!pts.length) return undefined
    const last = pts[pts.length - 1]
    const prev = pts[pts.length - 2]
    return { kg: last.kg, delta: prev ? last.kg - prev.kg : undefined, spark: pts.slice(-12).map((p) => p.kg) }
  }, [bodyMetrics, injections])

  const sym = useMemo(() => {
    const recent = symptoms.filter((s) => Date.parse(s.recordedAt) >= Date.now() - 7 * DAY)
    const defs = [...ALL_SYMPTOMS, ...customDefs(recent)]
    let good = 0
    let watch = 0
    for (const s of recent)
      for (const def of defs) {
        const v = ratingOf(s, def)
        if (typeof v !== 'number') continue
        if (felt(s, def)) watch += 1
        else if (chipTone(v, def.direction) === 'good') good += 1
      }
    // The last dozen check-ins as two 0-5 lines, the same as the Wellbeing widget
    const avg = (row: (typeof symptoms)[number], ds: SymptomDef[]) => {
      const vs = ds.map((d) => ratingOf(row, d)).filter((v): v is number => typeof v === 'number')
      return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : undefined
    }
    const last = symptoms.slice(0, 12).reverse()
    const goodLine = last.map((r) => avg(r, POSITIVE)).filter((v): v is number => v !== undefined)
    const watchLine = last.map((r) => avg(r, NEGATIVE)).filter((v): v is number => v !== undefined)
    return { n: recent.length, good, watch, goodLine, watchLine }
  }, [symptoms])

  const recent = useMemo(
    // Only the newest few of each list (they come newest first): the whole history isn't needed for five rows
    () => buildEvents({ compounds, injections: injections.slice(0, 6), vitals: vitals.slice(0, 6), bodyMetrics: bodyMetrics.slice(0, 7), symptoms: symptoms.slice(0, 6), tests: tests?.slice(0, 6) }).slice(0, 5),
    [compounds, injections, vitals, bodyMetrics, symptoms, tests],
  )

  const bpColor = bp.sys === undefined ? C.fg : bp.sys >= 145 ? C.danger : bp.sys >= 135 ? C.warn : C.good

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={[st.page, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 90 }]}>
      <View>
        <Eyebrow>{format(new Date(), 'EEEE, d MMMM')}</Eyebrow>
        <Text style={st.h1}>{greeting}</Text>
      </View>

      <View style={{ gap: 12 }}>
        <Eyebrow>Add to your log</Eyebrow>
        <View style={st.grid}>
          {LAUNCH.map((l) => (
            <Pressable
              key={l.label}
              accessibilityRole="button"
              accessibilityLabel={`${l.label}, ${l.sub}`}
              onPress={() => (typeof l.href === 'function' ? router.navigate(l.href()) : router.push(l.href))}
              style={({ pressed }) => [st.launch, l.primary && st.launchPrimary, pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 }]}
            >
              <View style={[st.launchIcon, { backgroundColor: l.primary ? C.primary : pal[l.color] + '1f' }]}>
                <SymbolView name={l.sf} tintColor={pal[l.color]} size={20} />
              </View>
              <View>
                <Text style={st.launchLabel}>{l.label}</Text>
                <Text style={st.launchSub}>{l.sub}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={st.stats}>
        <Stat label="Pressure" value={bp.sys !== undefined ? `${bp.sys}/${bp.dia}` : '–'} color={bpColor} sub={bp.n ? (bp.pulse ? `${bp.pulse} bpm · 7-day avg` : `7-day avg · ${bp.n}×`) : 'No readings'} spark={bp.spark} />
        <Stat
          label="Weight"
          value={weight ? String(weight.kg) : '–'}
          unit={weight ? 'kg' : undefined}
          sub={weight ? (weight.delta !== undefined && Math.abs(weight.delta) >= 0.05 ? `${weight.delta > 0 ? '+' : ''}${weight.delta.toFixed(1)} kg` : 'No change') : 'Not logged'}
          spark={weight?.spark}
        />
        <Stat
          label="Wellbeing"
          value={sym.n ? <><Text style={{ color: C.good }}>{sym.good}</Text><Text style={{ color: C.faint }}> / </Text><Text style={{ color: C.danger }}>{sym.watch}</Text></> : '–'}
          sub={sym.n ? 'good / watch' : 'None in 7d'}
          lines={sym.goodLine.length > 1 ? [{ values: sym.goodLine, color: pal.good }, { values: sym.watchLine, color: pal.danger }] : undefined}
        />
      </View>

      <InsightsWidget insights={insights} />
      {below ? (
        <>
      <InjectionsWidget compounds={compounds} injections={injections} />
      <WellbeingWidget symptoms={symptoms} compounds={compounds} injections={injections} />
      <WeightWidget bodyMetrics={bodyMetrics} injections={injections} />
      <PressureWidget vitals={vitals} />
        </>
      ) : null}

      <Widget
        eyebrow="Latest"
        title={recent.length ? 'What you logged last' : 'Nothing logged yet'}
        sub={recent.length ? undefined : 'Start with your next injection, or a weight or blood pressure reading.'}
        action={recent.length ? <Pill label="See all" onPress={() => router.navigate('/timeline')} /> : undefined}
      >
        {recent.length ? (
          <View>
            {recent.map((e, i) => (
              <Fragment key={e.id}>
                {i ? <View style={st.sep} /> : null}
                <EventRow e={e} showDay={dayTitle(e.date)} />
              </Fragment>
            ))}
          </View>
        ) : null}
      </Widget>
    </ScrollView>
  )
}

function Stat({ label, value, unit, sub, color = C.fg, spark, lines }: {
  label: string
  value: React.ReactNode
  unit?: string
  sub: string
  color?: ColorValue
  spark?: number[]
  /** Two or more lines on a fixed 0-5 scale (check-ins) */
  lines?: { values: number[]; color: string }[]
}) {
  return (
    <Card style={st.stat}>
      <Eyebrow>{label}</Eyebrow>
      <Text style={[st.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={st.statUnit}> {unit}</Text> : null}
      </Text>
      <Text style={st.statSub} numberOfLines={1}>{sub}</Text>
      {spark && spark.length > 1 ? <Spark values={spark} /> : null}
      {lines ? <Spark lines={lines} /> : null}
    </Card>
  )
}

/** The web's MiniSpark: a normalised line over the last dozen values; or several lines on a 0-5 scale. */
function Spark({ values, lines }: { values?: number[]; lines?: { values: number[]; color: string }[] }) {
  const pal = usePalette()
  const W = 100
  const H = 24
  const series = lines ?? [{ values: values ?? [], color: pal.muted }]
  const min = lines ? 0 : Math.min(...series[0].values)
  const span = lines ? 5 : Math.max(...series[0].values) - min || 1
  const pts = (vs: number[]) => vs.map((v, i) => [(i / Math.max(1, vs.length - 1)) * W, H - ((v - min) / span) * (H - 4) - 2])
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: 22, width: '100%', marginTop: 8 }}>
      {series.map((sr) => {
        if (sr.values.length < 2) return null
        const p = pts(sr.values)
        const [lx, ly] = p[p.length - 1]
        return (
          <Fragment key={sr.color}>
            <Polyline points={p.map((x) => x.join(',')).join(' ')} fill="none" stroke={sr.color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <Circle cx={lx} cy={ly} r={2} fill={sr.color} />
          </Fragment>
        )
      })}
    </Svg>
  )
}

const st = StyleSheet.create({
  page: { paddingHorizontal: 16, gap: 20 },
  h1: { fontFamily: F.semi, fontSize: 32, letterSpacing: -0.6, color: C.fg, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  launch: {
    width: '48%', flexGrow: 1, minHeight: 104, borderRadius: 18, padding: 14, gap: 10, justifyContent: 'space-between',
    backgroundColor: C.card, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line,
  },
  launchPrimary: { borderWidth: 1, borderColor: C.primaryLine, backgroundColor: C.primarySoft, boxShadow: '0 0 24px -6px rgba(251,182,54,0.4)' },
  launchIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  launchLabel: { fontFamily: F.semi, fontSize: 16, color: C.fg, letterSpacing: -0.2 },
  launchSub: { fontFamily: F.body, fontSize: 13, color: C.muted, marginTop: 2 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, padding: 12, borderRadius: 14 },
  statValue: { fontFamily: F.monoSemi, fontSize: 20, marginTop: 8 },
  statUnit: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  statSub: { fontFamily: F.body, fontSize: 12, color: C.muted, marginTop: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontFamily: F.semi, fontSize: 15, color: C.accentInk },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginLeft: 46 },
  empty: { fontFamily: F.body, fontSize: 15, color: C.muted, lineHeight: 21, paddingVertical: 14 },
})
