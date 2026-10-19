// A time series in the web's instrument look: one y-axis, thin 2px lines, ringed dots, a recessive grid, the lab's
// range as a faint band. Press and drag across it to read any point; the row above names each series (the legend)
// and shows the latest values until you do. Drawn with react-native-svg: @expo/ui's Chart has one series and no date
// axis.
import { format } from 'date-fns'
import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg'
import { C, F, usePalette } from '@/theme'

export type Pt = { t: number; v: number }
export type Series = { label: string; color: string; points: Pt[] }
export type Domain = [number, number]

export const PAD = { l: 34, r: 10, t: 8, b: 20 }

/** Round ticks that frame lo..hi: the first at or below lo, the last at or above hi, three to five in all */
export function niceTicks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo || Math.abs(hi) || 1
  const raw = span / (n - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.floor(lo / step) * step; v < hi + step - step * 1e-9; v += step) out.push(Number(v.toPrecision(6)))
  return out
}

export const dateTicks = ([t0, t1]: Domain, n = 4) => Array.from({ length: n }, (_, i) => t0 + ((t1 - t0) * i) / (n - 1))
export const fmtTick = (t: number, [t0, t1]: Domain) => format(t, t1 - t0 > 400 * 86_400_000 ? 'MMM yy' : 'd MMM')
const fmtV = (v: number) => String(Number(v.toPrecision(4)))

export function TimeChart({ series, domain, band, unit, height = 150, yRange }: {
  series: Series[]
  domain: Domain
  /** the lab's reference range, shaded */
  band?: { low?: number; high?: number }
  unit?: string
  height?: number
  /** a fixed scale, e.g. [0, 5] for check-in averages */
  yRange?: [number, number]
}) {
  const pal = usePalette()
  const [w, setW] = useState(0)
  const [at, setAt] = useState<number | undefined>()

  const { y, ticks } = useMemo(() => {
    const vs = series.flatMap((s) => s.points.map((p) => p.v)).concat([band?.low, band?.high].filter((v): v is number => v !== undefined))
    const ticks = yRange ? Array.from({ length: yRange[1] - yRange[0] + 1 }, (_, i) => yRange[0] + i) : niceTicks(Math.min(...vs), Math.max(...vs))
    const lo = ticks[0]
    const hi = ticks[ticks.length - 1]
    const ih = height - PAD.t - PAD.b
    return { y: (v: number) => PAD.t + ih - ((v - lo) / (hi - lo)) * ih, ticks }
  }, [series, band, height, yRange?.[0], yRange?.[1]])

  const iw = Math.max(1, w - PAD.l - PAD.r)
  const x = (t: number) => PAD.l + ((t - domain[0]) / (domain[1] - domain[0] || 1)) * iw
  const tAt = (px: number) => domain[0] + ((px - PAD.l) / iw) * (domain[1] - domain[0])

  // The point of each series nearest the finger, or each series' latest
  const shown = series.map((s) => {
    if (!s.points.length) return undefined
    if (at === undefined) return s.points[s.points.length - 1]
    return s.points.reduce((a, b) => (Math.abs(b.t - at) < Math.abs(a.t - at) ? b : a))
  })
  const when = at === undefined ? shown.find(Boolean)?.t : shown.filter(Boolean).reduce((a, b) => (Math.abs(b!.t - at) < Math.abs(a!.t - at) ? b : a), shown.find(Boolean))?.t

  const scrub = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onBegin((e) => setAt(tAt(e.x)))
    .onUpdate((e) => setAt(tAt(e.x)))
    .onFinalize(() => setAt(undefined))

  return (
    <View>
      <View style={c.readout}>
        {series.map((s, i) => (
          <View key={s.label} style={c.item}>
            <View style={[c.dot, { backgroundColor: s.color }]} />
            <Text style={c.label}>{s.label}</Text>
            <Text style={c.value}>{shown[i] ? fmtV(shown[i]!.v) : '–'}</Text>
          </View>
        ))}
        {unit ? <Text style={c.unit}>{unit}</Text> : null}
        <Text style={c.when}>{when !== undefined ? format(when, 'd MMM yyyy') : ''}</Text>
      </View>
      <GestureDetector gesture={scrub}>
        <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }} collapsable={false}>
          {w ? (
            <Svg width={w} height={height}>
              {band && (band.low !== undefined || band.high !== undefined) ? (
                <Rect
                  x={PAD.l}
                  width={iw}
                  y={y(band.high ?? Math.max(...ticks))}
                  height={Math.max(0, y(band.low ?? Math.min(...ticks)) - y(band.high ?? Math.max(...ticks)))}
                  fill={pal.good}
                  opacity={0.08}
                />
              ) : null}
              {ticks.map((v) => (
                <Line key={v} x1={PAD.l} x2={w - PAD.r} y1={y(v)} y2={y(v)} stroke={pal.line} strokeWidth={StyleSheet.hairlineWidth} />
              ))}
              {ticks.map((v) => (
                <SvgText key={`l${v}`} x={PAD.l - 6} y={y(v) + 3.5} fontSize={10} fontFamily={F.mono} fill={pal.faint} textAnchor="end">{fmtV(v)}</SvgText>
              ))}
              {dateTicks(domain).map((t, i, all) => (
                <SvgText key={t} x={x(t)} y={height - 5} fontSize={10} fontFamily={F.mono} fill={pal.faint} textAnchor={i === 0 ? 'start' : i === all.length - 1 ? 'end' : 'middle'}>
                  {fmtTick(t, domain)}
                </SvgText>
              ))}
              {series.map((s) =>
                s.points.length > 1 ? (
                  <Polyline key={s.label} points={s.points.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                ) : null,
              )}
              {series.map((s) =>
                s.points.length <= 14 ? s.points.map((p) => <Circle key={`${s.label}${p.t}`} cx={x(p.t)} cy={y(p.v)} r={4} fill={s.color} stroke={pal.card} strokeWidth={2} />) : null,
              )}
              {at !== undefined && when !== undefined ? (
                <>
                  <Line x1={x(when)} x2={x(when)} y1={PAD.t} y2={height - PAD.b} stroke={pal.muted} strokeWidth={1} />
                  {series.map((s, i) => (shown[i] ? <Circle key={`h${s.label}`} cx={x(shown[i]!.t)} cy={y(shown[i]!.v)} r={5} fill={s.color} stroke={pal.fg} strokeWidth={2} /> : null))}
                </>
              ) : null}
            </Svg>
          ) : null}
        </View>
      </GestureDetector>
    </View>
  )
}

const c = StyleSheet.create({
  readout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 14, rowGap: 4, marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, alignSelf: 'center' },
  label: { fontFamily: F.body, fontSize: 13, color: C.muted },
  value: { fontFamily: F.monoSemi, fontSize: 15, color: C.fg },
  unit: { fontFamily: F.mono, fontSize: 12, color: C.muted, marginLeft: -8 },
  when: { marginLeft: 'auto', fontFamily: F.mono, fontSize: 12, color: C.faint },
})
